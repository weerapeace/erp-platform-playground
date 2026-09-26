/**
 * ของกลางฝั่ง server — ใบสำคัญรับ (ใบซื้อ) purchase_vouchers_v2
 *   prefillFromGrs()  สร้างใบร่างจากใบรับ GR หลายใบ: ดึงราคาจาก PO → ราคาต่อร้าน → ไม่มี, คิว/กก. จาก Parent SKU, เรทจาก daily_rates
 *   recomputeVoucher() คิดใหม่ทั้งใบด้วยสูตรกลาง lib/landed-cost แล้วบันทึกลงตาราง
 *   fetchVoucher()     อ่านใบ + รายการ (พร้อมรหัส/รูป SKU) ให้หน้าเว็บ/หน้าพิมพ์
 * route ต่าง ๆ ใน app/api/purchasing/vouchers ต้องบางที่สุด — logic อยู่ที่นี่
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeVoucher, cbmFromCm, isForeignCurrency, type ShipMethod } from "@/lib/landed-cost";
import { resolveSkuCover, coverUrl } from "@/lib/sku-cover";
import { loadPartnerMatcher } from "@/lib/po-line-price";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();
const chunk = <T,>(arr: T[], size = 300): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

export const SHIP_METHODS: ShipMethod[] = ["none", "cube", "weight"];
export const DEFAULT_SHIP_RATE: Record<ShipMethod, number | null> = { none: null, cube: 3500, weight: 45 };   // ฿/คิว (เรือ) · ฿/กก.

export type VoucherHeader = {
  id: string; pv_no: string | null; status: string; voucher_date: string;
  seller_name: string | null; seller_partner_id: string | null;
  currency: string; fx_rate: number | null;
  ship_method: ShipMethod; ship_rate: number | null; ship_manual_total: number | null; ship_total_thb: number;
  total_cbm: number | null; total_kg: number | null;
  subtotal_foreign: number; subtotal_thb: number; grand_total_thb: number;
  note: string | null; created_by: string | null; confirmed_by: string | null; confirmed_at: string | null;
  created_at: string;
  gr_nos: string[]; po_nos: string[];
  // ร้านขนส่ง (freight_carriers) + การจ่ายค่าส่ง (ผูกบิลค่าส่งในแอปโอนเงินจีนได้)
  carrier_id: string | null; carrier_name: string | null;
  tracking_no: string | null;    // รหัสขนส่ง (EK-########) จากใบส่งของ
  shipping_bill_id: string | null; shipping_payment_status: "unpaid" | "paid"; shipping_paid_date: string | null;
  /** สถานะจ่ายค่าสินค้าของแต่ละใบ PO ในใบสำคัญนี้ — ยอดค้างจ่ายอ้างจากราคาในใบสำคัญ (goods_thb) */
  po_payments: PoPayment[];
};
export type PoPayment = { po_id: string; po_no: string; currency: string; payment_status: string; paid_date: string | null; paid_amount_thb: number | null; goods_thb: number; goods_foreign: number; grand_total: number };
export type VoucherLine = {
  id: string; gr_id: string | null; gr_line_id: string | null; po_id: string | null; po_line_id: string | null;
  po_no: string | null; gr_no: string | null; item_sku_id: string | null; item_name: string; uom: string | null;
  qty: number; unit_price: number | null; unit_price_thb: number | null; line_total_thb: number | null;
  cbm_per_unit: number | null; kg_per_unit: number | null; ship_alloc_thb: number; landed_unit_thb: number | null;
  price_source: string | null; sort_order: number;
  code: string; image_url: string | null;
  parent_cbm: number | null; parent_kg: number | null;   // ค่าจาก Parent SKU (ไว้ปุ่ม "ใช้ค่าจากตัวแม่")
};

const toHeader = (v: Row, grNos: string[], poNos: string[], poPayments: PoPayment[] = []): VoucherHeader => ({
  carrier_id: (v.carrier_id as string) ?? null, carrier_name: (v.carrier_name as string) ?? null,
  tracking_no: (v.tracking_no as string) ?? null,
  shipping_bill_id: (v.shipping_bill_id as string) ?? null,
  shipping_payment_status: v.shipping_payment_status === "paid" ? "paid" : "unpaid",
  shipping_paid_date: (v.shipping_paid_date as string) ?? null,
  po_payments: poPayments,
  id: String(v.id), pv_no: (v.pv_no as string) ?? null, status: String(v.status ?? "draft"), voucher_date: String(v.voucher_date ?? ""),
  seller_name: (v.seller_name as string) ?? null, seller_partner_id: (v.seller_partner_id as string) ?? null,
  currency: String(v.currency ?? "THB"), fx_rate: v.fx_rate == null ? null : num(v.fx_rate),
  ship_method: (SHIP_METHODS.includes(v.ship_method as ShipMethod) ? v.ship_method : "none") as ShipMethod,
  ship_rate: v.ship_rate == null ? null : num(v.ship_rate), ship_manual_total: v.ship_manual_total == null ? null : num(v.ship_manual_total),
  ship_total_thb: num(v.ship_total_thb), total_cbm: v.total_cbm == null ? null : num(v.total_cbm), total_kg: v.total_kg == null ? null : num(v.total_kg),
  subtotal_foreign: num(v.subtotal_foreign), subtotal_thb: num(v.subtotal_thb), grand_total_thb: num(v.grand_total_thb),
  note: (v.note as string) ?? null, created_by: (v.created_by as string) ?? null, confirmed_by: (v.confirmed_by as string) ?? null,
  confirmed_at: (v.confirmed_at as string) ?? null, created_at: String(v.created_at ?? ""), gr_nos: grNos, po_nos: poNos,
});

/** ขนาด/น้ำหนักจาก Parent SKU (embed) → คิว/ชิ้น + กก./ชิ้น */
function parentBasis(sku: Row | undefined): { cbm: number | null; kg: number | null } {
  if (!sku) return { cbm: null, kg: null };
  const raw = sku.parent_skus_v2;
  const p = (Array.isArray(raw) ? raw[0] : raw) as Row | null | undefined;
  if (!p) return { cbm: null, kg: null };
  const cbm = cbmFromCm(p.size_length_cm, p.size_height_cm, p.size_thickness_cm);
  const g = num(p.weight_g);
  return { cbm, kg: g > 0 ? Math.round((g / 1000) * 1000) / 1000 : null };
}

const SKU_SELECT = "id, code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key, size_length_cm, size_height_cm, size_thickness_cm, weight_g )";

async function loadSkus(admin: Admin, ids: string[]): Promise<Map<string, Row>> {
  const m = new Map<string, Row>();
  for (const c of chunk(ids)) {
    const { data } = await admin.from("skus_v2").select(SKU_SELECT).in("id", c);
    for (const s of (data ?? []) as unknown as Row[]) m.set(String(s.id), s);
  }
  return m;
}

/** เรทหยวนของวันนั้น (ล่าสุดที่ไม่เกินวันที่ให้) จาก daily_rates ของแอปโอนเงินจีน */
export async function fxRateForDate(admin: Admin, date: string | null): Promise<number | null> {
  let q = admin.from("daily_rates").select("rate, rate_date").not("is_active", "is", false).order("rate_date", { ascending: false }).limit(1);
  if (date) q = q.lte("rate_date", date);
  const { data } = await q;
  const r = (data ?? [])[0] as Row | undefined;
  return r && num(r.rate) > 0 ? num(r.rate) : null;
}

/** สร้างใบร่างจากใบรับ GR หลายใบ → คืน id ใบสำคัญ (โยน Error เมื่อข้อมูลไม่ผ่าน) */
export async function prefillFromGrs(admin: Admin, grIds: string[], actorName: string | null): Promise<string> {
  const ids = [...new Set(grIds.map(String).filter(Boolean))];
  if (ids.length === 0) throw new Error("ไม่ได้เลือกใบรับ");
  const { data: grs, error: grErr } = await admin.from("goods_receipts_v2")
    .select("id, gr_no, po_id, po_no, seller_name, receive_date, voucher_id, status, is_active").in("id", ids);
  if (grErr) throw new Error("อ่านใบรับไม่สำเร็จ: " + grErr.message);
  const grRows = (grs ?? []) as Row[];
  if (grRows.length !== ids.length) throw new Error("ใบรับบางใบไม่พบ");
  const taken = grRows.filter((g) => g.voucher_id);
  if (taken.length) throw new Error(`ใบรับ ${taken.map((g) => g.gr_no).join(", ")} ออกใบสำคัญรับไปแล้ว`);

  // ใบ PO ของทุก GR → สกุลเงินต้องเหมือนกัน (ราคาปนสกุลในใบเดียวไม่ได้)
  const poIds = [...new Set(grRows.map((g) => String(g.po_id)).filter(Boolean))];
  const { data: pos } = await admin.from("purchase_orders_v2").select("id, po_no, seller_name, seller_partner_id, currency").in("id", poIds);
  const poMap = new Map(((pos ?? []) as Row[]).map((p) => [String(p.id), p]));
  const currencies = [...new Set(poIds.map((id) => String(poMap.get(id)?.currency ?? "THB").toUpperCase() || "THB"))];
  if (currencies.length > 1) throw new Error(`ใบรับที่เลือกมาจากใบสั่งซื้อคนละสกุลเงิน (${currencies.join(" / ")}) — แยกออกใบสำคัญคนละใบ`);
  const currency = currencies[0] ?? "THB";
  const sellers = [...new Set(grRows.map((g) => str(g.seller_name)).filter(Boolean))];
  const sellerName = sellers.length === 1 ? sellers[0] : sellers.join(" + ");
  const sellerPartnerId = sellers.length === 1 ? ((poMap.get(poIds[0])?.seller_partner_id as string) ?? null) : null;

  // รายการรับ
  const grLines: Row[] = [];
  for (const c of chunk(ids)) {
    const { data } = await admin.from("goods_receipt_lines_v2")
      .select("id, gr_id, po_line_id, item_sku_id, item_name, qty_received, uom, sort_order, is_active").in("gr_id", c).order("sort_order");
    for (const l of (data ?? []) as Row[]) if (l.is_active !== false && num(l.qty_received) > 0) grLines.push(l);
  }
  if (grLines.length === 0) throw new Error("ใบรับที่เลือกไม่มีรายการที่รับจริง");

  // ราคาจาก PO line
  const poLineIds = [...new Set(grLines.map((l) => String(l.po_line_id ?? "")).filter(Boolean))];
  const poLineMap = new Map<string, Row>();
  for (const c of chunk(poLineIds)) {
    const { data } = await admin.from("purchase_order_lines_v2").select("id, po_id, price_est, item_sku_id").in("id", c);
    for (const l of (data ?? []) as Row[]) poLineMap.set(String(l.id), l);
  }
  // SKU (รหัส/รูป/ขนาดตัวแม่) + ราคาต่อร้าน
  const skuIds = [...new Set(grLines.map((l) => String(l.item_sku_id ?? "") || String(poLineMap.get(String(l.po_line_id))?.item_sku_id ?? "")).filter(Boolean))];
  const skuMap = await loadSkus(admin, skuIds);
  const priceList = new Map<string, { price: number; currency: string }>();
  if (skuIds.length) {
    const matcher = await loadPartnerMatcher(admin);
    const partner = sellers.length === 1 ? (matcher.match(sellers[0]) as Row | undefined) : undefined;
    const partnerId = partner ? String(partner.id) : null;
    for (const c of chunk(skuIds)) {
      const { data } = await admin.from("supplier_items").select("item_sku_id, supplier_partner_id, price, currency, is_default").in("item_sku_id", c).not("is_active", "is", false);
      for (const s of (data ?? []) as Row[]) {
        const sid = String(s.item_sku_id);
        const isShop = partnerId && String(s.supplier_partner_id) === partnerId;
        const cur = String(s.currency ?? "THB").toUpperCase();
        if (num(s.price) <= 0) continue;
        // ร้านเดียวกับใบ = ใช้ก่อน · ไม่มีก็ใช้ร้านหลัก (เฉพาะสกุลเดียวกับใบ)
        if (isShop) priceList.set(sid, { price: num(s.price), currency: cur });
        else if (s.is_default && !priceList.has(sid) && sameCurrency(cur, currency)) priceList.set(sid, { price: num(s.price), currency: cur });
      }
    }
  }

  const receiveDates = grRows.map((g) => str(g.receive_date)).filter(Boolean).sort();
  const fx = isForeignCurrency(currency) ? await fxRateForDate(admin, receiveDates[receiveDates.length - 1] ?? null) : null;

  // ร้านขนส่งหลักจากตั้งค่า → วิธีคิด + เรท เริ่มต้น (ไม่มี = ไม่คิดค่าส่ง)
  const carrier = await defaultCarrier(admin);
  const { data: created, error: cErr } = await admin.from("purchase_vouchers_v2").insert({
    status: "draft", voucher_date: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10),
    seller_name: sellerName || null, seller_partner_id: sellerPartnerId, currency, fx_rate: fx,
    ship_method: carrier?.method ?? "none", ship_rate: carrier?.rate ?? null, carrier_id: carrier?.id ?? null, carrier_name: carrier?.name ?? null,
    created_by: actorName,
  }).select("id").single();
  if (cErr || !created) throw new Error("สร้างใบสำคัญไม่สำเร็จ: " + (cErr?.message ?? ""));
  const voucherId = String((created as Row).id);

  const grById = new Map(grRows.map((g) => [String(g.id), g]));
  const lines = grLines.map((l, i) => {
    const pl = poLineMap.get(String(l.po_line_id ?? ""));
    const skuId = String(l.item_sku_id ?? "") || String(pl?.item_sku_id ?? "") || null;
    const sku = skuId ? skuMap.get(skuId) : undefined;
    const basis = parentBasis(sku);
    const poPrice = num(pl?.price_est);
    const listed = skuId ? priceList.get(skuId) : undefined;
    const unitPrice = poPrice > 0 ? poPrice : listed && sameCurrency(listed.currency, currency) ? listed.price : null;
    const source = poPrice > 0 ? "po" : unitPrice != null ? "price_list" : "none";
    const g = grById.get(String(l.gr_id));
    return {
      voucher_id: voucherId, gr_id: String(l.gr_id), gr_line_id: String(l.id),
      po_id: g?.po_id ?? null, po_line_id: l.po_line_id ?? null, po_no: g?.po_no ?? null, gr_no: g?.gr_no ?? null,
      item_sku_id: skuId, item_name: str(l.item_name), uom: (l.uom as string) ?? null,
      qty: num(l.qty_received), unit_price: unitPrice, cbm_per_unit: basis.cbm, kg_per_unit: basis.kg,
      price_source: source, sort_order: i,
    };
  });
  const { error: lErr } = await admin.from("purchase_voucher_lines_v2").insert(lines);
  if (lErr) { await admin.from("purchase_vouchers_v2").delete().eq("id", voucherId); throw new Error("บันทึกรายการไม่สำเร็จ: " + lErr.message); }
  await admin.from("goods_receipts_v2").update({ voucher_id: voucherId }).in("id", ids);
  await recomputeVoucher(admin, voucherId);
  return voucherId;
}

const sameCurrency = (a: string, b: string) => {
  const n1 = a.toUpperCase(), n2 = b.toUpperCase();
  const cny = (c: string) => ["RMB", "YUAN", "CNY"].includes(c);
  return n1 === n2 || (cny(n1) && cny(n2));
};

/** คิดใหม่ทั้งใบด้วยสูตรกลาง แล้วบันทึกทั้งหัวใบและบรรทัด */
export async function recomputeVoucher(admin: Admin, voucherId: string): Promise<void> {
  const { data: v } = await admin.from("purchase_vouchers_v2").select("*").eq("id", voucherId).maybeSingle();
  if (!v) return;
  const h = v as Row;
  const { data: ls } = await admin.from("purchase_voucher_lines_v2").select("id, qty, unit_price, cbm_per_unit, kg_per_unit").eq("voucher_id", voucherId).not("is_active", "is", false).order("sort_order");
  const lines = (ls ?? []) as Row[];
  const calc = computeVoucher(
    { currency: String(h.currency ?? "THB"), fx_rate: h.fx_rate == null ? null : num(h.fx_rate), ship_method: (h.ship_method as ShipMethod) ?? "none", ship_rate: h.ship_rate == null ? null : num(h.ship_rate), ship_manual_total: h.ship_manual_total == null ? null : num(h.ship_manual_total) },
    lines.map((l) => ({ qty: num(l.qty), unit_price: l.unit_price == null ? null : num(l.unit_price), cbm_per_unit: l.cbm_per_unit == null ? null : num(l.cbm_per_unit), kg_per_unit: l.kg_per_unit == null ? null : num(l.kg_per_unit) })),
  );
  for (let i = 0; i < lines.length; i++) {
    const c = calc.lines[i];
    await admin.from("purchase_voucher_lines_v2").update({
      unit_price_thb: c.has_price ? c.unit_price_thb : null, line_total_thb: c.has_price ? c.line_total_thb : null,
      ship_alloc_thb: c.ship_alloc_thb, landed_unit_thb: c.has_price ? c.landed_unit_thb : null, updated_at: new Date().toISOString(),
    }).eq("id", String(lines[i].id));
  }
  const t = calc.totals;
  await admin.from("purchase_vouchers_v2").update({
    ship_total_thb: t.ship_total_thb, total_cbm: t.total_cbm, total_kg: t.total_kg,
    subtotal_foreign: t.subtotal_foreign, subtotal_thb: t.subtotal_thb, grand_total_thb: t.grand_total_thb, updated_at: new Date().toISOString(),
  }).eq("id", voucherId);
}

/** อ่านใบ + รายการ (พร้อมรหัส/รูป/ค่าจากตัวแม่) — null เมื่อไม่พบ */
export async function fetchVoucher(admin: Admin, voucherId: string): Promise<{ header: VoucherHeader; lines: VoucherLine[] } | null> {
  const { data: v } = await admin.from("purchase_vouchers_v2").select("*").eq("id", voucherId).maybeSingle();
  if (!v) return null;
  const { data: ls } = await admin.from("purchase_voucher_lines_v2").select("*").eq("voucher_id", voucherId).not("is_active", "is", false).order("sort_order");
  const rows = (ls ?? []) as Row[];
  const skuIds = [...new Set(rows.map((l) => String(l.item_sku_id ?? "")).filter(Boolean))];
  const skuMap = await loadSkus(admin, skuIds);
  const lines: VoucherLine[] = rows.map((l) => {
    const sku = l.item_sku_id ? skuMap.get(String(l.item_sku_id)) : undefined;
    const basis = parentBasis(sku);
    const nn = (k: string) => (l[k] == null ? null : num(l[k]));
    return {
      id: String(l.id), gr_id: (l.gr_id as string) ?? null, gr_line_id: (l.gr_line_id as string) ?? null, po_id: (l.po_id as string) ?? null, po_line_id: (l.po_line_id as string) ?? null,
      po_no: (l.po_no as string) ?? null, gr_no: (l.gr_no as string) ?? null, item_sku_id: (l.item_sku_id as string) ?? null, item_name: str(l.item_name), uom: (l.uom as string) ?? null,
      qty: num(l.qty), unit_price: nn("unit_price"), unit_price_thb: nn("unit_price_thb"), line_total_thb: nn("line_total_thb"),
      cbm_per_unit: nn("cbm_per_unit"), kg_per_unit: nn("kg_per_unit"), ship_alloc_thb: num(l.ship_alloc_thb), landed_unit_thb: nn("landed_unit_thb"),
      price_source: (l.price_source as string) ?? null, sort_order: num(l.sort_order),
      code: sku ? String(sku.code ?? "") : "", image_url: coverUrl(resolveSkuCover(sku).key),
      parent_cbm: basis.cbm, parent_kg: basis.kg,
    };
  });
  const grNos = [...new Set(lines.map((l) => l.gr_no ?? "").filter(Boolean))];
  const poNos = [...new Set(lines.map((l) => l.po_no ?? "").filter(Boolean))];

  // สถานะจ่ายค่าสินค้าต่อใบ PO — ยอดที่ควรจ่ายอ้างจากราคาในใบสำคัญ (ไม่รวมค่าส่ง)
  const poIds = [...new Set(lines.map((l) => l.po_id ?? "").filter(Boolean))];
  const poPayments: PoPayment[] = [];
  if (poIds.length) {
    const { data: pos } = await admin.from("purchase_orders_v2").select("id, po_no, currency, payment_status, paid_date, paid_amount_thb, grand_total").in("id", poIds);
    for (const p of (pos ?? []) as Row[]) {
      const mine = lines.filter((l) => l.po_id === String(p.id));
      poPayments.push({
        po_id: String(p.id), po_no: String(p.po_no ?? ""), currency: String(p.currency ?? "THB").toUpperCase(),
        payment_status: String(p.payment_status ?? "unpaid"), paid_date: (p.paid_date as string) ?? null,
        paid_amount_thb: p.paid_amount_thb == null ? null : num(p.paid_amount_thb), grand_total: num(p.grand_total),
        goods_thb: Math.round(mine.reduce((a, l) => a + num(l.line_total_thb), 0) * 100) / 100,
        goods_foreign: Math.round(mine.reduce((a, l) => a + num(l.unit_price) * num(l.qty), 0) * 100) / 100,
      });
    }
    poPayments.sort((a, b) => a.po_no.localeCompare(b.po_no));
  }
  return { header: toHeader(v as Row, grNos, poNos, poPayments), lines };
}

/** ร้านขนส่งหลัก (is_default) — ใบสำคัญใหม่ใช้เป็นค่าเริ่มต้นของวิธีคิด + เรท */
export async function defaultCarrier(admin: Admin): Promise<{ id: string; name: string; method: ShipMethod; rate: number } | null> {
  const { data } = await admin.from("freight_carriers").select("id, name, method, rate_thb, is_default, sort_order").not("is_active", "is", false).order("is_default", { ascending: false }).order("sort_order").limit(1);
  const r = (data ?? [])[0] as Row | undefined;
  if (!r) return null;
  const method = (SHIP_METHODS.includes(r.method as ShipMethod) ? r.method : "cube") as ShipMethod;
  return { id: String(r.id), name: String(r.name ?? ""), method: method === "none" ? "cube" : method, rate: num(r.rate_thb) };
}
