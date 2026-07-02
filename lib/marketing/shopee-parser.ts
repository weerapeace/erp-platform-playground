// ตัวอ่านไฟล์ Shopee "Shop Stats" (สถิติภาพรวมร้าน) → โครงข้อมูลกลาง
// ไฟล์ Shopee ไม่ใช่ตารางแบน: 12 ชีต = 3 กลุ่ม (ยอดรวม+รายชั่วโมง / ที่มา traffic / ราย SKU) × 3 สถานะ
// หัวตารางไม่อยู่บรรทัดแรก + หลายบล็อกในชีตเดียว → ต้องอ่านแบบเฉพาะทาง (template "shopee_shop_stats_v1")

import type {
  OrderStatusKey,
  DailySummary,
  HourlyPoint,
  ProductRow,
  TrafficBreakdown,
  StatusData,
} from "@/lib/marketing/mock-data";

export interface ShopeeParseResult {
  shop: string;
  platform: "shopee";
  date: string | null;
  byStatus: Partial<Record<OrderStatusKey, StatusData>>;
  warnings: string[];
}

type Grid = unknown[][];

/* ---------- helpers ---------- */
function num(v: unknown): number {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function toISODate(s: unknown): string | null {
  const m = String(s ?? "").match(/^(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function hourOf(s: unknown): number | null {
  const m = String(s ?? "").match(/(\d{2}):00$/);
  return m ? parseInt(m[1], 10) : null;
}
const DATE_RANGE_RE = /^\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{4}$/;

const SUMMARY_SHEET: Record<OrderStatusKey, string> = {
  all: "ทั้งหมด",
  confirmed: "ยืนยันแล้ว",
  paid: "ชำระเงินแล้ว",
};
const STATUS_LABEL: Record<OrderStatusKey, string> = {
  all: "ทั้งหมด",
  confirmed: "ยืนยันแล้ว",
  paid: "ชำระเงินแล้ว",
};
const STATUS_ORDER: OrderStatusKey[] = ["all", "confirmed", "paid"];

/* ---------- section parsers ---------- */
// daily: แถวสรุปทั้งวัน (col0 = ช่วงวันที่ "30-06-2026-30-06-2026")
// cols: 1 gross,2 gross_excl,3 orders,4 aov,5 clicks,6 visitors,7 conv,
//       8 cancelO,9 cancelS,10 refundO,11 refundS,12 buyers,13 new,14 ret,15 potential,16 repeat
function parseDaily(g: Grid): DailySummary | null {
  const r = g.find((row) => DATE_RANGE_RE.test(String(row?.[0] ?? "")));
  if (!r) return null;
  return {
    date: toISODate(r[0]) ?? "",
    gross_sales: num(r[1]),
    sales_excl_shopee_discount: num(r[2]),
    orders: num(r[3]),
    aov: num(r[4]),
    clicks: num(r[5]),
    visitors: num(r[6]),
    conversion_rate: num(r[7]),
    cancelled_orders: num(r[8]),
    cancelled_sales: num(r[9]),
    refund_orders: num(r[10]),
    refund_sales: num(r[11]),
    buyers: num(r[12]),
    new_buyers: num(r[13]),
    returning_buyers: num(r[14]),
    potential_buyers: num(r[15]),
    repeat_rate: num(r[16]),
  };
}
// hourly: ทุกแถวที่ col0 = "30-06-2026 00:00"
function parseHourly(g: Grid): HourlyPoint[] {
  const out: HourlyPoint[] = [];
  for (const r of g) {
    const h = hourOf(r?.[0]);
    if (h === null) continue;
    out.push({
      hour: h,
      gross_sales: num(r[1]),
      orders: num(r[3]),
      clicks: num(r[5]),
      visitors: num(r[6]),
      conversion_rate: num(r[7]),
    });
  }
  // เอาเฉพาะ 00:00–23:00 ไม่ซ้ำ (บล็อกแรก)
  const seen = new Set<number>();
  return out.filter((p) => {
    if (seen.has(p.hour)) return false;
    seen.add(p.hour);
    return true;
  });
}
// products: header "รหัสสินค้า" แล้วแถว SKU (col0 = id ตัวเลขยาว) จนเจอแถวไม่ใช่สินค้า
function parseProducts(g: Grid): ProductRow[] {
  let hr = -1;
  for (let i = 0; i < g.length; i++) {
    if (String(g[i]?.[0] ?? "") === "รหัสสินค้า") {
      hr = i;
      break;
    }
  }
  if (hr < 0) return [];
  const out: ProductRow[] = [];
  for (let i = hr + 1; i < g.length; i++) {
    const r = g[i];
    const id = String(r?.[0] ?? "").trim();
    if (!/^\d{5,}$/.test(id)) break;
    out.push({
      marketplace_item_id: id,
      product_name: String(r[1] ?? "").trim(),
      product_status: String(r[2] ?? "").trim(),
      sales_share: num(r[3]),
      sales: num(r[4]),
      impressions: num(r[5]),
      clicks: num(r[6]),
      orders: num(r[7]),
      units: num(r[8]),
      ctr: num(r[9]),
      conversion_rate: num(r[10]),
      aov: num(r[11]),
      buyers: num(r[12]),
    });
  }
  return out;
}
// traffic: row1 = สรุป, cols 2 total,3 product_page,4 live,5 video,6 partner,7 shopee_ads
function parseTraffic(g: Grid): TrafficBreakdown {
  const r = g.find((row) => DATE_RANGE_RE.test(String(row?.[0] ?? ""))) ?? [];
  return {
    total: num(r[2]),
    product_page: num(r[3]),
    live: num(r[4]),
    video: num(r[5]),
    partner: num(r[6]),
    shopee_ads: num(r[7]),
  };
}

/* ---------- main ---------- */
export async function parseShopeeShopStats(
  buf: ArrayBuffer,
  opts: { shop?: string } = {},
): Promise<ShopeeParseResult> {
  const XLSX: typeof import("xlsx") = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const warnings: string[] = [];

  const grid = (name: string): Grid | null => {
    const ws = wb.Sheets[name];
    if (!ws) return null;
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as Grid;
  };

  // ชีต traffic / products มีชื่อยาวเกิน 31 ตัว → ถูก Excel ตัด, จับด้วย prefix แล้วเรียงลำดับ (all→confirmed→paid)
  const trafficSheets = wb.SheetNames.filter((n) => n.startsWith("ที่มาของการเข้าชม"));
  const productSheets = wb.SheetNames.filter((n) => n.startsWith("ส่วนแบ่งรายการสินค้า"));

  const byStatus: Partial<Record<OrderStatusKey, StatusData>> = {};
  let date: string | null = null;

  STATUS_ORDER.forEach((status, idx) => {
    const gSum = grid(SUMMARY_SHEET[status]);
    if (!gSum) {
      warnings.push(`ไม่พบชีต "${SUMMARY_SHEET[status]}" (สถานะ ${STATUS_LABEL[status]})`);
      return;
    }
    const daily = parseDaily(gSum);
    if (!daily) {
      warnings.push(`อ่านยอดสรุปรายวันของสถานะ ${STATUS_LABEL[status]} ไม่ได้`);
      return;
    }
    if (!date) date = daily.date || null;

    const gProd = productSheets[idx] ? grid(productSheets[idx]) : null;
    const gTraf = trafficSheets[idx] ? grid(trafficSheets[idx]) : null;

    byStatus[status] = {
      label: STATUS_LABEL[status],
      daily,
      hourly: parseHourly(gSum),
      products: gProd ? parseProducts(gProd) : [],
      traffic: gTraf
        ? parseTraffic(gTraf)
        : { total: daily.gross_sales, product_page: 0, live: 0, video: 0, partner: 0, shopee_ads: 0 },
    };
  });

  if (Object.keys(byStatus).length === 0) {
    warnings.push("ไม่พบชีตยอดขายที่รู้จัก — ไฟล์อาจไม่ใช่รายงาน Shopee Shop Stats");
  }

  const shop = opts.shop || guessShopFromNothing();
  return { shop, platform: "shopee", date, byStatus, warnings };
}

function guessShopFromNothing(): string {
  return "";
}

/** ดึงชื่อร้าน + ช่วงวันที่จากชื่อไฟล์ Shopee เช่น
 *  "louismontini_officialshop.shopee-shop-stats.20260630-20260630.xlsx" */
export function parseShopeeFileName(fileName: string): {
  shop: string;
  periodStart: string | null;
  periodEnd: string | null;
} {
  const base = fileName.replace(/\.(xlsx|xls|csv)$/i, "");
  const parts = base.split(".");
  const shop = parts[0] || "";
  const range = parts.find((p) => /^\d{8}-\d{8}$/.test(p));
  const iso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (range) {
    const [a, b] = range.split("-");
    periodStart = iso(a);
    periodEnd = iso(b);
  }
  return { shop, periodStart, periodEnd };
}
