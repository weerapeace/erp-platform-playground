/**
 * 📈 ยอดขายสินค้าบนแพลตฟอร์ม (ของกลาง · ฝั่งเซิร์ฟเวอร์) — ตัวนับเดียวที่ใช้ทั้ง
 *   - หน้า /master/platform-sales (API /api/platform-sales/report · รายเดือน/รายวัน)
 *   - รายงานอัตโนมัติ "ยอดขายแพลตฟอร์มรายวัน" (lib/email-report/source-platform-sales → Gmail / LINE / Discord)
 * ตัวเลขสองที่จึงตรงกันเสมอ
 *
 * กติกา:
 *   - อ่าน platform_orders + platform_order_items ทุกแหล่ง (เมล / ไฟล์ / API) ตามวันที่สั่งซื้อ "เวลาไทย"
 *   - ไม่นับออเดอร์ที่ยกเลิก (นับแยก) · ยอดเงิน = ราคาสินค้า × จำนวน (ไม่รวมค่าส่ง · ยังไม่หักค่าธรรมเนียม)
 *   - สินค้าที่ยังไม่จับคู่ SKU ยังนับ (โชว์ชื่อจากร้าน) · ผูกระดับรุ่น (matched_parent_sku_id) = แถว "รุ่น X (ไม่แยกสี)"
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { SKU_COVER_SELECT, coverUrl, resolveSkuCover } from "@/lib/sku-cover";

type Admin = ReturnType<typeof supabaseAdmin>;
export type SalesRange = { from: string; to: string };

/** ต้นวัน/ต้นวันถัดไป ตามเวลาไทย (00:00 น. ไทย = 17:00 UTC ของวันก่อน) · date = "YYYY-MM-DD" */
export function dayBoundsTh(date: string): SalesRange {
  const [y, m, d] = date.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, d, -7)).toISOString(), to: new Date(Date.UTC(y, m - 1, d + 1, -7)).toISOString() };
}
/** ต้นเดือน/ต้นเดือนถัดไป ตามเวลาไทย · ym = "YYYY-MM" */
export function monthBoundsTh(ym: string): SalesRange {
  const [y, m] = ym.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1, -7)).toISOString(), to: new Date(Date.UTC(y, m, 1, -7)).toISOString() };
}
/** วันที่ไทย "YYYY-MM-DD" ของเวลา ISO · เลื่อนวันได้ (shift = -1 → เมื่อวาน) */
export function thaiDate(iso: string | Date = new Date(), shift = 0): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(t + 7 * 3600_000 + shift * 86400_000).toISOString().slice(0, 10);
}
export const isDateKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
/** ช่วงหลายวันตามเวลาไทย: n วันที่จบที่ end (รวม end) · end = "YYYY-MM-DD" */
export function daysBoundsTh(end: string, n: number): SalesRange {
  const [y, m, d] = end.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, d - (n - 1), -7)).toISOString(), to: new Date(Date.UTC(y, m - 1, d + 1, -7)).toISOString() };
}
/** เลื่อนวันที่ "YYYY-MM-DD" ไป n วัน */
export const shiftDateKey = (date: string, n: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
/** เดือนก่อนหน้าของ "YYYY-MM-DD" หรือ "YYYY-MM" → "YYYY-MM" */
export const prevMonthKey = (dateOrYm: string) => { const [y, m] = dateOrYm.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); };

/**
 * ชื่อสินค้าสั้น (แถวเดียว) จากชื่อยาวบนแพลตฟอร์ม/ERP — "Louis Montini (Shiisaa) กระเป๋าสตางค์ผู้ชาย… TTM121" → "Shiisaa กระเป๋าสตางค์ผู้ชาย…"
 * ตัดชื่อแบรนด์หน้าวงเล็บ (เหลือชื่อรุ่นในวงเล็บ) · ตัดรหัสรุ่นท้ายชื่อ · ยาวเกิน max ตัดแล้วใส่ …
 */
export function shortProductName(title: string, max = 40): string {
  let s = title.replace(/\s+/g, " ").trim();
  const m = /^[^()]{2,40}\(([^)]{1,40})\)\s*(.*)$/.exec(s);
  if (m) s = `${m[1].trim()} ${m[2]}`.trim();
  s = s.replace(/\s+[A-Z]{2,}\d{1,4}[A-Z]?(-[\w/]+)?$/, "").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
/** กุญแจแถว (ร้าน × สินค้า) — ใช้จับคู่แถวข้ามช่วงเวลา (เทียบวันก่อนรายสินค้า) */
export const salesLineKey = (l: Pick<SalesLine, "shop" | "code" | "title" | "color" | "match">) =>
  `${l.shop}|${l.match === "sku" ? l.code : l.match === "model" ? `รุ่น:${l.code}` : `${l.title}|${l.color ?? ""}`}`;

/** สินค้า 1 แถว ต่อ ร้าน × SKU (หรือ × รุ่น / × ชื่อจากร้าน เมื่อยังไม่จับคู่) */
export type SalesLine = {
  shop: string;
  /** รหัส SKU / รหัสรุ่น (ไม่แยกสี) / null = ยังไม่จับคู่ */
  code: string | null;
  /** ชื่อสินค้าจากร้าน */
  title: string;
  /** สีของ SKU (ERP) หรือตัวเลือกจากเมล (ยังไม่จับคู่) */
  color: string | null;
  match: "sku" | "model" | "none";
  qty: number;
  amt: number;
  image: string | null;
  /** id SKU (match sku) — ใช้ดึงสต๊อกคงเหลือ */
  sku_id: string | null;
  /** รุ่นแม่ (Parent SKU) — จัดกลุ่มตามรุ่น · null = ยังไม่จับคู่ / SKU ไม่มีรุ่น */
  parent: { code: string; name: string | null } | null;
  /** ชื่อแพลตฟอร์ม (Shopee / Lazada …) — จัดกลุ่มตามแพลตฟอร์ม */
  platform: string;
};
export type DailyTotal = { date: string; orders: number; cancelled: number; qty: number; amount: number };
export type PlatformSales = {
  platforms: { id: string; code: string; name_th: string }[];
  brands: { id: string; name: string }[];
  summary: { orders: number; cancelled: number; qty: number; amount: number; no_price_orders: number; pending_items: number; returns: number; from_email: number };
  by_shop: { shop: string; orders: number; qty: number; amount: number }[];
  lines: SalesLine[];
  /** ยอดรายวันในช่วง (เรียงตามวัน) */
  daily: DailyTotal[];
};

type OrderRow = { id: string; platform_id: string; brand_id: string | null; status: string; source: string | null; ordered_at: string | null };
type ItemRow = { order_id: string; name: string | null; qty: number | null; price: number | null; matched_sku_id: string | null; matched_parent_sku_id: string | null; raw: Record<string, unknown> | null };

/** ชื่อแถวแบบเดิมของหน้ารายงาน (ตาราง SoldProductsTable) — ชื่อ · สี / — รุ่น X (ไม่แยกสี) / — ยังไม่จับคู่ */
export function lineDisplayName(l: SalesLine): string {
  if (l.match === "sku") return `${l.title}${l.color ? ` · ${l.color}` : ""}`;
  if (l.match === "model") return `${l.title} — รุ่น ${l.code} (ไม่แยกสี)`;
  return `${l.title}${l.color ? ` · ${l.color}` : ""} — ยังไม่จับคู่`;
}

export async function loadPlatformSales(admin: Admin, opts: { range: SalesRange; platformId?: string; brandId?: string }): Promise<PlatformSales> {
  const { from, to } = opts.range;
  const [{ data: pf }, { data: br }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th").in("code", ["shopee", "lazada", "tiktok", "line_shopping", "website"]).order("sort_order"),
    admin.from("brands").select("id, name").order("name"),
  ]);
  const platforms = (pf ?? []) as { id: string; code: string; name_th: string }[];
  const brands = (br ?? []) as { id: string; name: string }[];
  const pfName = new Map(platforms.map((p) => [p.id, p.name_th]));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  const orders = await fetchAllPages<OrderRow>((a, b) => {
    let q = admin.from("platform_orders").select("id, platform_id, brand_id, status, source, ordered_at").gte("ordered_at", from).lt("ordered_at", to).order("id").range(a, b);
    if (opts.platformId) q = q.eq("platform_id", opts.platformId);
    if (opts.brandId) q = q.eq("brand_id", opts.brandId);
    return q;
  });
  const active = orders.filter((o) => o.status !== "cancelled");
  const orderOf = new Map(active.map((o) => [o.id, o]));

  const items: ItemRow[] = [];
  const ids = active.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from("platform_order_items").select("order_id, name, qty, price, matched_sku_id, matched_parent_sku_id, raw").in("order_id", ids.slice(i, i + 300));
    items.push(...((data ?? []) as ItemRow[]));
  }

  const skuIds = [...new Set(items.map((i) => i.matched_sku_id).filter(Boolean) as string[])];
  const skuInfo = new Map<string, { code: string; color: string | null; image: string | null; parent_id: string | null }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data } = await admin.from("skus_v2").select(`id, code, color_platform_th, color, parent_sku_id, ${SKU_COVER_SELECT}`).in("id", skuIds.slice(i, i + 300));
    for (const s of (data ?? []) as Record<string, unknown>[]) {
      skuInfo.set(String(s.id), { code: String(s.code), color: (s.color_platform_th as string | null) ?? (s.color as string | null) ?? null, image: coverUrl(resolveSkuCover(s).key), parent_id: (s.parent_sku_id as string | null) ?? null });
    }
  }
  // รุ่นแม่: ของ SKU (จัดกลุ่มตาม Parent SKU) + ผูกระดับรุ่น (ไม่แยกสี เช่น Lazada ที่เมลไม่บอกสี → แถว "รุ่น X (ไม่แยกสี)")
  const parentIds = [...new Set([
    ...items.filter((i) => !i.matched_sku_id && i.matched_parent_sku_id).map((i) => i.matched_parent_sku_id as string),
    ...[...skuInfo.values()].map((s) => s.parent_id).filter((x): x is string => !!x),
  ])];
  const parentOf = new Map<string, { code: string; name: string | null }>();
  for (let i = 0; i < parentIds.length; i += 300) {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th").in("id", parentIds.slice(i, i + 300));
    for (const p of (data ?? []) as { id: string; code: string; name_th: string | null }[]) parentOf.set(p.id, { code: p.code, name: p.name_th ?? null });
  }
  const parentCode = new Map([...parentOf].map(([id, p]) => [id, p.code]));

  // รวมเป็นแถวละ ร้าน × สินค้า
  const shopLabel = (o: OrderRow) => [pfName.get(o.platform_id) ?? "แพลตฟอร์มอื่น", o.brand_id ? brandName.get(o.brand_id) : null].filter(Boolean).join(" · ");
  const rows = new Map<string, SalesLine>();
  const byShop = new Map<string, { shop: string; orders: Set<string>; qty: number; amount: number }>();
  const byDay = new Map<string, DailyTotal>();
  const day = (o: OrderRow) => {
    const d = o.ordered_at ? thaiDate(o.ordered_at) : "";
    const t = byDay.get(d) ?? { date: d, orders: 0, cancelled: 0, qty: 0, amount: 0 };
    byDay.set(d, t);
    return t;
  };
  for (const o of orders) { const t = day(o); if (o.status === "cancelled") t.cancelled++; else t.orders++; }
  let qty = 0, amount = 0, pending = 0;
  const noPrice = new Set<string>();
  for (const it of items) {
    const o = orderOf.get(it.order_id);
    if (!o) continue;
    const q = Number(it.qty ?? 0), amt = it.price != null ? Number(it.price) * q : 0;
    if (it.price == null) noPrice.add(o.id);
    const sku = it.matched_sku_id ? skuInfo.get(it.matched_sku_id) : undefined;
    const model = !sku && it.matched_parent_sku_id ? parentCode.get(it.matched_parent_sku_id) : undefined;
    if (!sku && !model) pending++;
    const variant = (it.raw?.variant as string | null) ?? null;
    const shop = shopLabel(o);
    const title = it.name ?? sku?.code ?? model ?? "(ไม่มีชื่อ)";
    const key = `${shop}|${sku?.code ?? (model ? `รุ่น:${model}` : `${title}|${variant ?? ""}`)}`;
    const parentId = sku ? sku.parent_id : model ? it.matched_parent_sku_id : null;
    const r = rows.get(key) ?? {
      shop, code: sku?.code ?? model ?? null, title, color: sku ? sku.color : model ? null : variant,
      match: sku ? "sku" : model ? "model" : "none", qty: 0, amt: 0, image: sku?.image ?? null,
      sku_id: sku ? it.matched_sku_id : null, parent: parentId ? parentOf.get(parentId) ?? null : null,
      platform: pfName.get(o.platform_id) ?? "แพลตฟอร์มอื่น",
    } satisfies SalesLine;
    r.qty += q; r.amt += amt;
    rows.set(key, r);
    const s = byShop.get(shop) ?? { shop, orders: new Set<string>(), qty: 0, amount: 0 };
    s.orders.add(o.id); s.qty += q; s.amount += amt;
    byShop.set(shop, s);
    const t = day(o); t.qty += q; t.amount += amt;
    qty += q; amount += amt;
  }

  // คำขอคืนเงินที่เข้ามาในช่วงนี้ — นับต่อคำขอ (ยื่นคำขอ + ผลพิจารณาของเลขเดียวกัน = 1) · ไม่หักยอด
  const { data: ret } = await admin.from("platform_email_inbox").select("id, ref_no, external_order_id")
    .eq("kind", "return_requested").gte("received_at", from).lt("received_at", to).limit(5000);
  const returns = new Set(((ret ?? []) as { id: string; ref_no: string | null; external_order_id: string | null }[])
    .map((r) => r.ref_no ?? r.external_order_id ?? r.id)).size;

  return {
    platforms, brands,
    summary: {
      orders: active.length, cancelled: orders.length - active.length, qty, amount,
      no_price_orders: noPrice.size, pending_items: pending, returns,
      from_email: active.filter((o) => o.source === "email").length,
    },
    by_shop: [...byShop.values()].map((s) => ({ shop: s.shop, orders: s.orders.size, qty: s.qty, amount: s.amount })).sort((a, b) => b.amount - a.amount),
    lines: [...rows.values()],
    daily: [...byDay.values()].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
