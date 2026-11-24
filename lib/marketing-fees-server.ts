/**
 * ค่าธรรมเนียมแพลตฟอร์มจริง (ของกลาง · server เท่านั้น) — หน้าภาพรวมการตลาด แท็บค่าธรรมเนียม/กำไร + ตัวเตือนทุกเช้า
 * --------------------------------------------------------------------------
 * ข้อมูลต่อออเดอร์ = raw.shopee_income / raw.lazada_income — เติมโดย
 *   • ตัวดึงเบื้องหลัง /api/cron/platform-fees (ทุก 30 นาที · เจ้าของเลือก 2026-11-24 รอบ 2 ข้อ 1)
 *   • หน้ารายละเอียดออเดอร์ /api/platform-orders/income (กดดูทีละใบ)
 * จัดหมวด/รวม = lib/marketing-profit-calc (pure + เทสต์)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { countsAsSale } from "@/lib/platform-order-status";
import { loadOrderItems, loadPlatformOrders, type SalesOrderLite } from "@/lib/platform-sales-load";
import { itemValueByOrder, orderValue, shiftYmd, type ItemLite } from "@/lib/platform-dashboard-calc";
import { feeSpikes, feeSummary, type FeePlatformSummary, type OrderIncome } from "@/lib/marketing-profit-calc";

type Admin = ReturnType<typeof supabaseAdmin>;

/** แพลตฟอร์มที่ดึงค่าธรรมเนียมจริงได้ (TikTok ต้องเปิดสิทธิ์การเงินในแอปก่อน) */
export const FEE_PLATFORMS = ["shopee", "lazada"] as const;
export const incomeKeyOf = (code: string): string | null => (code === "shopee" ? "shopee_income" : code === "lazada" ? "lazada_income" : null);

/** บรรทัดรายได้ของออเดอร์ (ถามทีละ 200 ใบ พร้อมกัน 4 ชุด · ดึงเฉพาะ 2 ช่อง ไม่ดึง raw ทั้งก้อน) */
export async function loadOrderIncome(admin: Admin, ids: readonly string[]): Promise<Map<string, OrderIncome>> {
  const uniq = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 200) chunks.push(uniq.slice(i, i + 200));
  const out = new Map<string, OrderIncome>();
  type Row = { id: string; si: unknown; li: unknown };
  for (let i = 0; i < chunks.length; i += 4) {
    const got = await Promise.all(chunks.slice(i, i + 4).map((part) => fetchAllPages<Row>((a, b) =>
      admin.from("platform_orders").select("id, si:raw->shopee_income, li:raw->lazada_income").in("id", part).order("id", { ascending: true }).range(a, b))));
    for (const rows of got) for (const r of rows) { const inc = r.si ?? r.li; if (inc && typeof inc === "object" && !Array.isArray(inc)) out.set(r.id, inc as OrderIncome); }
  }
  return out;
}

export type FeeContext = {
  orders: SalesOrderLite[]; items: ItemLite[]; valByOrder: Map<string, number>; income: Map<string, OrderIncome>;
  codeOf: (o: SalesOrderLite) => string; summary: FeePlatformSummary[];
};

/** ออเดอร์ที่นับเป็นยอดขายในช่วง + มูลค่า + ค่าธรรมเนียมที่รู้แล้ว + สรุปแยกช่องทาง */
export async function loadFeeContext(admin: Admin, f: { fromYmd: string; toYmd: string; platformId?: string | null; brandId?: string | null }, codeById: Map<string, string>): Promise<FeeContext> {
  const orders = (await loadPlatformOrders(admin, f)).filter(countsAsSale);
  const items = await loadOrderItems(admin, orders.map((o) => o.id));
  const valByOrder = itemValueByOrder(items);
  const codeOf = (o: SalesOrderLite) => codeById.get(o.platform_id ?? "") ?? "other";
  const income = await loadOrderIncome(admin, orders.filter((o) => incomeKeyOf(codeOf(o))).map((o) => o.id));
  const summary = feeSummary(orders.map((o) => ({ platform: codeOf(o), value: orderValue(o, valByOrder), income: income.get(o.id) })));
  return { orders, items, valByOrder, income, codeOf, summary };
}

/** ช่องทางที่ค่าธรรมเนียม 7 วันล่าสุด สูงกว่าปกติ (30 วันก่อนหน้า) — ใช้ในกล่องเตือน + ตัวเตือนทุกเช้า */
type Spike = { platform: string; name: string; pct: number; basePct: number; fee: number };
const spikeCache = new Map<string, { at: number; v: Spike[] }>();   // คิดหนัก (ออเดอร์ 37 วัน) — จำไว้ 30 นาทีต่อเครื่อง กันหน้าการตลาดช้า
export async function recentFeeSpikes(admin: Admin, today: string, f: { platformId?: string | null; brandId?: string | null } = {}): Promise<Spike[]> {
  const key = `${today}|${f.platformId ?? ""}|${f.brandId ?? ""}`;
  const hit = spikeCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.v;
  const v = await computeFeeSpikes(admin, today, f);
  spikeCache.set(key, { at: Date.now(), v });
  return v;
}
async function computeFeeSpikes(admin: Admin, today: string, f: { platformId?: string | null; brandId?: string | null }): Promise<Spike[]> {
  const { data } = await admin.from("erp_platforms").select("id, code, name_th");
  const rows = (data ?? []) as { id: string; code: string; name_th: string | null }[];
  const codes = new Map(rows.map((r) => [r.id, r.code]));
  const [ctx, base] = await Promise.all([
    loadFeeContext(admin, { fromYmd: shiftYmd(today, -7), toYmd: shiftYmd(today, -1), ...f }, codes),
    loadFeeContext(admin, { fromYmd: shiftYmd(today, -37), toYmd: shiftYmd(today, -8), ...f }, codes),
  ]);
  return feeSpikes(ctx.summary, base.summary).map((s) => ({ ...s, name: rows.find((r) => r.code === s.platform)?.name_th ?? s.platform }));
}
