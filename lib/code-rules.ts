/**
 * 🔤 กฎ "รหัส" (Code) ของสินค้า — ของกลาง · pure (ใช้ได้ทั้งหน้าจอและ API)
 *
 * - ซ้ำ = ห้าม (ไม่สนตัวเล็ก/ใหญ่ + ช่องว่างหัวท้าย) — กันจริงที่ DB: unique(upper(btrim(code))) WHERE is_active
 *   หน้าจอเช็กสดผ่าน GET /api/master-v2/<entity>/check-code (ตอนพิมพ์ ไม่ต้องรอกดบันทึก)
 * - ตัวพิมพ์เล็ก / ช่องว่างหัวท้าย = เตือน (ยังบันทึกได้) + เสนอค่าที่แก้ให้ 1 คลิก
 *   (ข้อมูลจริงมีรหัสวัตถุดิบที่ตั้งใจใช้ตัวเล็ก เช่น Bag-1, CANVAS.C-10oz-BK — จึงไม่บังคับ)
 */

/** ตารางที่ใช้กฎรหัสนี้ (เพิ่มตารางได้ที่นี่ + สร้าง index แบบเดียวกันที่ DB) */
export const CODE_RULE_TABLES = ["parent_skus_v2", "skus_v2"] as const;
/** moduleKey ของตัวแก้กลาง (MasterCRUD) ที่ใช้กฎรหัสนี้ */
export const CODE_RULE_MODULES = ["parent-skus-v2", "skus-v2"] as const;

export type CodeWarning = { kind: "lowercase" | "spaces"; message: string; fix: string };

export function codeWarnings(code: string | null | undefined): CodeWarning[] {
  const raw = code ?? "";
  if (!raw.trim()) return [];
  const out: CodeWarning[] = [];
  if (raw !== raw.trim()) out.push({ kind: "spaces", message: "มีช่องว่างหน้า/หลังรหัส", fix: raw.trim() });
  const t = raw.trim();
  if (t !== t.toUpperCase()) out.push({ kind: "lowercase", message: "มีตัวพิมพ์เล็ก — ปกติรหัสเป็นพิมพ์ใหญ่", fix: t.toUpperCase() });
  return out;
}

/** ค่าที่ "แก้ให้ครบ" (ตัดช่องว่าง + พิมพ์ใหญ่) — ใช้กับปุ่มแก้ 1 คลิก */
export const normalizeCode = (code: string): string => code.trim().toUpperCase();

/** เทียบรหัสแบบที่ DB ใช้กันซ้ำ */
export const sameCode = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && normalizeCode(a) === normalizeCode(b);
