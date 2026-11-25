/**
 * Shopee โปรโมชั่น (อ่านอย่างเดียว) — โค้ดส่วนลด · โปรลดราคา · แฟลชเซลของร้าน · pure parser มีเทสต์ lib/__tests__/marketing-promos-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 6 ข้อ 1) · ชื่อช่องจากเอกสาร Shopee Open Platform (เปิดดู 2026-11-25):
 *   GET /api/v2/voucher/get_voucher_list?status=all&page_no&page_size(≤100) → response.voucher_list[] + more
 *       voucher_id, voucher_code, voucher_name, voucher_type, reward_type (1 ลดบาท · 2 ลด % · 3 คืน coins), usage_quantity, current_usage,
 *       start_time, end_time, discount_amount, percentage, voucher_purpose (0 ปกติ · 1 ต้อนรับ · 3 ผู้ติดตามร้าน …)
 *   GET /api/v2/discount/get_discount_list?discount_status=all&page_no&page_size(≤100) → response.discount_list[] + more
 *       discount_id, discount_name, status, start_time, end_time, source
 *   GET /api/v2/shop_flash_sale/get_shop_flash_sale_list?type=0&offset&limit(≤100) → response.flash_sale_list[] + total_count
 *       flash_sale_id, timeslot_id, status, start_time, end_time, enabled_item_count, item_count, remindme_count, click_count
 */
import { shopeeFetch } from "@/lib/shopee";

type Obj = Record<string, unknown>;
const n = (v: unknown): number | null => { const x = Number(v); return v == null || v === "" || !Number.isFinite(x) ? null : x; };
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Obj[]) : []);
const resp = (j: Obj): Obj => (j.response && typeof j.response === "object" ? (j.response as Obj) : {});
const iso = (sec: unknown) => { const s = n(sec); return s && s > 0 ? new Date(s * 1000).toISOString() : null; };

export type PromoRow = {
  kind: "voucher" | "discount" | "flash_sale"; promo_id: string; name: string | null; code: string | null; status: string | null;
  start_at: string | null; end_at: string | null; usage_quantity: number | null; current_usage: number | null;
  discount_amount: number | null; percentage: number | null; reward_type: number | null; purpose: number | null;
  item_count: number | null; remind_count: number | null; click_count: number | null;
};
const blank = { name: null, code: null, status: null, usage_quantity: null, current_usage: null, discount_amount: null, percentage: null, reward_type: null, purpose: null, item_count: null, remind_count: null, click_count: null };

export function parseVouchers(j: Obj): { rows: PromoRow[]; more: boolean } {
  const r = resp(j);
  return {
    more: r.more === true,
    rows: arr(r.voucher_list).map((v) => ({
      ...blank, kind: "voucher" as const, promo_id: String(v.voucher_id ?? ""), name: (v.voucher_name as string) ?? null, code: (v.voucher_code as string) ?? null,
      start_at: iso(v.start_time), end_at: iso(v.end_time), usage_quantity: n(v.usage_quantity), current_usage: n(v.current_usage),
      discount_amount: n(v.discount_amount), percentage: n(v.percentage), reward_type: n(v.reward_type), purpose: n(v.voucher_purpose),
      status: v.is_admin === true ? "shopee" : null,
    })).filter((x) => x.promo_id),
  };
}
export function parseDiscounts(j: Obj): { rows: PromoRow[]; more: boolean } {
  const r = resp(j);
  return {
    more: r.more === true,
    rows: arr(r.discount_list).map((d) => ({ ...blank, kind: "discount" as const, promo_id: String(d.discount_id ?? ""), name: (d.discount_name as string) ?? null, status: (d.status as string) ?? null, start_at: iso(d.start_time), end_at: iso(d.end_time) })).filter((x) => x.promo_id),
  };
}
export function parseFlashSales(j: Obj): { rows: PromoRow[]; total: number } {
  const r = resp(j);
  return {
    total: n(r.total_count) ?? 0,
    rows: arr(r.flash_sale_list).map((f) => ({
      ...blank, kind: "flash_sale" as const, promo_id: String(f.flash_sale_id ?? ""), name: null, status: n(f.status) === 1 ? "enabled" : n(f.status) === 2 ? "disabled" : n(f.status) === 0 ? "deleted" : String(f.status ?? ""),
      start_at: iso(f.start_time), end_at: iso(f.end_time), item_count: n(f.enabled_item_count ?? f.item_count), remind_count: n(f.remindme_count), click_count: n(f.click_count),
    })).filter((x) => x.promo_id),
  };
}

type Tok = { accessToken: string; shopId: string | number };
const MAX_PAGES = 20;
export async function shopeeVouchers(t: Tok): Promise<PromoRow[]> {
  const out: PromoRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = parseVouchers(await shopeeFetch("/api/v2/voucher/get_voucher_list", { ...t, query: { status: "all", page_no: page, page_size: 100 } }));
    out.push(...r.rows); if (!r.more || !r.rows.length) break;
  }
  return out;
}
export async function shopeeDiscounts(t: Tok): Promise<PromoRow[]> {
  const out: PromoRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = parseDiscounts(await shopeeFetch("/api/v2/discount/get_discount_list", { ...t, query: { discount_status: "all", page_no: page, page_size: 100 } }));
    out.push(...r.rows); if (!r.more || !r.rows.length) break;
  }
  return out;
}
export async function shopeeFlashSales(t: Tok): Promise<PromoRow[]> {
  const out: PromoRow[] = [];
  for (let offset = 0, i = 0; i < MAX_PAGES; i++) {
    const r = parseFlashSales(await shopeeFetch("/api/v2/shop_flash_sale/get_shop_flash_sale_list", { ...t, query: { type: 0, offset, limit: 100 } }));
    out.push(...r.rows); offset += r.rows.length;
    if (!r.rows.length || offset >= r.total || offset >= 1000) break;
  }
  return out;
}
