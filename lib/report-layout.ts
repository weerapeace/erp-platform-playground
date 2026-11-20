/** เรียงบรรทัดตอนพิมพ์ — none = ตามลำดับที่บันทึก */
export type ReportLineSort = "none" | "qty" | "price" | "sku";
export const REPORT_LINE_SORTS: ReportLineSort[] = ["none", "qty", "price", "sku"];

/** แบบรายการตอนพิมพ์ — table = ตารางเดิม · cards = การ์ดรูปใหญ่ อ่านง่าย (เจ้าของขอ 2026-11-19) */
export type ReportLineStyle = "table" | "cards";
export const REPORT_LINE_STYLES: ReportLineStyle[] = ["table", "cards"];
export const REPORT_CARDS_PER_ROW_MIN = 1;
export const REPORT_CARDS_PER_ROW_MAX = 4;

/** ช่วงปรับขนาดตัวหนังสือแยกส่วน (px จากขนาดอัตโนมัติ) */
export const REPORT_FONT_ADJ_MIN = -8;
export const REPORT_FONT_ADJ_MAX = 16;

import { normalizePrintPartStyles, type PrintPartStyles } from "@/lib/print-part-style";
import { normalizeCardFields, normalizeCardOrder, normalizePageBlocks, type CardField, type PageBlock } from "@/lib/print-blocks";

export const REPORT_IMAGE_SIZE_MIN_MM = 10;
export const REPORT_IMAGE_SIZE_MAX_MM = 45;

export type ReportLayoutSettings = {
  topMarginMm: number;
  horizontalMarginMm: number;
  bottomMarginMm: number;
  fontSizePx: number;
  rowHeightMm: number;
  /** ความสูงรูปสินค้าในตาราง (mm) — คอลัมน์ "ภาพ" กว้างตามสัดส่วน */
  imageSizeMm: number;
  signatureGapMm: number;
  signatureToBottom: boolean;
  showSku: boolean;
  showImage: boolean;
  showPhone: boolean;
  showResponsible: boolean;
  showNote: boolean;
  /** แสดงยอดรวม (แถวรวม + รวมเงิน/VAT/ทั้งสิ้น + ตัวอักษร) — ปิดได้ เช่น ใบเสนอราคาหลายราคาตามจำนวน ที่รวมยอดแล้วไม่มีความหมาย */
  showTotals: boolean;
  /** แสดงข้อมูลลูกค้า (ชื่อ/ที่อยู่/เบอร์) — ปิดแล้วยังเหลือวันที่ + เลขที่เอกสาร */
  showCustomer: boolean;
  /** แบบรายการ: ตาราง / การ์ดรูปใหญ่ */
  lineStyle: ReportLineStyle;
  /** (การ์ด) จำนวนการ์ดต่อแถว 1-4 */
  cardsPerRow: number;
  /** (การ์ด) แสดงจำนวน */
  showQty: boolean;
  /** (การ์ด) แสดงราคารวมของรายการ */
  showLineTotal: boolean;
  /** (การ์ด) แสดงเลขลำดับมุมการ์ด */
  showCardNo: boolean;
  /** (การ์ด) ปรับขนาดตัวหนังสือแยกส่วน — บวก/ลบ px จากขนาดอัตโนมัติตามจำนวนต่อแถว (0 = อัตโนมัติ) */
  cardNameAdjPx: number;
  cardNoteAdjPx: number;
  cardPriceAdjPx: number;
  /** (การ์ด) ปรับขนาดหัวกระดาษ (ชื่อบริษัท/ชื่อเอกสาร/เลขที่-วันที่) */
  headerAdjPx: number;
  /** (การ์ด) ปรับหน้าตาทีละกล่อง — กดกล่องในพรีวิว (ของกลาง lib/print-part-style · เจ้าของขอ 2026-11-20) */
  partStyles: PrintPartStyles;
  /** (การ์ด) ช่องที่เพิ่มในการ์ด — ข้อมูลจาก SKU / บรรทัด / ข้อความเอง (lib/print-blocks · เจ้าของขอ 2026-11-20) */
  cardFields: CardField[];
  /** (การ์ด) ลำดับช่องในการ์ด "base:<ช่องพื้นฐาน>" / "f:<id>" — ว่าง = ลำดับเดิม */
  cardOrder: string[];
  /** (การ์ด) กล่องบนหน้า — ข้อความ / รูป / เส้นคั่น ตามจุดวาง */
  pageBlocks: PageBlock[];
  /** แสดงช่องเซ็น "ลูกค้าอนุมัติ" — ปิดแล้วเหลือช่องผู้มีอำนาจช่องเดียวชิดขวา */
  showCustomerApproval: boolean;
  /** กล่องเงื่อนไขท้ายใบ (แก้ข้อความเองได้ · ขึ้นบรรทัดใหม่ได้) */
  showTerms: boolean;
  termsText: string;
  /** ลำดับรายการที่ลากสลับเอง (เลขตำแหน่งเดิมของแต่ละบรรทัด) — ว่าง = ตามที่บันทึก · ใช้เมื่อ sortBy = none เท่านั้น */
  manualOrder: number[];
  /** เรียงรายการตาม จำนวน/ราคา/รหัส (เฉพาะตอนพิมพ์ ไม่แก้ลำดับในเอกสารจริง) */
  sortBy: ReportLineSort;
  sortDesc: boolean;
  /** เรียงภายในกลุ่มตัวเลือก (สี/ไซส์) — กลุ่มเรียงตามที่เจอก่อน */
  sortGroupByNote: boolean;
  showAuthorizedSignature: boolean;
  authorizedSignatureUrl: string;
  authorizedSignatureWidthMm: number;
  authorizedSignatureOffsetXMm: number;
  authorizedSignatureOffsetYMm: number;
  showCompanyStamp: boolean;
  companyStampUrl: string;
  companyStampWidthMm: number;
  companyStampOffsetXMm: number;
  companyStampOffsetYMm: number;
};

export const DEFAULT_REPORT_LAYOUT: ReportLayoutSettings = {
  topMarginMm: 13,
  horizontalMarginMm: 12,
  bottomMarginMm: 11,
  fontSizePx: 11,
  rowHeightMm: 24,
  imageSizeMm: 22,
  signatureGapMm: 22,
  signatureToBottom: true,
  showSku: true,
  showImage: true,
  showPhone: true,
  showResponsible: true,
  showNote: true,
  showTotals: true,
  showCustomer: true,
  lineStyle: "table",
  cardsPerRow: 2,
  showQty: true,
  showLineTotal: true,
  showCardNo: true,
  cardNameAdjPx: 0,
  cardNoteAdjPx: 0,
  cardPriceAdjPx: 0,
  headerAdjPx: 0,
  partStyles: {},
  cardFields: [],
  cardOrder: [],
  pageBlocks: [],
  showCustomerApproval: true,
  showTerms: false,
  termsText: "ยืนราคา 30 วัน นับจากวันที่ในใบเสนอราคา\nราคาข้างต้นยังไม่รวมภาษีมูลค่าเพิ่ม",
  manualOrder: [],
  sortBy: "none",
  sortDesc: false,
  sortGroupByNote: true,
  showAuthorizedSignature: false,
  authorizedSignatureUrl: "",
  authorizedSignatureWidthMm: 38,
  authorizedSignatureOffsetXMm: 0,
  authorizedSignatureOffsetYMm: -2,
  showCompanyStamp: false,
  companyStampUrl: "",
  companyStampWidthMm: 28,
  companyStampOffsetXMm: 22,
  companyStampOffsetYMm: -8,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const safeAssetUrl = (value: unknown): string => {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return "";
  return url;
};

/** ลำดับที่ลากเอง: ต้องเป็นเลขตำแหน่งจำนวนเต็มไม่ซ้ำ (อย่างอื่นทิ้ง) */
function cleanManualOrder(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value.slice(0, 1000)) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n < 1000 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** ช่องในการ์ด + ลำดับ — ยังไม่เคยจัด (ไม่มีช่องเพิ่ม ไม่มีลำดับ) = เก็บลำดับว่าง */
function normalizeCardLayout(fieldsIn: unknown, orderIn: unknown): { cardFields: CardField[]; cardOrder: string[] } {
  const cardFields = normalizeCardFields(fieldsIn);
  const touched = cardFields.length > 0 || (Array.isArray(orderIn) && orderIn.length > 0);
  return { cardFields, cardOrder: touched ? normalizeCardOrder(orderIn, cardFields) : [] };
}

export function normalizeReportLayout(input: Partial<ReportLayoutSettings> = {}): ReportLayoutSettings {
  return {
    topMarginMm: clamp(input.topMarginMm, 0, 30, DEFAULT_REPORT_LAYOUT.topMarginMm),
    horizontalMarginMm: clamp(input.horizontalMarginMm, 6, 25, DEFAULT_REPORT_LAYOUT.horizontalMarginMm),
    bottomMarginMm: clamp(input.bottomMarginMm, 0, 30, DEFAULT_REPORT_LAYOUT.bottomMarginMm),
    fontSizePx: clamp(input.fontSizePx, 8, 14, DEFAULT_REPORT_LAYOUT.fontSizePx),
    rowHeightMm: clamp(input.rowHeightMm, 10, 36, DEFAULT_REPORT_LAYOUT.rowHeightMm),
    imageSizeMm: clamp(input.imageSizeMm, REPORT_IMAGE_SIZE_MIN_MM, REPORT_IMAGE_SIZE_MAX_MM, DEFAULT_REPORT_LAYOUT.imageSizeMm),
    signatureGapMm: clamp(input.signatureGapMm, 0, 45, DEFAULT_REPORT_LAYOUT.signatureGapMm),
    signatureToBottom: input.signatureToBottom ?? DEFAULT_REPORT_LAYOUT.signatureToBottom,
    showSku: input.showSku ?? DEFAULT_REPORT_LAYOUT.showSku,
    showImage: input.showImage ?? DEFAULT_REPORT_LAYOUT.showImage,
    showPhone: input.showPhone ?? DEFAULT_REPORT_LAYOUT.showPhone,
    showResponsible: input.showResponsible ?? DEFAULT_REPORT_LAYOUT.showResponsible,
    showNote: input.showNote ?? DEFAULT_REPORT_LAYOUT.showNote,
    showTotals: input.showTotals ?? DEFAULT_REPORT_LAYOUT.showTotals,
    showCustomer: input.showCustomer ?? DEFAULT_REPORT_LAYOUT.showCustomer,
    lineStyle: REPORT_LINE_STYLES.includes(input.lineStyle as ReportLineStyle) ? (input.lineStyle as ReportLineStyle) : DEFAULT_REPORT_LAYOUT.lineStyle,
    cardsPerRow: Math.round(clamp(input.cardsPerRow, REPORT_CARDS_PER_ROW_MIN, REPORT_CARDS_PER_ROW_MAX, DEFAULT_REPORT_LAYOUT.cardsPerRow)),
    showQty: input.showQty ?? DEFAULT_REPORT_LAYOUT.showQty,
    showLineTotal: input.showLineTotal ?? DEFAULT_REPORT_LAYOUT.showLineTotal,
    showCardNo: input.showCardNo ?? DEFAULT_REPORT_LAYOUT.showCardNo,
    cardNameAdjPx: Math.round(clamp(input.cardNameAdjPx, REPORT_FONT_ADJ_MIN, REPORT_FONT_ADJ_MAX, 0)),
    cardNoteAdjPx: Math.round(clamp(input.cardNoteAdjPx, REPORT_FONT_ADJ_MIN, REPORT_FONT_ADJ_MAX, 0)),
    cardPriceAdjPx: Math.round(clamp(input.cardPriceAdjPx, REPORT_FONT_ADJ_MIN, REPORT_FONT_ADJ_MAX, 0)),
    headerAdjPx: Math.round(clamp(input.headerAdjPx, REPORT_FONT_ADJ_MIN, REPORT_FONT_ADJ_MAX, 0)),
    partStyles: normalizePrintPartStyles(input.partStyles),
    ...normalizeCardLayout(input.cardFields, input.cardOrder),
    pageBlocks: normalizePageBlocks(input.pageBlocks),
    showCustomerApproval: input.showCustomerApproval ?? DEFAULT_REPORT_LAYOUT.showCustomerApproval,
    showTerms: input.showTerms ?? DEFAULT_REPORT_LAYOUT.showTerms,
    termsText: typeof input.termsText === "string" ? input.termsText.slice(0, 800) : DEFAULT_REPORT_LAYOUT.termsText,
    manualOrder: cleanManualOrder(input.manualOrder),
    sortBy: REPORT_LINE_SORTS.includes(input.sortBy as ReportLineSort) ? (input.sortBy as ReportLineSort) : DEFAULT_REPORT_LAYOUT.sortBy,
    sortDesc: input.sortDesc ?? DEFAULT_REPORT_LAYOUT.sortDesc,
    sortGroupByNote: input.sortGroupByNote ?? DEFAULT_REPORT_LAYOUT.sortGroupByNote,
    showAuthorizedSignature: input.showAuthorizedSignature ?? DEFAULT_REPORT_LAYOUT.showAuthorizedSignature,
    authorizedSignatureUrl: safeAssetUrl(input.authorizedSignatureUrl),
    authorizedSignatureWidthMm: clamp(input.authorizedSignatureWidthMm, 10, 70, DEFAULT_REPORT_LAYOUT.authorizedSignatureWidthMm),
    authorizedSignatureOffsetXMm: clamp(input.authorizedSignatureOffsetXMm, -60, 60, DEFAULT_REPORT_LAYOUT.authorizedSignatureOffsetXMm),
    authorizedSignatureOffsetYMm: clamp(input.authorizedSignatureOffsetYMm, -40, 40, DEFAULT_REPORT_LAYOUT.authorizedSignatureOffsetYMm),
    showCompanyStamp: input.showCompanyStamp ?? DEFAULT_REPORT_LAYOUT.showCompanyStamp,
    companyStampUrl: safeAssetUrl(input.companyStampUrl),
    companyStampWidthMm: clamp(input.companyStampWidthMm, 10, 60, DEFAULT_REPORT_LAYOUT.companyStampWidthMm),
    companyStampOffsetXMm: clamp(input.companyStampOffsetXMm, -60, 60, DEFAULT_REPORT_LAYOUT.companyStampOffsetXMm),
    companyStampOffsetYMm: clamp(input.companyStampOffsetYMm, -40, 40, DEFAULT_REPORT_LAYOUT.companyStampOffsetYMm),
  };
}

export function compactReportLayout(input: Partial<ReportLayoutSettings> = DEFAULT_REPORT_LAYOUT): ReportLayoutSettings {
  const current = normalizeReportLayout(input);
  return normalizeReportLayout({
    ...current,
    topMarginMm: Math.min(current.topMarginMm, 8),
    horizontalMarginMm: Math.min(current.horizontalMarginMm, 10),
    bottomMarginMm: Math.min(current.bottomMarginMm, 8),
    fontSizePx: Math.min(current.fontSizePx, 10),
    rowHeightMm: Math.min(current.rowHeightMm, 18),
    imageSizeMm: Math.min(current.imageSizeMm, 16),
    signatureGapMm: Math.min(current.signatureGapMm, 10),
    signatureToBottom: true,
    // แบบการ์ด: บีบ = การ์ดเล็กลง (อย่างน้อย 3 ต่อแถว)
    cardsPerRow: current.lineStyle === "cards" ? Math.max(current.cardsPerRow, 3) : current.cardsPerRow,
  });
}

/** ปรับขนาดรูป + ให้ความสูงแถวพอดีรูป (รูป + ขอบ 2mm — ค่าเริ่มต้น 22 → แถว 24 เหมือนเดิม) */
export function withReportImageSize(input: Partial<ReportLayoutSettings>, imageSizeMm: number): ReportLayoutSettings {
  const current = normalizeReportLayout(input);
  const size = normalizeReportLayout({ ...current, imageSizeMm }).imageSizeMm;
  return normalizeReportLayout({ ...current, imageSizeMm: size, rowHeightMm: size + 2 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function reportLayoutFromStoredValue(value: unknown): ReportLayoutSettings {
  if (!isRecord(value)) return DEFAULT_REPORT_LAYOUT;
  return normalizeReportLayout(value as Partial<ReportLayoutSettings>);
}

export function prepareReportLayoutForSave(value: Partial<ReportLayoutSettings>): ReportLayoutSettings {
  return normalizeReportLayout(value);
}
