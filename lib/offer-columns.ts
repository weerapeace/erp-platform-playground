/**
 * นิยามคอลัมน์ตารางสินค้าใบเสนอ — ใช้ร่วมกันทั้งหน้ากรอก (/offer-sheets) และหน้าสาธารณะ/พิมพ์ (/offer/[token])
 * เพื่อให้ "เลือกคอลัมน์/เรียง/จัดกลุ่ม" สอดคล้องกันทุกที่
 */
import type { LineColumnDef, LineColumnConfig } from "@/components/line-item-columns";

export const OFFER_ITEM_COLUMNS: LineColumnDef[] = [
  { key: "image", label: "รูป" },
  { key: "product", label: "สินค้า", locked: true },
  { key: "color", label: "สี" },
  { key: "category", label: "หมวดหมู่" },
  { key: "uom", label: "หน่วย" },
  { key: "qty", label: "จำนวน", locked: true },
  { key: "unit_price", label: "ราคา/หน่วย", locked: true },
  { key: "total", label: "รวม", locked: true },
  { key: "note", label: "หมายเหตุ" },
];

export const DEFAULT_OFFER_COLS: LineColumnConfig = {
  order: OFFER_ITEM_COLUMNS.map((c) => c.key),
  hidden: ["color", "category"],
  groupBy: null,
};

export const offerColAlign = (k: string) =>
  k === "qty" || k === "uom" ? "text-center" : k === "unit_price" || k === "total" ? "text-right" : "text-left";

export const offerGroupValue = (it: { category?: string | null; color?: string | null }, key: string) =>
  (key === "category" ? it.category : key === "color" ? it.color : null) || "— ไม่ระบุ —";
