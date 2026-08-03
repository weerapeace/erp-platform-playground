/**
 * ของกลาง — ประกอบที่อยู่ไทยให้เป็นทางการสำหรับเอกสาร (ใบกำกับภาษี/ใบเสนอราคา/ใบวางบิล)
 *
 * รับ record ของ partner/ที่อยู่ (เช่น partners_v2) แล้วคืนสตริงที่อยู่เต็มพร้อมคำนำหน้า
 * ตำบล/อำเภอ/จังหวัด — ถ้าเป็นกรุงเทพฯ จะใช้ แขวง/เขต อัตโนมัติ
 *
 * รองรับชื่อคอลัมน์หลายแบบ (address_line / street, sub_district / tambon, district / amphoe ฯลฯ)
 * เพื่อใช้ซ้ำได้กับหลายตาราง
 */

const t = (v: unknown) => String(v ?? "").trim();
const firstText = (...values: unknown[]) => {
  for (const v of values) { const s = t(v); if (s) return s; }
  return "";
};

const isBangkok = (province: string) => /กรุงเทพ|กทม|bangkok/i.test(province);

/**
 * เติมคำนำหน้าถ้ายังไม่มี — กัน "แขวงแขวงบางแค" เวลาผู้ใช้พิมพ์คำนำหน้ามาเองแล้ว
 * (ข้อมูลจริงมีทั้งสองแบบ: บางรายกรอก "บางแค" บางรายกรอก "แขวงบางแค")
 */
const withPrefix = (value: string, prefix: string, alts: readonly string[] = []) => {
  if (!value) return "";
  return [prefix, ...alts].some((p) => p && value.startsWith(p)) ? value : `${prefix}${value}`;
};

/**
 * เลขประจำตัวผู้เสียภาษี (+ สาขา)
 * สาขา "00000" / ว่าง = สำนักงานใหญ่ → ไม่ต้องพิมพ์ต่อท้าย (เจ้าของสั่ง 2026-08-03)
 * สาขาจริง (เช่น 00001) ต้องแสดง เพราะมีผลทางภาษี
 *
 * ⚠️ ตั้งใจไม่ "เดา" ว่าเลขภาษีอยู่ในช่องสาขา แม้ข้อมูลจริงเคยกรอกสลับช่องกัน —
 *    เพราะจะทำให้เอกสารพิมพ์เลขผิดโดยไม่มีใครรู้ ควรแก้ที่ข้อมูลต้นทางแทน
 */
export function formatTaxId(taxId: unknown, branch?: unknown): string {
  const id = t(taxId);
  if (!id) return "";
  const b = t(branch);
  const headOffice = !b || /^0+$/.test(b) || /สำนักงานใหญ่|head\s*office/i.test(b);
  return headOffice ? id : `${id} (สาขา ${b})`;
}

/** ประกอบที่อยู่ไทยแบบเต็ม (มีคำนำหน้า ตำบล/อำเภอ/จังหวัด หรือ แขวง/เขต สำหรับ กทม.) */
export function formatThaiAddress(p: Record<string, unknown>): string {
  // ถ้ามีที่อยู่เต็มสำเร็จรูปอยู่แล้ว ใช้เลย
  const direct = firstText(p.full_address, p.address_th, p.billing_address);
  if (direct) return direct;

  const addressLine = firstText(p.address_line, p.street, p.address_line1, p.address);
  const sub      = firstText(p.sub_district, p.subdistrict, p.tambon);
  const district = firstText(p.district, p.amphoe);
  const province = firstText(p.province);
  const postal   = firstText(p.postal_code, p.zip);
  const country  = firstText(p.country);

  const bkk = isBangkok(province);
  const subLabel  = bkk ? "แขวง" : "ตำบล";
  const distLabel = bkk ? "เขต"  : "อำเภอ";
  const provLabel = bkk ? ""     : "จังหวัด";   // กทม. ไม่ต้องมี "จังหวัด" นำหน้า

  return [
    addressLine,
    withPrefix(sub, subLabel, ["แขวง", "ตำบล", "ต."]),
    withPrefix(district, distLabel, ["เขต", "อำเภอ", "อ."]),
    provLabel ? withPrefix(province, provLabel, ["จังหวัด", "จ."]) : province,
    postal,
    country && !/thai|ไทย/i.test(country) ? country : "",   // ไทยไม่ต้องโชว์ประเทศ
  ].filter(Boolean).join(" ");
}
