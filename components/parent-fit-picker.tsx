"use client";

/**
 * ช่องติ๊กของ Parent SKU — ตั้งค่าบนของกลาง TickListField (components/tick-list-field)
 *   ParentFitField       = "ใส่อะไรได้บ้าง" (product_fit_items · มีขนาด) → parent_skus_v2.fits
 *   ParentHighlightField = "รายละเอียดเพิ่ม (ติ๊ก)" (product_highlight_items) → parent_skus_v2.highlights
 *                          บนเว็บต่อท้ายหัวข้อ "รายละเอียดสินค้า" เป็น "- ข้อความ"
 * ⚠️ ต่อสาย 2 ที่: app/master/parent-skus/page.tsx + MasterRecordDrawer ใน components/master-crud
 */
import { TickListField, type TickListConfig } from "@/components/tick-list-field";

export const FIT_CFG: TickListConfig = {
  catalog: "product_fit_items",
  field: "fits",
  title: "ใส่อะไรได้บ้าง",
  description: "ติ๊กของที่ใส่ได้ · ของที่มีขนาด เลือกขนาดได้ในแถวเดียวกัน",
  withSizes: true,
  summary: "chips",
  columns: 2,
  addPlaceholder: "เช่น ขวดน้ำ",
  emptyHint: "ติ๊กของที่ใส่ในกระเป๋านี้ได้",
  // ตุ๊กตา/ฟิกเกอร์ = คำนวณจาก "ช่องใส่ของ" เอง (lib/fit-check · components/compartments-editor) ไม่ต้องติ๊ก
  hide: (x) => x.kind === "doll",
};

export const HIGHLIGHT_CFG: TickListConfig = {
  catalog: "product_highlight_items",
  field: "highlights",
  title: "รายละเอียดเพิ่ม (ติ๊ก)",
  description: "ติ๊กข้อที่ตรงกับสินค้านี้ · บนเว็บจะต่อท้ายรายละเอียดสินค้าเป็น \"- ข้อความ\"",
  summary: "lines",
  columns: 1,
  addPlaceholder: "เช่น ผลิตในประเทศไทย",
  emptyHint: "ติ๊กข้อที่ตรงกับสินค้านี้",
  // ชนิด "ช่อง + ตัวเลข" ต้องใส่จำนวน → ใช้ปุ่ม "＋ แทรก" ที่ Description (components/detail-insert) ไม่ใช่ติ๊ก
  // 🌿 สไตล์ / ข้อความ Lifestyle = เลือกในแท็บ Lifestyle ของปุ่ม "＋ แทรก" (ไม่ใช่รายละเอียดติ๊ก)
  hide: (x) => x.kind === "slot" || x.kind === "style" || x.kind === "lifestyle",
};

type FieldProps = {
  value: unknown;
  mode: "edit" | "view";
  onChange?: (v: unknown) => void;
  onSaved?: (v: unknown) => void;
  recordId?: string | null;
  canEdit?: boolean;
};

export function ParentFitField(p: FieldProps) {
  return <TickListField cfg={FIT_CFG} {...p} />;
}

export function ParentHighlightField(p: FieldProps) {
  return <TickListField cfg={HIGHLIGHT_CFG} {...p} />;
}
