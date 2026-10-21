/**
 * ของกลาง — แยกดูทีละบริษัทในกลุ่ม (ไอ.เอส.จี. / หลุยส์ / บริษัทที่เพิ่มทีหลัง)
 *
 * ทะเบียนบริษัทอยู่ที่ตาราง companies (ตั้งค่าที่ /admin/companies) — ไฟล์นี้ไม่แตะฐานข้อมูล
 * มีแค่กติกากลางที่ทุกหน้าที่ "เลือกดูทีละบริษัท" ต้องใช้ร่วมกัน:
 *   - ตัวกรอง: ทั้งกลุ่ม / บริษัทเดียว / ยังไม่ระบุบริษัท
 *   - สีประจำบริษัท (เรียงตามลำดับในทะเบียน) + ป้ายชื่อ
 *
 * ⚠️ รายการที่ยังไม่ระบุบริษัท ต้องอยู่ในกอง "ยังไม่ระบุ" เสมอ — ห้ามเดาเป็นบริษัทตั้งต้น
 *    ไม่งั้นยอดของบริษัทตั้งต้นจะเกินจริงแบบที่ไม่มีใครรู้ตัว
 */

/** บริษัทในกลุ่ม (ย่อจากทะเบียน companies เฉพาะช่องที่ใช้แสดงผล) */
export type CompanyRef = { id: string; code: string; name: string; isDefault: boolean };

/** ตัวกรองบริษัท: "all" = ทั้งกลุ่ม · "none" = ยังไม่ระบุบริษัท · อื่น ๆ = id บริษัท */
export type CompanyFilter = string;
export const COMPANY_ALL = "all";
export const COMPANY_NONE = "none";

/** รายการที่เป็นของบริษัท companyId เข้าตัวกรองนี้ไหม */
export function matchCompany(companyId: string | null | undefined, filter: CompanyFilter): boolean {
  if (filter === COMPANY_ALL) return true;
  if (filter === COMPANY_NONE) return !companyId;
  return companyId === filter;
}

/** ตัวกรองที่จำไว้ยังใช้ได้ไหม (บริษัทอาจถูกปิดใช้งานไปแล้ว) — ใช้ไม่ได้ = กลับไปดูทั้งกลุ่ม */
export function validCompanyFilter(filter: string | null | undefined, companies: CompanyRef[]): CompanyFilter {
  if (!filter) return COMPANY_ALL;
  if (filter === COMPANY_ALL || filter === COMPANY_NONE) return filter;
  return companies.some((c) => c.id === filter) ? filter : COMPANY_ALL;
}

export type CompanyTone = { dot: string; bg: string; text: string };

/** สีประจำบริษัท ไล่ตามลำดับในทะเบียน — บริษัทแรก (ISG) ฟ้า · ถัดไป (หลุยส์) ม่วง · … */
const COMPANY_TONES: CompanyTone[] = [
  { dot: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },  // ฟ้า
  { dot: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },  // ม่วง
  { dot: "#1D9E75", bg: "#E1F5EE", text: "#085041" },  // เขียวอมฟ้า
  { dot: "#D85A30", bg: "#FAECE7", text: "#712B13" },  // ส้มอิฐ
  { dot: "#D4537E", bg: "#FBEAF0", text: "#72243E" },  // ชมพู
];

/** สีของกอง "ยังไม่ระบุบริษัท" — ส้มเตือน ให้เห็นว่ายังต้องจัดการ */
export const UNASSIGNED_TONE: CompanyTone = { dot: "#EF9F27", bg: "#FAEEDA", text: "#633806" };

export function companyTone(companies: CompanyRef[], id: string | null | undefined): CompanyTone {
  if (!id) return UNASSIGNED_TONE;
  const i = companies.findIndex((c) => c.id === id);
  return i < 0 ? UNASSIGNED_TONE : COMPANY_TONES[i % COMPANY_TONES.length];
}

/**
 * ชื่อบริษัทสำหรับแสดง
 *   short = รหัส (ISG / LOUIS) ใช้บนการ์ดเล็ก ๆ
 *   full  = ชื่อเต็ม ใช้บนปุ่มเลือก/ป๊อปรายละเอียด
 * id ที่ไม่อยู่ในทะเบียน (บริษัทถูกปิดไปแล้ว) ก็ถือว่า "ยังไม่ระบุ" เหมือนกัน
 */
export function companyLabel(companies: CompanyRef[], id: string | null | undefined, mode: "short" | "full" = "short"): string {
  const c = id ? companies.find((x) => x.id === id) : undefined;
  if (!c) return "ยังไม่ระบุ";
  return mode === "short" ? (c.code || c.name) : (c.name || c.code);
}
