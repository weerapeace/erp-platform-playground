/**
 * POST /api/purchasing/cancel-line
 * ยกเลิก "บรรทัดสินค้า" ในใบสั่งซื้อ — เคสสั่งไปแล้วแต่ร้านไม่มีของ
 *
 * body: { po_line_ids: string[], reason?: string, actor?: string }
 *
 * ผล:
 *  - บรรทัด → line_status = "short_closed" (ปิดยอด = ไม่รอของที่เหลือแล้ว · ทุกหน้าถือว่า "จบ" อยู่แล้ว)
 *    ของที่รับไปแล้ว (qty_received) ไม่ถูกแตะ — ยกเลิกเฉพาะส่วนที่ยังค้าง
 *  - เก็บเหตุผล + วันที่ + คนทำ ต่อท้าย note ของบรรทัด (ย้อนดูได้)
 *  - สรุปสถานะใบ PO ใหม่: ยกเลิกหมดทั้งใบ+ไม่เคยรับอะไรเลย → cancelled ·
 *    ปิดครบทุกบรรทัดแต่มีของเข้าบ้าง → received · มีของเข้าบางส่วน → partial · นอกนั้นคงเดิม
 *  - audit log 1 แถวต่อ 1 บรรทัด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditMany, type AuditEntry } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const CLOSED = ["received", "short_closed", "closed_short", "cancelled"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { po_line_ids?: unknown; reason?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ids = Array.isArray(body.po_line_ids) ? [...new Set(body.po_line_ids.map(String).filter(Boolean))] : [];
  if (ids.length === 0) return NextResponse.json({ error: "ไม่ได้เลือกรายการที่จะยกเลิก" }, { status: 400 });

  const reason = String(body.reason ?? "").trim() || "ร้านไม่มีของ";
  const actor = body.actor || user.email || "system";
  const admin = supabaseAdmin();

  const { data: lines, error: lErr } = await admin
    .from("purchase_order_lines_v2")
    .select("id, po_id, item_name, qty, qty_received, line_status, note")
    .in("id", ids);
  if (lErr) return NextResponse.json({ error: "อ่านบรรทัดใบสั่งซื้อไม่สำเร็จ: " + lErr.message }, { status: 500 });

  const target = (lines ?? []).filter((l) => !CLOSED.includes(String(l.line_status ?? "")));
  if (target.length === 0) return NextResponse.json({ error: "รายการที่เลือกปิด/ยกเลิกไปแล้ว" }, { status: 400 });

  // วันที่แบบไทย (ไม่พึ่ง timezone ของเซิร์ฟเวอร์ — บันทึกเป็นวันที่ไทยเสมอ)
  const stamp = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const poIds = [...new Set(target.map((l) => String(l.po_id)))];

  const auditRows: AuditEntry[] = [];
  for (const l of target) {
    const remaining = Math.max(0, num(l.qty) - num(l.qty_received));
    const mark = `❌ ยกเลิก ${stamp}: ${reason} (โดย ${actor})`;
    const note = [String(l.note ?? "").trim(), mark].filter(Boolean).join("\n");
    const { error: uErr } = await admin
      .from("purchase_order_lines_v2")
      .update({ line_status: "short_closed", note })
      .eq("id", l.id);
    if (uErr) return NextResponse.json({ error: "ยกเลิกไม่สำเร็จ: " + uErr.message }, { status: 500 });

    auditRows.push({
      action:     "cancel",
      entityType: "purchase_order_lines_v2",
      entityId:   String(l.id),
      actorId:    user.id,
      actorName:  actor,
      metadata:   { item_name: l.item_name, qty_cancelled: remaining, qty_ordered: num(l.qty), qty_received: num(l.qty_received), reason },
    });
  }
  await writeAuditMany(admin, auditRows);

  // สรุปสถานะใบ PO ใหม่ (ทีละใบ)
  const poStatuses: Record<string, string> = {};
  for (const poId of poIds) {
    const { data: after } = await admin
      .from("purchase_order_lines_v2").select("line_status, qty_received").eq("po_id", poId);
    const all = after ?? [];
    if (all.length === 0) continue;
    const allClosed = all.every((l) => CLOSED.includes(String(l.line_status ?? "")));
    const totalReceived = all.reduce((s, l) => s + num(l.qty_received), 0);
    // ไม่เคยรับของเลย + ปิดครบทุกบรรทัด = ใบนี้ยกเลิกทั้งใบ
    const next = allClosed ? (totalReceived > 0 ? "received" : "cancelled") : (totalReceived > 0 ? "partial" : null);
    if (!next) continue;   // ยังมีบรรทัดค้าง + ยังไม่เคยรับ → สถานะใบเดิมถูกอยู่แล้ว ไม่ต้องแตะ
    await admin.from("purchase_orders_v2").update({ status: next }).eq("id", poId);
    poStatuses[poId] = next;
  }

  return NextResponse.json({ ok: true, cancelled: target.length, po_statuses: poStatuses, error: null });
}
