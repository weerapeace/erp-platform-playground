/**
 * กติกา "คู่ค้าข้อมูลไม่ครบ" — ที่เดียว ใช้ทั้ง API (/api/master/partner-data-check) และหน้า Partners
 * ไฟล์ pure (ไม่แตะฐานข้อมูล)
 *
 * ทำไมต้องมี: ใบกำกับภาษี / ใบสั่งซื้อ พิมพ์ ชื่อ · ที่อยู่ · เลขผู้เสียภาษี · เบอร์โทร ของคู่ค้า (lib/doc-parties)
 *   ถ้าทะเบียนว่าง เอกสารจะพิมพ์ช่องว่างออกไปโดยไม่มีใครรู้
 *
 * กติกา (เจ้าของตกลง 2026-11-11 — เดิมนับว่าไม่ครบ 203 จาก 204 ราย จนดูไม่ออกว่าควรเริ่มที่ใคร):
 *   - ชื่อ: เอกสารพิมพ์จาก ชื่อไทย / ชื่ออังกฤษ / ชื่อที่แสดง (ไม่ใช่ช่อง company_name ซึ่งร้านจีนใช้เก็บชื่อจีน)
 *     → ขาดเมื่อว่างทั้ง 3 ช่องเท่านั้น
 *   - ร้านจีนไม่ตรวจ (ไม่มีเลขผู้เสียภาษี/ที่อยู่ไทยอยู่แล้ว)
 *   - "ต้องมี" = ชื่อ · ที่อยู่ (บรรทัดที่อยู่ + อำเภอ/เขต + จังหวัด) · เลขผู้เสียภาษี  ·  "ควรมี" = เบอร์โทร
 *   - เลข 13 หลักอยู่ในช่องสาขา = กรอกสลับช่อง (เคสจริง)
 */

export type PartnerLike = Record<string, unknown>;

export type GapKey = "name" | "address" | "tax" | "phone";
export type PartnerGap = { key: GapKey; label: string; required: boolean };

const t = (v: unknown) => String(v ?? "").trim();
const has = (v: unknown) => t(v).length > 0;

export const GAP_LABEL: Record<GapKey, string> = { name: "ชื่อ", address: "ที่อยู่", tax: "เลขผู้เสียภาษี", phone: "เบอร์โทร" };

/** ร้านจีน (ผู้ขาย + เป็นร้าน Taobao / มีประเทศร้าน / WeChat / ชื่อเซลล์) — ตรงกับป้าย 🇨🇳 ในหน้า Partners */
export function isChinaPartner(p: PartnerLike | null | undefined): boolean {
  if (!p || p.is_supplier !== true) return false;
  return p.is_taobao === true || has(p.shop_country) || has(p.wechat_id) || has(p.sale_name);
}

/** เลขผู้เสียภาษีไปอยู่ในช่องสาขา (ช่องเลขภาษีว่าง แต่ช่องสาขาเป็นเลข 13 หลัก) */
export function taxSwapped(p: PartnerLike): boolean {
  return !has(p.tax_id) && /^[0-9]{13}$/.test(t(p.tax_branch));
}

/** ช่องที่ยังขาดของคู่ค้า 1 ราย · ร้านจีน = [] (ไม่ตรวจ) */
export function partnerGaps(p: PartnerLike): PartnerGap[] {
  if (isChinaPartner(p)) return [];
  const gaps: PartnerGap[] = [];
  if (!has(p.name_th) && !has(p.name_en) && !has(p.display_name)) gaps.push({ key: "name", label: GAP_LABEL.name, required: true });
  if (!(has(p.address_line) && has(p.district) && has(p.province))) gaps.push({ key: "address", label: GAP_LABEL.address, required: true });
  if (!has(p.tax_id)) gaps.push({ key: "tax", label: GAP_LABEL.tax, required: true });
  if (!has(p.phone) && !has(p.mobile)) gaps.push({ key: "phone", label: GAP_LABEL.phone, required: false });
  return gaps;
}

/** ขาดช่อง "ต้องมี" อย่างน้อย 1 ช่อง (หรือกรอกสลับช่อง) — ใช้นับตัวเลขบนการ์ด */
export function missingRequired(p: PartnerLike): boolean {
  return partnerGaps(p).some((g) => g.required) || (!isChinaPartner(p) && taxSwapped(p));
}

/** แถว 1 รายในรายการ "ข้อมูลไม่ครบ" — API กับหน้า Partners สร้างด้วยฟังก์ชันเดียวกัน (บันทึกแล้วคิดใหม่ได้ทันทีไม่ต้องโหลดซ้ำ) */
export type PartnerCheckRow = {
  id: string;
  name: string;
  /** "ลูกค้า" / "ผู้จำหน่าย" / "ลูกค้า+ผู้จำหน่าย" */
  roles: string;
  is_customer: boolean;
  is_supplier: boolean;
  /** จำนวนเอกสารที่เคยออกให้คู่ค้ารายนี้ (ใบขาย + ใบสั่งซื้อ) */
  doc_count: number;
  so_count: number;
  po_count: number;
  gaps: PartnerGap[];
  /** สรุปเป็นภาษาคน เช่น "ที่อยู่ · เลขผู้เสียภาษี" */
  missing: string;
  /** ขาดช่อง "ต้องมี" (หรือกรอกสลับช่อง) */
  missing_required: boolean;
  /** เลขภาษีไปอยู่ในช่องสาขา — ต้องแก้ก่อนใช้งาน */
  tax_swapped: boolean;
};

export function checkRow(p: PartnerLike, soCount = 0, poCount = 0): PartnerCheckRow {
  const gaps = partnerGaps(p);
  const swapped = !isChinaPartner(p) && taxSwapped(p);
  const isC = p.is_customer === true, isS = p.is_supplier === true;
  return {
    id: t(p.id),
    name: t(p.display_name) || t(p.name_th) || t(p.name_en) || t(p.code) || "(ไม่มีชื่อ)",
    roles: isC && isS ? "ลูกค้า+ผู้จำหน่าย" : isC ? "ลูกค้า" : isS ? "ผู้จำหน่าย" : "—",
    is_customer: isC, is_supplier: isS,
    doc_count: soCount + poCount, so_count: soCount, po_count: poCount,
    gaps,
    missing: gaps.map((g) => g.label).join(" · "),
    missing_required: gaps.some((g) => g.required) || swapped,
    tax_swapped: swapped,
  };
}

/** อยู่ในรายการ "ข้อมูลไม่ครบ" ไหม (ขาดอะไรสักอย่าง หรือกรอกสลับช่อง) */
export const isIncomplete = (r: PartnerCheckRow) => r.gaps.length > 0 || r.tax_swapped;

/** เรียง: ออกเอกสารบ่อยสุดก่อน → ขาดช่องต้องมีก่อน → ขาดเยอะก่อน */
export function sortCheckRows(rows: PartnerCheckRow[]): PartnerCheckRow[] {
  return [...rows].sort((a, b) => b.doc_count - a.doc_count || Number(b.missing_required) - Number(a.missing_required) || b.gaps.length - a.gaps.length);
}

/** ช่องในทะเบียนที่ต้องกรอกเพื่อปิดแต่ละเรื่อง (ใช้ทำกล่องเติมด่วน) */
export const GAP_FIELDS: Record<GapKey, { k: string; label: string; ph?: string }[]> = {
  name: [{ k: "name_th", label: "ชื่อ (ไทย)", ph: "ชื่อตามที่จะพิมพ์บนเอกสาร" }],
  address: [
    { k: "address_line", label: "ที่อยู่", ph: "เลขที่ ถนน ซอย" },
    { k: "sub_district", label: "ตำบล/แขวง" },
    { k: "district", label: "อำเภอ/เขต" },
    { k: "province", label: "จังหวัด" },
    { k: "postal_code", label: "รหัสไปรษณีย์" },
  ],
  tax: [
    { k: "tax_id", label: "เลขผู้เสียภาษี", ph: "13 หลัก" },
    { k: "tax_branch", label: "สาขา", ph: "00000 = สำนักงานใหญ่" },
  ],
  phone: [
    { k: "phone", label: "เบอร์โทร" },
    { k: "mobile", label: "มือถือ" },
  ],
};
