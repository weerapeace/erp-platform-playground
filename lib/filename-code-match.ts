/**
 * จับคู่ "ชื่อไฟล์รูป" → "รหัส SKU" (ของกลาง · pure ไม่แตะ DB)
 *
 * ใช้ตอนโยนรูปหลายไฟล์พร้อมกันลงตาราง SKU ลูก (โหมดรูปภาพ) — ทีมตั้งชื่อไฟล์ตามรหัสอยู่แล้ว
 *   MGN194-02.jpg · MGN194-02_1.jpg · mgn194-02 (2).png · MGN194-02-front.webp → MGN194-02
 * กฎ: ไม่สนตัวเล็ก/ใหญ่ · ชื่อไฟล์ต้อง "ขึ้นต้นด้วยรหัสเต็ม" แล้วตามด้วยจบชื่อหรือตัวคั่นที่ไม่ใช่ตัวอักษร/ตัวเลข
 *   → MGN194-010.jpg จะไม่ไปเข้า MGN194-01 · รหัสยาวกว่าได้ก่อน (MGN194-01-L ก่อน MGN194-01)
 * ไม่เจอ = null (หน้าจอให้คนเลือกเอง)
 */

const baseName = (fileName: string) => fileName.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]{1,5}$/i, "").trim();
const isAlnum = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

export function matchFileToCode(fileName: string, codes: string[]): string | null {
  const base = baseName(fileName).toUpperCase();
  if (!base) return null;
  const sorted = [...new Set(codes.map((c) => (c ?? "").trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    const up = code.toUpperCase();
    if (base === up) return code;
    if (base.startsWith(up) && !isAlnum(base.charAt(up.length))) return code;
  }
  return null;
}

/** จับคู่ทั้งชุด → [{ file, code | null }] เรียงตามลำดับที่โยนมา */
export function matchFilesToCodes<F extends { name: string }>(files: F[], codes: string[]): { file: F; code: string | null }[] {
  return files.map((file) => ({ file, code: matchFileToCode(file.name, codes) }));
}
