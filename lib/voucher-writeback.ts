/**
 * ใบสำคัญรับ — เขียนราคากลับระบบ (ของกลางฝั่ง server)
 *   บรรทัด PO (+ยอดรวมใบ +ราคาต่อร้าน) · บรรทัดไม่มี PO = ราคาต่อร้าน · ราคาบน SKU (ไม่รวมค่าส่ง)
 *   จด "ราคาก่อนเขียนทับ" ต่อบรรทัด (PriceSnapshot) → ยกเลิกใบย้อนราคาได้ (void · lib/voucher-revision mergePriceSnapshots)
 * ใช้: POST /api/purchasing/vouchers/[id]/confirm (ยืนยันครั้งแรก) + /revise (บันทึกการแก้หลังยืนยัน — ★ 2026-11-15)
 * ย้ายมาจาก confirm route — สูตรเดิมทุกบรรทัด
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPoLinePrice, loadPartnerMatcher, writeBackSkuPrice, upsertSupplierPrice, snapshotLinePrice, type PriceSnapshot } from "@/lib/po-line-price";
import { isCNY } from "@/lib/landed-cost";
import type { VoucherHeader, VoucherLine } from "@/lib/purchase-voucher-server";

export type WriteBackResult = { line: string; po: boolean; price_list: boolean; sku: boolean; error?: string };

export async function writeBackVoucherPrices(admin: SupabaseClient, v: { header: VoucherHeader; lines: VoucherLine[] }, o: { actorId: string | null; actorName: string | null; refLabel: string }): Promise<{ results: WriteBackResult[]; before: PriceSnapshot[] }> {
  const matcher = await loadPartnerMatcher(admin);
  const sellerPartner = v.header.seller_name ? (matcher.match(v.header.seller_name) as Record<string, unknown> | undefined) : undefined;
  const results: WriteBackResult[] = [];
  const before: PriceSnapshot[] = [];   // ราคาก่อนเขียนทับ — เก็บลงประวัติ ใช้ย้อนตอนยกเลิกใบ
  for (const l of v.lines) {
    const price = Number(l.unit_price);
    const r: WriteBackResult = { line: l.item_name, po: false, price_list: false, sku: false };
    let snap: PriceSnapshot | null = null;
    try { snap = await snapshotLinePrice(admin, { itemName: l.item_name, poLineId: l.po_line_id ?? null, skuId: l.item_sku_id ?? null, fallbackPartnerId: sellerPartner ? String(sellerPartner.id) : null, matcher }); }
    catch { snap = null; }
    try {
      if (l.po_line_id) {
        const a = await applyPoLinePrice(admin, { lineId: l.po_line_id, price, actorId: o.actorId, actorName: o.actorName, matcher, skipAudit: true });
        r.po = true; r.price_list = a.saved_to_price_list;
      } else if (l.item_sku_id && sellerPartner) {
        // บรรทัดที่ไม่มี PO (รับตรง) → อย่างน้อยเก็บราคาต่อร้าน
        r.price_list = await upsertSupplierPrice(admin, { skuId: l.item_sku_id, partnerId: String(sellerPartner.id), price, currency: v.header.currency, actorId: o.actorId, actorName: o.actorName });
      }
      if (l.item_sku_id) {
        r.sku = await writeBackSkuPrice(admin, { skuId: l.item_sku_id, currency: v.header.currency, unitPrice: price, unitPriceThb: Number(l.unit_price_thb ?? 0), actorId: o.actorId, actorName: o.actorName, refLabel: o.refLabel });
      }
    } catch (e) { r.error = String((e as Error).message ?? e); }
    if (snap) {
      const thb = Number(l.unit_price_thb ?? 0);
      snap.written = {
        po_price: r.po ? price : null,
        supplier_price: r.price_list ? price : null,
        rmb_cost: r.sku && isCNY(v.header.currency) && price > 0 ? price : null,
        standard_price: r.sku && thb > 0 ? thb : null,
      };
      before.push(snap);
    }
    results.push(r);
  }
  return { results, before };
}
