/**
 * ของกลาง — ประกอบ "ที่อยู่ไทย" ให้ถูกแบบเอกสารราชการ/ใบกำกับภาษี
 *
 * ปัญหาที่แก้: ในฐานข้อมูลเก็บแยกช่อง (ที่อยู่ / ตำบล / อำเภอ / จังหวัด / ไปรษณีย์)
 * แต่เอกสารต้องเขียนติดกันเป็นบรรทัดเดียว และ **กรุงเทพฯ ใช้ "แขวง/เขต" ส่วนต่างจังหวัดใช้ "ตำบล/อำเภอ"**
 * ถ้าเขียนผิดคำ เอกสารจะดูไม่เป็นทางการ
 *
 * ใช้ที่: ใบสั่งซื้อ · (ต่อไป) ใบวางบิล / ใบส่งของ / ใบเสนอราคา
 */

const s = (v: unknown) => String(v ?? "").trim();

/** จังหวัดนี้คือกรุงเทพฯ ไหม (เก็บได้หลายแบบ: กรุงเทพฯ / กรุงเทพมหานคร / Bangkok) */
export const isBangkok = (province: unknown): boolean =>
  /กรุงเทพ|bangkok/i.test(s(province));

/**
 * เติมคำนำหน้าให้ตำบล/อำเภอ ถ้ายังไม่มี
 * (ผู้ใช้บางคนพิมพ์ "แขวงบางแค" มาแล้ว บางคนพิมพ์แค่ "บางแค")
 */
function withPrefix(value: string, prefixes: readonly string[]): string {
  const v = s(value);
  if (!v) return "";
  return prefixes.some((p) => v.startsWith(p)) ? v : `${prefixes[0]}${v}`;
}

export type ThAddressParts = {
  address_line?: string | null;
  sub_district?: string | null;
  district?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

/** ประกอบเป็นบรรทัดเดียว — ช่องไหนว่างก็ข้ามไป ไม่เหลือช่องว่างซ้อน */
export function formatThaiAddress(p: ThAddressParts): string {
  const bkk = isBangkok(p.province);
  const sub = withPrefix(s(p.sub_district), bkk ? ["แขวง", "ตำบล", "ต."] : ["ตำบล", "แขวง", "ต."]);
  const dis = withPrefix(s(p.district), bkk ? ["เขต", "อำเภอ", "อ."] : ["อำเภอ", "เขต", "อ."]);
  const prov = s(p.province);
  // ต่างจังหวัดเติม "จังหวัด" ให้ (กรุงเทพฯ ไม่ต้อง)
  const provText = !prov || bkk ? prov : withPrefix(prov, ["จังหวัด", "จ."]);
  return [s(p.address_line), sub, dis, provText, s(p.postal_code)].filter(Boolean).join(" ");
}

/**
 * เลขประจำตัวผู้เสียภาษี + สาขา
 * สาขา "00000" = สำนักงานใหญ่ → ไม่ต้องพิมพ์ต่อท้าย (ตามที่เจ้าของสั่ง 2026-08-03)
 * สาขาจริง (เช่น 00001) ยังต้องแสดง เพราะมีผลทางภาษี
 */
export function formatTaxId(taxId: unknown, branch?: unknown): string {
  const id = s(taxId);
  if (!id) return "";
  const b = s(branch);
  const isHeadOffice = !b || /^0+$/.test(b) || /สำนักงานใหญ่|head\s*office/i.test(b);
  return isHeadOffice ? id : `${id} (สาขา ${b})`;
}
