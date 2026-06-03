/**
 * POST /api/purchasing/receive
 * รับสินค้าเข้า (Goods Receipt) ตามใบสั่งซื้อ (PO) — ทำงานราย "บรรทัดสินค้า"
 *
 * body: {
 *   po_id, receive_date?, receiver?, note?, actor?,
 *   lines: [{ po_line_id, qty_received, qty_defective?, case_type }]
 * }
 * case_type: full | partial_close | partial_wait | full_defective
 *
 * ผล:
 *  - สร้างเอกสาร GR (หัว + รายการ) เก็บประวัติการรับครั้งนี้
 *  - อัปเดตบรรทัด PO: qty_received += , qty_defective += , line_status ตามเคส
 *  - อัปเดตสถานะ PO รวม (partial / received)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

type InLine = { po_line_id: string; qty_received: number; qty_defective?: number; case_type: string };

// เคส → สถานะบรรทัด
const CASE_STATUS: Record<string, string> = {
  full: "received",
  partial_close: "short_closed",
  partial_wait: "partial",
  full_defective: "received",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { po_id?: string; receive_date?: string; receiver?: string; note?: string; actor?: string; lines?: unknown; receipt_doc_r2_key?: string; bill_doc_r2_key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const poId = body.po_id;
  const inLines = Array.isArray(body.lines) ? (body.lines as InLine[]) : [];
  if (!poId) return NextResponse.json({ error: "ไม่ระบุ PO" }, { status: 400 });
  const valid = inLines.filter((l) => l && l.po_line_id && (num(l.qty_received) > 0 || num(l.qty_defective) > 0));
  if (valid.length === 0) return NextResponse.json({ error: "ไม่มีรายการรับ (กรอกจำนวนรับ/เสียอย่างน้อย 1 รายการ)" }, { status: 400 });

  const admin = supabaseAdmin();

  // โหลด PO + บรรทัด
  const { data: po, error: poErr } = await admin
    .from("purchase_orders_v2").select("id, po_no, seller_name").eq("id", poId).maybeSingle();
  if (poErr || !po) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });

  const { data: poLines, error: plErr } = await admin
    .from("purchase_order_lines_v2")
    .select("id, item_sku_id, item_name, qty, uom, qty_received, qty_defective")
    .eq("po_id", poId);
  if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 });
  const lineById = new Map((poLines ?? []).map((l) => [String(l.id), l as Record<string, unknown>]));

  const actor = body.actor ?? user.email ?? "system";
  const now = new Date();
  // เลขใบรับ: ใช้ระบบเลขเอกสารกลาง erp_next_number('gr') — atomic กันเลขซ้ำ
  const { data: grNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "gr" });
  if (numErr || !grNo) return NextResponse.json({ error: "ออกเลขใบรับไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });
  const receiveDate = body.receive_date || now.toISOString().slice(0, 10);

  // 1) หัว GR
  const { data: gr, error: grErr } = await admin
    .from("goods_receipts_v2")
    .insert({ gr_no: grNo, po_id: poId, po_no: po.po_no, seller_name: po.seller_name, receive_date: receiveDate, receiver: body.receiver ?? actor, note: body.note ?? null, status: "done", receipt_doc_r2_key: body.receipt_doc_r2_key ?? null, bill_doc_r2_key: body.bill_doc_r2_key ?? null })
    .select("id").single();
  if (grErr || !gr) return NextResponse.json({ error: "สร้างใบรับไม่สำเร็จ: " + (grErr?.message ?? "") }, { status: 500 });

  // 2) รายการ GR + อัปเดตบรรทัด PO
  const grLines: Record<string, unknown>[] = [];
  let i = 0;
  for (const l of valid) {
    const pl = lineById.get(String(l.po_line_id));
    if (!pl) continue;
    const recNow = num(l.qty_received);
    const defNow = num(l.qty_defective);
    const caseType = CASE_STATUS[l.case_type] ? l.case_type : "partial_wait";
    grLines.push({
      gr_id: gr.id, po_line_id: l.po_line_id, item_sku_id: pl.item_sku_id, item_name: pl.item_name,
      qty_ordered: num(pl.qty), qty_received: recNow, qty_defective: defNow, case_type: caseType,
      uom: pl.uom, sort_order: i++,
    });
    const newReceived = num(pl.qty_received) + recNow;
    const newDefective = num(pl.qty_defective) + defNow;
    const { error: updErr } = await admin
      .from("purchase_order_lines_v2")
      .update({ qty_received: newReceived, qty_defective: newDefective, line_status: CASE_STATUS[caseType] })
      .eq("id", l.po_line_id);
    if (updErr) return NextResponse.json({ error: "อัปเดตบรรทัด PO ไม่สำเร็จ: " + updErr.message }, { status: 500 });
  }
  if (grLines.length > 0) {
    const { error: glErr } = await admin.from("goods_receipt_lines_v2").insert(grLines);
    if (glErr) return NextResponse.json({ error: "บันทึกรายการรับไม่สำเร็จ: " + glErr.message }, { status: 500 });
  }

  // 3) สถานะ PO รวม — โหลดบรรทัดล่าสุดแล้วสรุป
  const { data: after } = await admin
    .from("purchase_order_lines_v2").select("line_status, qty_received").eq("po_id", poId);
  const all = after ?? [];
  const allClosed = all.length > 0 && all.every((l) => l.line_status === "received" || l.line_status === "short_closed");
  const anyReceived = all.some((l) => num(l.qty_received) > 0 || l.line_status === "received" || l.line_status === "short_closed");
  const poStatus = allClosed ? "received" : anyReceived ? "partial" : "confirmed";
  await admin.from("purchase_orders_v2").update({ status: poStatus }).eq("id", poId);

  // 4) audit — 1 แถวต่อ 1 ใบรับ (ของกลาง, เขียนลงตาราง audit_logs จริง)
  await writeAudit(admin, {
    action:     "receive",
    entityType: "goods_receipts_v2",
    entityId:   gr.id,
    actorId:    user.id,
    actorName:  actor,
    metadata:   { gr_no: grNo, po_no: po.po_no, lines: grLines.length, po_status: poStatus },
  });

  return NextResponse.json({ ok: true, gr_no: grNo, po_status: poStatus, line_count: grLines.length, error: null });
}
