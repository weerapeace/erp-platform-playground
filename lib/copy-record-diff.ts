/**
 * เทียบค่า "ตอนนี้" กับ "จากระเบียนต้นทาง" ก่อนคัดลอก — ใช้ในป๊อป "คัดลอกจากรุ่นอื่น" (components/master-crud/copy-from-record)
 * pure + เทสต์ lib/__tests__/copy-record-diff.test.ts
 *
 * เจ้าของขอ 2026-11-11: "เมื่อกดแล้วจะให้เลือกว่าจะ copy อะไร มี preview ให้ด้วย เทียบ 2 ข้อมูล · Default เลือกทุกอย่าง"
 *   change       = ค่าต่างกัน → ติ๊กไว้ตั้งแต่แรก (overwrite = ช่องนี้มีค่าอยู่แล้วจะถูกทับ)
 *   same         = ค่าเหมือนกัน → ไม่ต้องคัดลอก (โชว์จาง ๆ ให้รู้)
 *   empty_source = ต้นทางว่าง → ไม่คัดลอก (กันล้างข้อมูลที่กรอกไว้ทิ้งโดยไม่ตั้งใจ)
 */
export type CopyRowStatus = "change" | "same" | "empty_source";
export type CopyRow = { key: string; status: CopyRowStatus; overwrite: boolean };

/** ว่าง = null/undefined/ข้อความว่าง/ขีด/array ว่าง/object ว่าง/HTML ที่ไม่มีตัวอักษร */
export function isEmptyCopyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") {
    const s = v.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return s === "" || s === "-" || s === "—";
  }
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/** ทำให้เทียบได้: ตัวเลข "9" กับ 9 เท่ากัน · ข้อความตัดช่องว่างหัวท้าย · object เรียงคีย์ */
function norm(v: unknown): string {
  if (isEmptyCopyValue(v)) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => (typeof x === "object" && x !== null ? JSON.parse(norm(x) || "null") : x)));
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return JSON.stringify(Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = o[k]; return acc; }, {}));
  }
  return String(v);
}

export function isSameCopyValue(a: unknown, b: unknown): boolean {
  return norm(a) === norm(b);
}

export function buildCopyRows(keys: string[], current: Record<string, unknown>, source: Record<string, unknown>): CopyRow[] {
  return keys.map((key) => {
    const src = source[key];
    if (isEmptyCopyValue(src)) return { key, status: "empty_source", overwrite: false };
    if (isSameCopyValue(current[key], src)) return { key, status: "same", overwrite: false };
    return { key, status: "change", overwrite: !isEmptyCopyValue(current[key]) };
  });
}

/** ค่าเริ่มต้นที่ติ๊ก = ทุกช่องที่ค่าต่างกัน */
export function defaultCopySelection(rows: CopyRow[]): string[] {
  return rows.filter((r) => r.status === "change").map((r) => r.key);
}
