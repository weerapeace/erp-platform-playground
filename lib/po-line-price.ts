/**
 * ของกลาง — "ใส่ราคาให้บรรทัดใบสั่งซื้อ" แล้วกระจายไปทุกที่ที่ต้องรู้ราคา
 *   1. บรรทัด PO (price_est + line_total)  2. ยอดรวมใบ (grand_total ผ่าน lib/po-total)
 *   3. ราคาต่อร้านของ SKU (supplier_items + ประวัติ supplier_price_history)
 *   4. (ตัวเลือก) ราคาบน SKU เอง: rmb_cost (¥) / standard_price (฿ ไม่รวมค่าส่ง)
 *
 * ใครใช้: POST /api/purchasing/po-line-price (ใส่ราคาทีละบรรทัดจากหน้าสั่งซื้อ/ปฏิทิน)
 *         POST /api/purchasing/vouchers/[id]/confirm (ยืนยันใบสำคัญรับ = หลายบรรทัดรวด)
 * ห้ามเขียน logic นี้ซ้ำในหน้า/route อื่น — แก้ที่นี่ที่เดียว
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPartnerMatcher } from "@/lib/partner-match";
import { computePoTotals, sumActiveLines } from "@/lib/po-total";
import { writeAudit } from "@/lib/audit";
import { isCNY } from "@/lib/landed-cost";

type Admin = SupabaseClient;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export type PartnerLike = { id: string; display_name: string | null; name_th: string | null; is_supplier: boolean | null; is_active: boolean | null };
export type PartnerMatcher = ReturnType<typeof buildPartnerMatcher>;

/** โหลดร้านทั้งหมดมาสร้างตัวจับคู่ชื่อ (ทำครั้งเดียวต่อ request แล้วส่งต่อให้ applyPoLinePrice หลายบรรทัด) */
export async function loadPartnerMatcher(admin: Admin): Promise<PartnerMatcher> {
  // ⚠️ ห้ามกรอง is_supplier=true — ร้านบนใบหลายร้านยังไม่ได้ติ๊ก "เป็นผู้จำหน่าย" ราคาจะไม่ถูกเก็บเข้าตารางร้าน
  const { data: partners } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
  return buildPartnerMatcher((partners ?? []) as unknown as PartnerLike[]);
}

export type ApplyLinePriceInput = {
  lineId: string;
  price: number;                       // ราคา/หน่วย ตามสกุลของใบ PO
  actorId?: string | null;
  actorName?: string | null;
  matcher?: PartnerMatcher;            // ส่งมาเมื่อทำหลายบรรทัด (กันโหลดร้านซ้ำ)
  skipAudit?: boolean;                 // ผู้เรียกเขียน audit รวมเองแล้ว
};
export type ApplyLinePriceResult = { price: number; line_total: number; grand_total: number; saved_to_price_list: boolean; sku_id: string | null; currency: string; seller_name: string };

/** ใส่ราคา 1 บรรทัด — โยน Error เมื่อไม่พบ/บันทึกไม่สำเร็จ */
export async function applyPoLinePrice(admin: Admin, input: ApplyLinePriceInput): Promise<ApplyLinePriceResult> {
  const price = num(input.price);
  if (!(price > 0)) throw new Error("ราคาต้องมากกว่า 0");

  const { data: line, error: lineErr } = await admin.from("purchase_order_lines_v2")
    .select("id, po_id, item_sku_id, item_name, qty").eq("id", input.lineId).single();
  if (lineErr || !line) throw new Error("ไม่พบรายการนี้");
  const l = line as Record<string, unknown>;
  const qty = num(l.qty);
  const lineTotal = Math.round(qty * price * 100) / 100;

  // 1. อัปเดตบรรทัด
  const { error: upErr } = await admin.from("purchase_order_lines_v2")
    .update({ price_est: price, line_total: lineTotal }).eq("id", input.lineId);
  if (upErr) throw new Error(upErr.message);

  // 2. ยอดรวมใบใหม่ — ผ่าน lib/po-total (ใบที่มีภาษีไม่โดนล้าง VAT)
  const poId = String(l.po_id);
  const [{ data: allLines }, { data: poRow }] = await Promise.all([
    admin.from("purchase_order_lines_v2").select("line_total, is_active").eq("po_id", poId),
    admin.from("purchase_orders_v2").select("vat_rate, vat_included, seller_name, currency").eq("id", poId).maybeSingle(),
  ]);
  const lineSum = sumActiveLines((allLines ?? []) as { line_total?: number | null; is_active?: boolean | null }[]);
  const pr = (poRow ?? {}) as Record<string, unknown>;
  const grand = computePoTotals(lineSum, num(pr.vat_rate), !!pr.vat_included).total;
  await admin.from("purchase_orders_v2").update({ grand_total: grand }).eq("id", poId);

  // 3. ราคาต่อร้านของ SKU (supplier_items) — จับคู่ร้านจากชื่อบนใบ (lib/partner-match)
  const sellerName = String(pr.seller_name ?? "").trim();
  const currency = String(pr.currency ?? "THB") || "THB";
  const skuId = l.item_sku_id ? String(l.item_sku_id) : null;
  let savedToPriceList = false;
  if (skuId && sellerName) {
    const matcher = input.matcher ?? await loadPartnerMatcher(admin);
    const partner = matcher.match(sellerName) as Record<string, unknown> | undefined;
    if (partner) {
      savedToPriceList = await upsertSupplierPrice(admin, {
        skuId, partnerId: String(partner.id), price, currency, actorId: input.actorId, actorName: input.actorName,
      });
    }
  }

  if (!input.skipAudit) {
    await writeAudit(admin, {
      action: "update", entityType: "purchase_order_lines_v2", entityId: input.lineId,
      actorId: input.actorId ?? null, actorName: input.actorName ?? null,
      metadata: { item_name: l.item_name, price, line_total: lineTotal, grand_total: grand, saved_to_price_list: savedToPriceList },
    });
  }
  return { price, line_total: lineTotal, grand_total: grand, saved_to_price_list: savedToPriceList, sku_id: skuId, currency, seller_name: sellerName };
}

/** บันทึกราคาต่อร้าน (supplier_items) + ประวัติราคาเมื่อเปลี่ยน · ร้านแรกของสินค้า = ร้านหลัก */
export async function upsertSupplierPrice(admin: Admin, o: { skuId: string; partnerId: string; price: number; currency: string; actorId?: string | null; actorName?: string | null }): Promise<boolean> {
  const { data: existing } = await admin.from("supplier_items")
    .select("id, price").eq("item_sku_id", o.skuId).eq("supplier_partner_id", o.partnerId).maybeSingle();
  if (existing) {
    const ex = existing as Record<string, unknown>;
    const oldPrice = ex.price == null ? null : num(ex.price);
    const { error } = await admin.from("supplier_items").update({ price: o.price, currency: o.currency, is_active: true }).eq("id", String(ex.id));
    if (error) return false;
    if (oldPrice !== o.price) {
      await admin.from("supplier_price_history").insert({
        supplier_item_id: String(ex.id), item_sku_id: o.skuId, supplier_partner_id: o.partnerId,
        old_price: oldPrice, new_price: o.price, currency: o.currency,
        changed_by: o.actorId ?? null, changed_by_name: o.actorName ?? null,
      });
    }
    return true;
  }
  const { count } = await admin.from("supplier_items").select("id", { count: "exact", head: true }).eq("item_sku_id", o.skuId);
  const { error } = await admin.from("supplier_items").insert({
    item_sku_id: o.skuId, supplier_partner_id: o.partnerId, price: o.price, currency: o.currency, is_active: true, is_default: (count ?? 0) === 0,
  });
  return !error;
}

/**
 * เขียนราคากลับ SKU เอง (ไม่รวมค่าส่ง — เจ้าของสั่ง 2026-09-26)
 *   สกุลหยวน → rmb_cost = ราคา ¥ และ standard_price = ราคาแปลงบาท
 *   สกุลบาท  → standard_price = ราคา ฿
 */
export async function writeBackSkuPrice(admin: Admin, o: { skuId: string; currency: string; unitPrice: number; unitPriceThb: number; actorId?: string | null; actorName?: string | null; refLabel?: string }): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  if (isCNY(o.currency)) { if (o.unitPrice > 0) patch.rmb_cost = o.unitPrice; if (o.unitPriceThb > 0) patch.standard_price = o.unitPriceThb; }
  else if (o.unitPriceThb > 0) patch.standard_price = o.unitPriceThb;
  if (Object.keys(patch).length === 0) return false;
  const { data: before } = await admin.from("skus_v2").select("code, rmb_cost, standard_price").eq("id", o.skuId).maybeSingle();
  const { error } = await admin.from("skus_v2").update(patch).eq("id", o.skuId);
  if (error) return false;
  const b = (before ?? {}) as Record<string, unknown>;
  await writeAudit(admin, {
    action: "update", entityType: "skus_v2", entityId: o.skuId,
    actorId: o.actorId ?? null, actorName: o.actorName ?? null,
    metadata: { source: "purchase_voucher", ref: o.refLabel ?? null, code: b.code ?? null, changed: Object.keys(patch), old: { rmb_cost: b.rmb_cost ?? null, standard_price: b.standard_price ?? null }, new: patch },
  });
  return true;
}
