/**
 * 📎 ที่อยู่ไฟล์กลาง (file ref) — ข้อความเดียวบอกได้ว่าไฟล์อยู่ที่เก็บไหน (pure · ใช้ได้ทั้งหน้าจอและ API)
 *
 *   "products/abc.jpg"                          = R2 key (ค่าเดิมทั้งหมดในคอลัมน์ *_r2_key — ไม่ต้องแปลงข้อมูลเก่า)
 *   "sb:erp-files/supplier_bills/2026-11/x.jpg" = Supabase Storage (bucket ส่วนตัว · เปิดผ่านลิงก์ชั่วคราว)
 *
 * เก็บในคอลัมน์เดิม (เช่น goods_receipts_v2.bill_doc_r2_key) ได้เลย → ช่องอัปเปลี่ยนที่เก็บตามกฎได้โดยไม่แก้ตาราง
 * เปิดดู: components/file-ref (useFileRefUrls) · อ่านไฟล์ฝั่งเซิร์ฟเวอร์: lib/file-ref-server · คู่มือ docs/storage-policy.md
 */

/** bucket ส่วนตัวกลางของหมวดที่กฎตั้งเป็น Supabase (migration 202611100700) */
export const ERP_FILES_BUCKET = "erp-files";

export type ParsedFileRef =
  | { provider: "r2"; key: string }
  | { provider: "supabase"; bucket: string; path: string; category: string | null };

const SB_PREFIX = "sb:";

export function parseFileRef(ref: string | null | undefined): ParsedFileRef | null {
  const s = String(ref ?? "").trim();
  if (!s) return null;
  if (!s.startsWith(SB_PREFIX)) return { provider: "r2", key: s };
  const rest = s.slice(SB_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;   // กัน path แปลก ๆ
  const category = bucket === ERP_FILES_BUCKET ? path.split("/")[0] : null;
  return { provider: "supabase", bucket, path, category };
}

export const supabaseFileRef = (bucket: string, path: string) => `${SB_PREFIX}${bucket}/${path}`;

export const isSupabaseRef = (ref: string | null | undefined) => parseFileRef(ref)?.provider === "supabase";

/**
 * ref นี้ใช้กับหมวดนี้ได้ไหม (ตรวจตอนบันทึกเอกสาร กันยัด path ของหมวดอื่นมา)
 *   R2 key = ได้ (ข้อมูลเก่า + ถ้าเจ้าของตั้งหมวดกลับเป็น R2) · Supabase ต้องอยู่ใต้ erp-files/<หมวด>/ เท่านั้น
 */
export function isRefForCategory(ref: string | null | undefined, category: string): boolean {
  const p = parseFileRef(ref);
  if (!p) return false;
  if (p.provider === "r2") return true;
  return p.bucket === ERP_FILES_BUCKET && p.category === category;
}

/** ชื่อไฟล์ท้าย path (โชว์ในปุ่มเปิดดู) */
export const fileRefName = (ref: string | null | undefined) => String(ref ?? "").split("/").pop() ?? "";

export const isPdfRef = (ref: string | null | undefined) => /\.pdf$/i.test(String(ref ?? ""));

/** นามสกุลไฟล์ (ตัวเล็ก ไม่มีจุด) — ไม่มี = "" */
export const fileExtOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();

/** path ใหม่ใน erp-files: <หมวด>/<ปี-เดือน>/<เวลา>-<สุ่ม>.<นามสกุล> */
export function newCategoryPath(category: string, fileName: string, now = new Date(), rand = Math.random().toString(36).slice(2, 8)): string {
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const ext = fileExtOf(fileName);
  return `${category}/${ym}/${now.getTime()}-${rand}${ext ? `.${ext}` : ""}`;
}
