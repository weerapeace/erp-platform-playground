/**
 * 📁 โฟลเดอร์หน้าที่ของงานสินค้า (ของกลาง · pure · ไม่ import อะไร)
 * โฟลเดอร์งานสินค้า (ทำโดย Create Folder Tool): [01] Description · [02] Images · [03] Rawfiles · <รหัสรุ่น> · <รหัสสี>
 *   desc    = รูป Description ของรุ่น
 *   archive = โฟลเดอร์เก็บไฟล์ ไม่ลงระบบ (รูปดิบ / ไฟล์ทำงาน)
 * ชื่อตั้งได้ที่สูตร "งานสินค้า" ของตัวแยกไฟล์ (lib/file-sort ProductSortConfig.roleFolders)
 * ใช้ร่วม: lib/product-image-routing (ปุ่ม 📂 จัดรูปหลายโฟลเดอร์) · lib/file-sort (ค่าตั้ง) · lib/file-sort-product (ตัวแยกไฟล์)
 */

export interface RoleFolderConfig {
  desc: string[];
  archive: string[];
}
export const DEFAULT_ROLE_FOLDERS: RoleFolderConfig = { desc: ["description", "desc", "รายละเอียด"], archive: ["images", "rawfiles", "raw files", "raw"] };

/** ชื่อโฟลเดอร์ตัดเลขลำดับหน้าออก: "[01] Description" · "01_Description" · "1. Description" · "(2) Images" → "description" */
export function folderLabelKey(name: string): string {
  return name.trim().replace(/^(\[\s*\d+\s*\]|\(\s*\d+\s*\)|\d+\s*[._)\-]+)\s*/, "").trim().toLowerCase();
}

/** ค่าตั้งจาก DB/หน้าจอ → ใช้ได้เสมอ (ไม่ใช่ array = ค่าเริ่มต้น · array ว่าง = ไม่ใช้โฟลเดอร์หน้าที่ชนิดนั้น) */
export function cleanRoleFolders(raw: unknown): RoleFolderConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, dflt: string[]) =>
    Array.isArray(v) ? [...new Set(v.map((x) => folderLabelKey(String(x ?? "")).slice(0, 40)).filter(Boolean))].slice(0, 20) : [...dflt];
  return { desc: list(o.desc, DEFAULT_ROLE_FOLDERS.desc), archive: list(o.archive, DEFAULT_ROLE_FOLDERS.archive) };
}

/** เลขเวอร์ชันจากชื่อโฟลเดอร์ ("Ver.2" · "V3" · "Version 4" · "เวอร์ชัน 2") · ไม่ใช่โฟลเดอร์เวอร์ชัน = null */
export function versionOfFolder(name: string): number | null {
  const m = name.trim().match(/^(?:ver(?:sion)?|v|เวอร์ชั่?น)\s*[._-]?\s*(\d{1,3})$/i);
  return m ? Number(m[1]) : null;
}
