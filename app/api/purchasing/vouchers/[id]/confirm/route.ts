/**
 * POST /api/purchasing/vouchers/<id>/confirm — ยืนยันใบสำคัญรับ
 *   1. ตรวจ: ทุกรายการมีราคา · สกุลต่างประเทศต้องมีเรท
 *   2. ออกเลข PV{YYYY}-{MM}-{DD}-{000} ตามวันที่ใบ (assignVoucherNumber → DB erp_pv_assign_number · ใบร่างมีเลขแล้ว = คงเดิม)
 *   3. เขียนราคากลับ (ของกลาง lib/po-line-price): บรรทัด PO + ยอดรวมใบ · ราคาต่อร้านของ SKU · ราคาบน SKU (ไม่รวมค่าส่ง)
 *   4. สถานะ confirmed + audit log (จด "ราคาก่อนเขียนทับ" ไว้ด้วย → ใช้ย้อนราคาเมื่อยกเลิกใบ: POST .../void)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchVoucher, recomputeVoucher, assignVoucherNumber, snapshotVoucher } from "@/lib/purchase-voucher-server";
import { writeBackVoucherPrices } from "@/lib/voucher-writeback";
import { saveRevision, VOUCHER_ENTITY } from "@/lib/document-revisions";
import { isForeignCurrency } from "@/lib/landed-cost";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  const admin = supabaseAdmin();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;

  await recomputeVoucher(admin, id);   // กันค่าค้าง — คิดใหม่ก่อนยืนยันเสมอ
  const v = await fetchVoucher(admin, id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if (v.header.status !== "draft") return NextResponse.json({ error: "ใบนี้ยืนยันไปแล้ว" }, { status: 400 });
  if (v.lines.length === 0) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });
  const missing = v.lines.filter((l) => !(Number(l.unit_price) > 0));
  if (missing.length) return NextResponse.json({ error: `ยังไม่ได้ใส่ราคา ${missing.length} รายการ: ${missing.slice(0, 3).map((l) => l.item_name).join(", ")}${missing.length > 3 ? " …" : ""}` }, { status: 400 });
  if (isForeignCurrency(v.header.currency) && !(Number(v.header.fx_rate) > 0)) return NextResponse.json({ error: "ต้องใส่เรทแปลงเป็นบาทก่อน" }, { status: 400 });

  // ออกเลข — ★ 2026-11-14 ตามวันที่ใบ (PV{YYYY}-{MM}-{DD}-{000}) · ใบร่างมีเลขแล้วและตรงวัน = ใช้เลขเดิม · ใบร่างเก่าที่ยังไม่มีเลข = ได้ตอนนี้
  let pvNo: string;
  try { pvNo = (await assignVoucherNumber(admin, id, true)) as string; }
  catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 }); }

  // เขียนราคากลับ — บรรทัด PO (+ยอดรวมใบ +ราคาต่อร้าน) และ SKU · ทำต่อจนครบ เก็บผลรายบรรทัดไว้รายงาน (ของกลาง lib/voucher-writeback)
  const { results, before } = await writeBackVoucherPrices(admin, v, { actorId: user?.id ?? null, actorName, refLabel: String(pvNo) });

  const { error: upErr } = await admin.from("purchase_vouchers_v2").update({
    status: "confirmed", pv_no: pvNo, confirmed_by: actorName, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(), revision: 1,
  }).eq("id", id);
  if (upErr) return NextResponse.json({ error: "บันทึกสถานะไม่สำเร็จ: " + upErr.message }, { status: 500 });
  // ★ 2026-11-15 เวอร์ชัน 1 = ใบตอนยืนยัน (ไว้เทียบเมื่อแก้หลังยืนยัน · ตารางกลาง document_revisions) — บันทึกไม่ได้ไม่ทำให้ยืนยันพัง
  try { await saveRevision(admin, { entityType: VOUCHER_ENTITY, entityId: id, revNo: 1, action: "confirm", reason: null, snapshot: await snapshotVoucher(admin, id), diff: null, actorId: user?.id ?? null, actorName }); } catch { /* best-effort */ }

  await writeAudit(admin, {
    action: "confirm", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName,
    metadata: { pv_no: pvNo, currency: v.header.currency, fx_rate: v.header.fx_rate, ship_method: v.header.ship_method, ship_total_thb: v.header.ship_total_thb, subtotal_thb: v.header.subtotal_thb, grand_total_thb: v.header.grand_total_thb, lines: results.length, write_back: results, price_before: before },
  });
  const failed = results.filter((r) => r.error);
  return NextResponse.json({ ok: true, pv_no: pvNo, write_back: results, failed: failed.length, error: null });
}
