/**
 * กฎของแท็บ "💰 ราคา" ใน Parent SKU (components/parent-price-tab · API /api/parent-skus/[id]/prices)
 * pure + เทสต์ lib/__tests__/parent-prices.test.ts
 *
 * เจ้าของขอ 2026-11-11: ตารางราคาซื้อ+ขาย · ขายมีทุก Platform + ราคากลาง · ปรับทั้งหมดทีเดียวได้
 *   · เตือนถ้าราคาไม่เท่ากัน (ปิดเตือนได้) · ราคาต้นทุน/ค่าแรง/ค่ารายการอื่น ๆ (เปิด-ปิดโชว์ได้)
 * ราคากลาง = skus_v2.list_price (ราคาขายที่ทุกช่องทางควรใช้) · ราคาบนร้าน = ราคาที่ลูกค้าจ่าย (ราคาลด ถ้ามี)
 */
import type { CostScenario } from "@/app/api/mo/[id]/cost/route";

/** ราคาที่ลูกค้าจ่ายบนร้าน = ราคาลด (ถ้ามีและต่ำกว่า) ไม่งั้นราคาปกติ */
export function shopPay(price: number | null | undefined, sale: number | null | undefined): number | null {
  const p = price == null ? null : Number(price);
  const s = sale == null ? null : Number(sale);
  if (s != null && Number.isFinite(s) && s > 0 && (p == null || s < p)) return s;
  return p != null && Number.isFinite(p) ? p : null;
}

/** ราคาบนร้านไม่เท่าราคากลาง (ต่างกันตั้งแต่ 1 บาท) · ไม่รู้ราคาฝั่งใดฝั่งหนึ่ง = ไม่เตือน */
export function priceMismatch(pay: number | null | undefined, central: number | null | undefined): boolean {
  if (pay == null || central == null || !(Number(central) > 0)) return false;
  return Math.abs(Number(pay) - Number(central)) >= 1;
}

export type SavedCostingLite = { target_type: string; target_code: string; scenario: unknown; qty_basis: number | null };

/** ต้นทุนที่บันทึกไว้ที่ใช้กับ SKU นี้: เฉพาะ SKU ก่อน → ของทั้งรุ่น → ไม่มี (ใช้ค่าตั้งต้น) */
export function pickSavedCosting(sku: string, parentCode: string, saved: SavedCostingLite[]): { from: "sku" | "parent" | null; scenario: CostScenario | null; qty: number } {
  const own = saved.find((x) => x.target_type === "sku" && x.target_code === sku);
  const par = saved.find((x) => x.target_type === "parent" && x.target_code === parentCode);
  const hit = own ?? par ?? null;
  return { from: own ? "sku" : par ? "parent" : null, scenario: (hit?.scenario as CostScenario | null) ?? null, qty: Number(hit?.qty_basis) > 0 ? Number(hit!.qty_basis) : 1 };
}

/** คอลัมน์ต้นทุนที่เปิด/ปิดได้ (ค่าตั้งต้นเปิดทั้งหมด) */
export const COST_COLUMNS = [
  { key: "buy", label: "ราคาซื้อ" },
  { key: "material", label: "วัตถุดิบ" },
  { key: "labor", label: "ค่าแรง" },
  { key: "extras", label: "ค่าอื่น ๆ" },
  { key: "cost", label: "ต้นทุนรวม" },
  { key: "profit", label: "กำไร/ชิ้น" },
  { key: "margin", label: "% กำไร" },
] as const;
export type CostColumnKey = typeof COST_COLUMNS[number]["key"];

/** อ่านค่าตั้งของผู้ใช้ (ซ่อนคอลัมน์ไหน + เตือนไหม) — ผิดรูป = null */
export function parsePriceTabPrefs(raw: unknown): { hiddenCost: CostColumnKey[]; warn: boolean } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const keys = new Set<string>(COST_COLUMNS.map((c) => c.key));
  const hidden = Array.isArray(r.hiddenCost) ? r.hiddenCost.filter((k): k is CostColumnKey => typeof k === "string" && keys.has(k)) : [];
  return { hiddenCost: hidden, warn: r.warn !== false };
}

// ───────── ค่าธรรมเนียมร้าน + กำไรจริงต่อร้าน (เจ้าของขอ 2026-11-11 "กำไรจริงต่อร้าน หักค่าธรรมเนียม") ─────────
/** เก็บใน ui_config key นี้ (แก้ได้คนมีสิทธิ์ products.edit · มี audit ที่ /api/ui-config) */
export const FEE_RATES_KEY = "platform_fee_rates";
/** ค่าธรรมเนียมต่อร้าน: pct = % ของราคาที่ลูกค้าจ่าย (รวมค่าคอม+ค่าธุรกรรม+โปรแกรมส่งฟรี ฯลฯ) · fixed = บาท/ชิ้น */
export type FeeRate = { pct: number; fixed: number };
export type FeeRates = Record<string, FeeRate>;   // key = รหัสแพลตฟอร์ม (shopee/lazada/line_shopping/website …)

export function parseFeeRates(raw: unknown): FeeRates {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).rates : null;
  const out: FeeRates = {};
  if (!r || typeof r !== "object" || Array.isArray(r)) return out;
  for (const [code, v] of Object.entries(r as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const pct = Number((v as Record<string, unknown>).pct); const fixed = Number((v as Record<string, unknown>).fixed);
    const p = Number.isFinite(pct) && pct >= 0 && pct < 100 ? pct : 0;
    const f = Number.isFinite(fixed) && fixed >= 0 ? fixed : 0;
    if (p > 0 || f > 0) out[code] = { pct: p, fixed: f };
  }
  return out;
}

/** กำไรจริงต่อชิ้นบนร้าน = ราคาที่ลูกค้าจ่าย − ค่าธรรมเนียม (pct% + บาท/ชิ้น) − ต้นทุน/ชิ้น */
export function netProfit(pay: number | null | undefined, costPP: number, fee: FeeRate | null | undefined): { fee: number; net: number; marginPct: number } | null {
  if (pay == null || !Number.isFinite(Number(pay))) return null;
  const p = Number(pay);
  const f = fee ? Math.round((p * fee.pct / 100 + fee.fixed) * 100) / 100 : 0;
  const net = Math.round((p - f - costPP) * 100) / 100;
  return { fee: f, net, marginPct: p > 0 ? Math.round((net / p) * 1000) / 10 : 0 };
}
