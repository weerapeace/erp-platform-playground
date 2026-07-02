// ตัวอ่านไฟล์ Shopee Ads (รายงานโฆษณา CPC) — CSV
// โครง: 6 บรรทัดแรก = metadata (User Name/ร้าน/Shop ID/สร้างเมื่อ/ระยะเวลา), บรรทัดว่าง, หัวตาราง, แล้วแถวราย "แคมเปญ"
// เป็นสรุปทั้งช่วง (period) รายแคมเปญ ไม่ใช่รายวัน

export interface AdsCampaign {
  campaign_name: string;
  status: string;
  ad_type: string;
  impressions: number;
  clicks: number;
  ctr: number;
  add_to_cart: number;
  orders: number;
  direct_orders: number;
  conversion_rate: number;
  cpa: number;
  items_sold: number;
  sales: number;
  direct_sales: number;
  spend: number;
  roas: number;
  direct_roas: number;
  acos: number;
  product_impressions: number;
  product_clicks: number;
  voucher_amount: number;
  vouchered_sales: number;
}

export interface ShopeeAdsParseResult {
  shop: string;
  platform: "shopee";
  report_type: "ads";
  period_start: string | null;
  period_end: string | null;
  generated_at: string | null;
  campaigns: AdsCampaign[];
  warnings: string[];
}

function num(v: unknown): number {
  if (v === "" || v === null || v === undefined) return 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  if (s === "" || s === "-") return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function toISO(d: string): string | null {
  const m = String(d).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else if (c === '"') {
      q = true;
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** เดาว่าไฟล์นี้เป็นรายงานโฆษณา Shopee หรือไม่ (จากเนื้อหา) */
export function looksLikeShopeeAds(text: string): boolean {
  const head = text.slice(0, 2000);
  return head.includes("รายงานโฆษณา") || (head.includes("ค่าโฆษณา") && head.includes("ROAS"));
}

export function parseShopeeAdsCsv(text: string, opts: { shop?: string } = {}): ShopeeAdsParseResult {
  const warnings: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  let shop = opts.shop || "";
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let generatedAt: string | null = null;

  // metadata
  for (const raw of lines.slice(0, 8)) {
    const cells = parseCsvLine(raw);
    const key = (cells[0] ?? "").trim();
    if (key === "User Name" && cells[1]) shop = shop || cells[1].trim();
    if (key === "รายงานถูกสร้างเมื่อ" && cells[1]) generatedAt = cells[1].trim();
    if (key === "ระยะเวลา" && cells[1]) {
      const parts = cells[1].split("-").map((x) => x.trim());
      if (parts.length >= 2) {
        periodStart = toISO(parts[0]);
        periodEnd = toISO(parts[1]);
      }
    }
  }

  // หาแถวหัวตาราง
  let hr = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if ((cells[0] ?? "").trim() === "ลำดับ" && cells.includes("ชื่อโฆษณา")) {
      hr = i;
      break;
    }
  }
  if (hr < 0) {
    warnings.push("ไม่พบหัวตารางโฆษณา — ไฟล์อาจไม่ใช่รายงาน Shopee Ads");
    return { shop, platform: "shopee", report_type: "ads", period_start: periodStart, period_end: periodEnd, generated_at: generatedAt, campaigns: [], warnings };
  }

  const header = parseCsvLine(lines[hr]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const col = {
    name: idx("ชื่อโฆษณา"),
    status: idx("สถานะ"),
    adType: idx("ประเภทโฆษณา"),
    impressions: idx("การมองเห็น"),
    clicks: idx("จำนวนคลิก"),
    ctr: idx("อัตราการคลิก (CTR)"),
    addToCart: idx("Add to Cart"),
    orders: idx("การสั่งซื้อ"),
    directOrders: idx("การสั่งซื้อโดยตรง"),
    conv: idx("อัตราการสั่งซื้อ"),
    cpa: idx("ราคาต่อการสั่งซื้อ"),
    itemsSold: idx("สินค้าที่ขายแล้ว"),
    sales: idx("ยอดขาย"),
    directSales: idx("ยอดขายโดยตรง"),
    spend: idx("ค่าโฆษณา"),
    roas: idx("ยอดขาย/รายจ่าย (ROAS)"),
    directRoas: idx("ผลตอบแทนจากการลงทุนโดยตรง (Direct ROAS)"),
    acos: idx("ACOS"),
    productImpr: idx("การมองเห็นสินค้า"),
    productClicks: idx("จำนวนคลิกสินค้า"),
    voucherAmt: idx("Voucher Amount"),
    voucheredSales: idx("Vouchered Sales"),
  };

  const campaigns: AdsCampaign[] = [];
  for (let i = hr + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = parseCsvLine(lines[i]);
    const name = (c[col.name] ?? "").trim();
    if (!name) continue;
    const g = (k: number) => (k >= 0 ? c[k] : "");
    campaigns.push({
      campaign_name: name,
      status: String(g(col.status) ?? "").trim(),
      ad_type: String(g(col.adType) ?? "").trim(),
      impressions: num(g(col.impressions)),
      clicks: num(g(col.clicks)),
      ctr: num(g(col.ctr)),
      add_to_cart: num(g(col.addToCart)),
      orders: num(g(col.orders)),
      direct_orders: num(g(col.directOrders)),
      conversion_rate: num(g(col.conv)),
      cpa: num(g(col.cpa)),
      items_sold: num(g(col.itemsSold)),
      sales: num(g(col.sales)),
      direct_sales: num(g(col.directSales)),
      spend: num(g(col.spend)),
      roas: num(g(col.roas)),
      direct_roas: num(g(col.directRoas)),
      acos: num(g(col.acos)),
      product_impressions: num(g(col.productImpr)),
      product_clicks: num(g(col.productClicks)),
      voucher_amount: num(g(col.voucherAmt)),
      vouchered_sales: num(g(col.voucheredSales)),
    });
  }

  if (campaigns.length === 0) warnings.push("ไม่พบข้อมูลแคมเปญในไฟล์");

  return {
    shop,
    platform: "shopee",
    report_type: "ads",
    period_start: periodStart,
    period_end: periodEnd,
    generated_at: generatedAt,
    campaigns,
    warnings,
  };
}
