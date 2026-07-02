// ตรวจชนิดไฟล์การตลาดอัตโนมัติ แล้วเลือก parser ให้ถูก
// - ยอดขาย (Shopee Shop Stats) = .xlsx หลายชีต
// - โฆษณา (Shopee Ads CPC) = .csv มี metadata + ตารางแคมเปญ

import { parseShopeeShopStats, type ShopeeParseResult } from "@/lib/marketing/shopee-parser";
import { parseShopeeAdsCsv, looksLikeShopeeAds, type ShopeeAdsParseResult } from "@/lib/marketing/shopee-ads-parser";

export type ParsedMarketing =
  | { kind: "sales"; result: ShopeeParseResult }
  | { kind: "ads"; result: ShopeeAdsParseResult };

export async function parseMarketingFile(file: File, shop?: string): Promise<ParsedMarketing> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    if (looksLikeShopeeAds(text)) {
      return { kind: "ads", result: parseShopeeAdsCsv(text, { shop }) };
    }
    throw new Error("ไฟล์ CSV นี้ยังไม่รองรับ (รองรับเฉพาะรายงานโฆษณา Shopee)");
  }
  // .xlsx/.xls → รายงานยอดขาย Shopee Shop Stats
  const buf = await file.arrayBuffer();
  return { kind: "sales", result: await parseShopeeShopStats(buf, { shop }) };
}
