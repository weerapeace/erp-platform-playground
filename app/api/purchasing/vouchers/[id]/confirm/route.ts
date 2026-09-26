/**
 * POST /api/purchasing/vouchers/<id>/confirm — ยืนยันใบสำคัญรับ
 *   1. ตรวจ: ทุกรายการมีราคา · สกุลต่างประเทศต้องมีเรท
 *   2. ออกเลข PV-{YYYY}-{00000} (erp_next_number 'pv')
 *   3. เขียนราคากลับ (ของกลาง lib/po-line-price): บรรทัด PO + ยอดรวมใบ · ราคาต่อร้านของ SKU · ราคาบน SKU (ไม่รวมค่าส่ง)
 *   4. สถานะ confirmed + audit log
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchVoucher, recomputeVoucher } from "@/lib/purchase-voucher-server";
import { applyPoLinePrice, loadPartnerMatcher, writeBackSkuPrice, upsertSupplierPrice } from "@/lib/po-line-price";
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

  // ออกเลข
  const { data: pvNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "pv" });
  if (numErr || !pvNo) return NextResponse.json({ error: "ออกเลขใบสำคัญไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });

  // เขียนราคากลับ — บรรทัด PO (+ยอดรวมใบ +ราคาต่อร้าน) และ SKU · ทำต่อจนครบ เก็บผลรายบรรทัดไว้รายงาน
  const matcher = await loadPartnerMatcher(admin);
  const sellerPartner = v.header.seller_name ? (matcher.match(v.header.seller_name) as Record<string, unknown> | undefined) : undefined;
  const results: { line: string; po: boolean; price_list: boolean; sku: boolean; error?: string }[] = [];
  for (const l of v.lines) {
    const price = Number(l.unit_price);
    const r = { line: l.item_name, po: false, price_list: false, sku: false } as (typeof results)[number];
    try {
      if (l.po_line_id) {
        const a = await applyPoLinePrice(admin, { lineId: l.po_line_id, price, actorId: user?.id ?? null, actorName, matcher, skipAudit: true });
        r.po = true; r.price_list = a.saved_to_price_list;
      } else if (l.item_sku_id && sellerPartner) {
        // บรรทัดที่ไม่มี PO (รับตรง) → อย่างน้อยเก็บราคาต่อร้าน
        r.price_list = await upsertSupplierPrice(admin, { skuId: l.item_sku_id, partnerId: String(sellerPartner.id), price, currency: v.header.currency, actorId: user?.id ?? null, actorName });
      }
      if (l.item_sku_id) {
        r.sku = await writeBackSkuPrice(admin, { skuId: l.item_sku_id, currency: v.header.currency, unitPrice: price, unitPriceThb: Number(l.unit_price_thb ?? 0), actorId: user?.id ?? null, actorName, refLabel: String(pvNo) });
      }
    } catch (e) { r.error = String((e as Error).message ?? e); }
    results.push(r);
  }

  const { error: upErr } = await admin.from("purchase_vouchers_v2").update({
    status: "confirmed", pv_no: pvNo, confirmed_by: actorName, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (upErr) return NextResponse.json({ error: "บันทึกสถานะไม่สำเร็จ: " + upErr.message }, { status: 500 });

  await writeAudit(admin, {
    action: "confirm", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName,
    metadata: { pv_no: pvNo, currency: v.header.currency, fx_rate: v.header.fx_rate, ship_method: v.header.ship_method, ship_total_thb: v.header.ship_total_thb, subtotal_thb: v.header.subtotal_thb, grand_total_thb: v.header.grand_total_thb, lines: results.length, write_back: results },
  });
  const failed = results.filter((r) => r.error);
  return NextResponse.json({ ok: true, pv_no: pvNo, write_back: results, failed: failed.length, error: null });
}
