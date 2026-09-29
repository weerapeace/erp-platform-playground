/**
 * POST /api/purchasing/vouchers/<id>/void — ยกเลิกใบสำคัญรับ "ที่ยืนยันแล้ว" (ใส่ราคา/ค่าส่งผิด)
 *   body: { reason }  (บังคับ)
 *   1. ย้อนราคาที่ใบนี้เขียนกลับระบบ (บรรทัด PO · ราคาต่อร้าน · ราคาบน SKU) — เฉพาะจุดที่ยังเป็นราคาของใบนี้
 *      ถ้ามีคนแก้ราคาทีหลังแล้ว จะไม่ไปทับ (รายงานกลับว่า "คงไว้")
 *   2. ปล่อยใบรับ (GR) กลับไปคิว "รอออกใบสำคัญ" → ออกใบใหม่ที่ถูกต้องได้
 *   3. ใบเดิมเป็นสถานะ "ยกเลิก" เก็บเลขที่ + รายการไว้ดูย้อนหลัง (ไม่ลบ)
 * ใบร่างใช้ DELETE /api/purchasing/vouchers/<id> (ของเดิม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { restoreLinePrices, type PriceSnapshot, type RestoreResult } from "@/lib/po-line-price";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;
  const { id } = await params;

  let body: { reason?: string };
  try { body = await request.json(); } catch { body = {}; }
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "ต้องระบุเหตุผลที่ยกเลิก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("purchase_vouchers_v2").select("id, status, pv_no, note, shipping_payment_status").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  const c = cur as Row;
  if (c.status === "draft") return NextResponse.json({ error: "ใบนี้ยังเป็นร่าง — ใช้ปุ่ม “ยกเลิกใบร่าง”" }, { status: 400 });
  if (c.status !== "confirmed") return NextResponse.json({ error: "ใบนี้ถูกยกเลิกไปแล้ว" }, { status: 400 });
  if (c.shipping_payment_status === "paid") return NextResponse.json({ error: "ใบนี้มาร์ค “จ่ายค่าส่งแล้ว” — กดยกเลิกการจ่ายค่าส่งก่อน แล้วค่อยยกเลิกใบ" }, { status: 400 });

  // ราคาเดิมที่จดไว้ตอนยืนยัน
  const { data: logs } = await admin.from("audit_logs").select("metadata, created_at")
    .eq("entity_type", "purchase_vouchers_v2").eq("entity_id", id).eq("action", "confirm").order("created_at", { ascending: false }).limit(1);
  const meta = ((logs ?? [])[0] as Row | undefined)?.metadata as Row | undefined;
  const snaps = Array.isArray(meta?.price_before) ? (meta?.price_before as PriceSnapshot[]) : null;

  let restored: RestoreResult[] = [];
  if (snaps) restored = await restoreLinePrices(admin, snaps, { actorId: user?.id ?? null, actorName, refLabel: `ยกเลิก ${String(c.pv_no ?? "")}` });

  // ปล่อยใบรับกลับคิว
  const { data: grs } = await admin.from("goods_receipts_v2").update({ voucher_id: null }).eq("voucher_id", id).select("gr_no");

  const stamp = `[ยกเลิก ${new Date().toISOString().slice(0, 10)}] ${reason}`;
  const { error } = await admin.from("purchase_vouchers_v2")
    .update({ status: "cancelled", note: c.note ? `${String(c.note)}\n${stamp}` : stamp, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกสถานะไม่สำเร็จ: " + error.message }, { status: 500 });

  const kept = restored.filter((r) => r.po === "kept" || r.sku === "kept" || r.price_list === "kept");
  await writeAudit(admin, {
    action: "cancel", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName,
    metadata: { pv_no: c.pv_no ?? null, reason, was: "confirmed", released_gr: ((grs ?? []) as Row[]).map((g) => g.gr_no), price_restore: snaps ? restored : "no_snapshot" },
  });
  return NextResponse.json({
    ok: true, error: null,
    released_gr: ((grs ?? []) as Row[]).length,
    price_restored: snaps ? restored.length - kept.length : 0,
    price_kept: kept.map((k) => k.line),
    no_snapshot: !snaps,
  });
}
