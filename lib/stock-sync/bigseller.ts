/**
 * 🔄 ซิงค์สต๊อก — ตัวอ่านไฟล์ export จาก BigSeller (ของกลาง · ฝั่งไหนก็เรียกได้ ไม่มี "use client")
 *
 * ไฟล์มาจากหน้า Inventory List > Import & Export ของ BigSeller (Excel/CSV)
 * อ่านไฟล์ + ให้ผู้ใช้จับคู่คอลัมน์ด้วยของกลาง ImportWizard (lib/import) → ส่งแถวที่จับคู่แล้วมาที่ API
 * ไฟล์นี้ทำหน้าที่ "ทำแถวให้สะอาด": แปลงตัวเลข · รวมยอดหลายคลังของรหัสเดียวกัน · แยกสินค้าชุด
 *
 * ชื่อคอลัมน์จริงของ BigSeller ยังไม่ยืนยัน (ไม่มีไฟล์ตัวอย่าง) → aliases เดาไว้ทั้งไทย/อังกฤษ
 * ถ้าเดาไม่ถูก ผู้ใช้เลือกคอลัมน์เองในขั้น "Map คอลัมน์" ได้เสมอ
 */
import type { ImportSchema } from "@/lib/import";

export const BIGSELLER_IMPORT_SCHEMA: ImportSchema = {
  entityType: "bigseller_inventory",
  label: "สต๊อกจาก BigSeller",
  uniqueKey: "merchant_sku",
  fields: [
    // ไม่ตั้ง required: ไฟล์ export จริงมักมีแถวว่าง/แถวสรุป → ตัวนำเข้ากลางจะบล็อกทั้งไฟล์
    // ให้ API ข้ามแถวที่ไม่มีรหัสแทน (โผล่ในรายการ "แถวที่พลาด" พร้อมเหตุผล ดาวน์โหลดได้)
    {
      key: "merchant_sku", label: "รหัส SKU (BigSeller)", type: "text",
      aliases: ["merchant sku", "merchant sku code", "sku", "sku code", "seller sku", "รหัส sku", "sku ร้านค้า", "รหัสสินค้า", "รหัส"],
    },
    {
      key: "name", label: "ชื่อสินค้า", type: "text",
      aliases: ["sku name", "product name", "title", "name", "ชื่อ sku", "ชื่อสินค้า", "ชื่อ"],
    },
    {
      key: "qty_available", label: "พร้อมขาย (Available)", type: "number",
      aliases: ["available", "available stock", "available qty", "available quantity", "สต็อกที่ใช้ได้", "สต๊อกที่ใช้ได้", "พร้อมขาย", "ใช้ได้"],
    },
    {
      key: "qty_on_hand", label: "ของในคลัง (On Hand)", type: "number",
      aliases: ["on hand", "onhand", "on-hand", "on hand stock", "stock", "quantity", "qty", "สต็อก", "สต๊อก", "คงคลัง", "คงเหลือ", "จำนวน"],
    },
    {
      key: "warehouse", label: "คลัง (ใน BigSeller)", type: "text",
      aliases: ["warehouse", "warehouse name", "คลัง", "คลังสินค้า", "ชื่อคลัง"],
    },
    {
      key: "sku_type", label: "ประเภท SKU (ชุด/เดี่ยว)", type: "text",
      aliases: ["sku type", "type", "merchant sku type", "ประเภท sku", "ประเภท"],
    },
  ],
};

export type BigSellerInRow = Record<string, unknown>;

export type BigSellerItem = {
  /** รหัสตามที่เขียนในไฟล์ (แถวแรกที่เจอ) */
  code: string;
  name: string | null;
  /** พร้อมขาย — รวมทุกคลังที่นับ · null = ไฟล์ไม่มีคอลัมน์นี้ */
  available: number | null;
  /** ของในคลัง — รวมทุกคลังที่นับ · null = ไฟล์ไม่มีคอลัมน์นี้ */
  onHand: number | null;
  isCombo: boolean;
  warehouses: string[];
  /** เลขแถวใน Excel (นับหัวตาราง = แถว 1) */
  rows: number[];
};

export type BigSellerSkip = { row: number; code: string; reason: string };

const str = (v: unknown) => (v == null ? "" : String(v).trim());

/** "1,234" · "12.0" · " 5 " → ตัวเลข · ว่าง/ขีด/อ่านไม่ได้ → null */
export function parseQty(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  const t = str(v).replace(/[,\s]/g, "");
  if (!t || /^[-–—_.]+$/.test(t)) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

/** BigSeller เรียกสินค้าชุดว่า Combination SKU / Combo / Bundle · ไทย "ชุด" */
export function isComboType(v: unknown): boolean {
  return /combo|combination|bundle|kit|ชุด|เซ็ต|เซต/i.test(str(v));
}

/** คีย์รวมยอด = รหัสตัวใหญ่ ไม่มีช่องว่างหัวท้าย (ตรงกับกติกาจับคู่ของฐานข้อมูล) */
export const codeKey = (code: string) => code.trim().toUpperCase();

const maxN = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));
const sumN = (list: (number | null)[]) => list.some((n) => n != null) ? list.reduce<number>((s, n) => s + (n ?? 0), 0) : null;

/**
 * ทำแถวจากไฟล์ให้พร้อมบันทึก
 * - รหัสเดียวกัน "ต่างคลัง" → รวมยอด · ถ้าระบุ warehouse = เอาเฉพาะคลังนั้น
 * - รหัสเดียวกัน "คลังเดียวกัน/ไม่ระบุคลัง" = ของกองเดียวกันที่โผล่ซ้ำ → ไม่บวก ใช้ยอดที่มากกว่า
 *   (ไฟล์ Online Products: สินค้าเดียวลงขาย 2 หน้า → SKU เดียวโผล่ 2 แถว ยอดเท่ากันเพราะ BigSeller ส่งยอดเดียวกันไปทั้งคู่)
 * - ไม่มีรหัส / ไม่มีตัวเลขเลยทั้ง 2 ช่อง / ยอดติดลบ → ข้าม พร้อมเหตุผล
 */
export function normalizeBigSellerRows(
  rows: BigSellerInRow[],
  opts: { warehouse?: string | null } = {},
): { items: BigSellerItem[]; skipped: BigSellerSkip[] } {
  const onlyWh = str(opts.warehouse).toLowerCase();
  const byKey = new Map<string, BigSellerItem>();
  const perWh = new Map<string, Map<string, { available: number | null; onHand: number | null }>>();
  const skipped: BigSellerSkip[] = [];

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const code = str(r.merchant_sku);
    if (!code) { skipped.push({ row: rowNo, code: "", reason: "ไม่มีรหัส SKU" }); return; }

    const wh = str(r.warehouse);
    if (onlyWh && wh.toLowerCase() !== onlyWh) {
      skipped.push({ row: rowNo, code, reason: `เป็นคลัง "${wh || "—"}" (เลือกไว้เฉพาะ "${str(opts.warehouse)}")` });
      return;
    }

    const available = parseQty(r.qty_available);
    const onHand = parseQty(r.qty_on_hand);
    if (available == null && onHand == null) { skipped.push({ row: rowNo, code, reason: "ไม่มีจำนวนสต๊อก" }); return; }
    if ((available ?? 0) < 0 || (onHand ?? 0) < 0) { skipped.push({ row: rowNo, code, reason: "จำนวนติดลบ" }); return; }

    const key = codeKey(code);
    const whs = perWh.get(key) ?? new Map<string, { available: number | null; onHand: number | null }>();
    perWh.set(key, whs);
    const whKey = wh.toLowerCase();
    const prev = whs.get(whKey);
    whs.set(whKey, prev
      ? { available: maxN(prev.available, available), onHand: maxN(prev.onHand, onHand) }
      : { available, onHand });

    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, {
        code, name: str(r.name) || null, available: null, onHand: null,
        isCombo: isComboType(r.sku_type), warehouses: wh ? [wh] : [], rows: [rowNo],
      });
      return;
    }
    cur.isCombo = cur.isCombo || isComboType(r.sku_type);
    if (!cur.name) cur.name = str(r.name) || null;
    if (wh && !cur.warehouses.includes(wh)) cur.warehouses.push(wh);
    cur.rows.push(rowNo);
  });

  for (const [key, it] of byKey) {
    const list = [...(perWh.get(key)?.values() ?? [])];
    it.available = sumN(list.map((x) => x.available));
    it.onHand = sumN(list.map((x) => x.onHand));
  }
  return { items: [...byKey.values()], skipped };
}

/** ยอดที่ใช้ "เทียบ" กับยอดพร้อมขายของ ERP = พร้อมขาย (ถ้าไม่มี ใช้ของในคลัง) */
export const compareQtyOf = (it: Pick<BigSellerItem, "available" | "onHand">) => it.available ?? it.onHand;
/** ยอดที่ใช้ "ตั้งต้น" คลัง ERP = ของในคลัง (ถ้าไม่มี ใช้พร้อมขาย) — ERP หักที่จองเองภายหลัง */
export const openingQtyOf = (it: Pick<BigSellerItem, "available" | "onHand">) => it.onHand ?? it.available;

/** ป้ายสถานะของมุมมองเทียบยอด (v_channel_stock_compare.status) */
export const COMPARE_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" | "purple" }> = {
  match:          { label: "ตรงกัน",                tone: "green" },
  erp_more:       { label: "ERP มากกว่า",           tone: "amber" },
  erp_less:       { label: "ERP น้อยกว่า",          tone: "red" },
  unmatched:      { label: "ยังไม่จับคู่",           tone: "slate" },
  not_in_channel: { label: "มีใน ERP แต่ไม่มีในไฟล์", tone: "blue" },
  duplicate:      { label: "SKU ซ้ำหลายรหัส",       tone: "purple" },
  no_data:        { label: "ไฟล์ไม่มียอด",          tone: "slate" },
  combo:          { label: "สินค้าชุด (ข้าม)",      tone: "slate" },
};
