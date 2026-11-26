/**
 * 🏷 ใบปะหน้าจริงจากแพลตฟอร์ม (ของกลาง · กติกาล้วน ไม่มี React/เครือข่าย · มีเทสต์) — 2026-11-26
 *
 *   ทำอะไร: บอกว่าออเดอร์ไหนดึงใบปะหน้าจริงได้ (ตามแพลตฟอร์ม) · แปลเหตุผลที่พิมพ์ไม่ได้เป็นภาษาคน ·
 *           ขนาดกระดาษ + วางใบลงกระดาษ (ย่อ/หมุนให้พอดี) · สรุปใบที่พิมพ์ไปแล้ว (เตือนพิมพ์ซ้ำ)
 *   ใครใช้: หน้าพิมพ์ /print/platform-orders?kind=label (components/shipping-label) · API /api/shipping-labels
 *   เพิ่มแพลตฟอร์ม (TikTok/Lazada): เพิ่มแถวใน LABEL_SOURCES + ตัวดึงใน app/api/shipping-labels/adapters.ts — หน้าจอไม่ต้องแก้
 *   ไม่เก็บไฟล์ PDF ไว้ที่ไหน (มีชื่อ/ที่อยู่/เบอร์ลูกค้า) — ขอจากแพลตฟอร์มใหม่ทุกครั้งที่พิมพ์
 *   ประวัติพิมพ์ = ของกลาง print_logs doc_type "po_label" (usePrintLog) · คู่มือ docs/shipping-label.md
 */

/** แหล่งออเดอร์ (platform_orders.source) ที่ดึงใบปะหน้าจริงได้ → ชื่อที่โชว์ */
export const LABEL_SOURCES: Record<string, { name: string; sellerCenter: string }> = {
  shopee_api: { name: "Shopee", sellerCenter: "https://seller.shopee.co.th/portal/sale/order" },
};
export const labelSourceSupported = (source: string | null | undefined): boolean => !!source && source in LABEL_SOURCES;

/** ส่งไปขอทีละกี่ใบ (ไฟล์ใบละ ~50–150KB → 10 ใบไม่เกินเพดานคำตอบ 4.5MB ของ Vercel) */
export const LABEL_FETCH_BATCH = 10;
export function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** ผลต่อออเดอร์จาก API — ok = มีไฟล์ (pdf = base64) · ไม่ ok = reason ภาษาคน */
export type LabelFetchResult = { id: string; order_no: string | null; ok: boolean; pdf?: string; reason?: string; code?: string; doc_type?: string };

/** ประวัติพิมพ์ล่าสุดต่อออเดอร์ (เตือนพิมพ์ซ้ำ) */
export type LabelPrinted = { n: number; last: string; by: string | null };
export type LabelCheckRow = { id: string; order_no: string | null; supported: boolean; reason: string | null; printed: LabelPrinted | null };

export const NO_TRACKING_REASON = "ยังไม่ได้นัดส่ง — กด “นัดส่ง” ใน Seller Centre ก่อน แล้วกลับมาพิมพ์";

/** error ของแพลตฟอร์ม → ภาษาคน + บอกทางไปต่อ */
export function labelFailureText(code: string | null | undefined, message?: string | null): string {
  const c = String(code ?? "");
  const m = String(message ?? "");
  const both = `${c} ${m}`;
  if (c === "no_tracking") return NO_TRACKING_REASON;
  if (/combine_order|combined parcel/i.test(both)) return "ออเดอร์นี้รวมกล่องกับออเดอร์อื่น — Shopee ให้พิมพ์ที่ Seller Centre เท่านั้น";
  if (/jit_order|only supports document printing in shopee seller center/i.test(both)) return "ขนส่งนี้พิมพ์ใบปะหน้าได้ที่ Seller Centre เท่านั้น";
  if (/being allocated|allocate/i.test(both)) return "Shopee กำลังจัดขนส่งให้ออเดอร์นี้ — รอ 1–2 นาทีแล้วลองใหม่";
  if (/order_status_error|status does not support/i.test(both)) return "สถานะออเดอร์ยังพิมพ์ใบปะหน้าไม่ได้ (ยังไม่นัดส่ง / ยกเลิก / ส่งไปแล้ว)";
  if (/tracking_number_invalid/i.test(both)) return "เลขพัสดุในระบบไม่ตรงกับ Shopee — กดดึงออเดอร์ Shopee ใหม่ แล้วลองอีกครั้ง";
  if (/package_number/i.test(both)) return "ออเดอร์นี้แยกหลายกล่อง — ข้อมูลกล่องไม่ตรง กดดึงออเดอร์ Shopee ใหม่ หรือพิมพ์ที่ Seller Centre";
  if (/download_later|processing|not_ready/i.test(both)) return "Shopee ยังทำไฟล์ไม่เสร็จ — ลองพิมพ์ใหม่อีกครั้ง";
  if (/order_not_exist/i.test(both)) return "Shopee ไม่พบออเดอร์นี้";
  if (/can_not_print|can not print|package_print_failed|should_print_first/i.test(both)) return "Shopee ยังไม่ให้พิมพ์ใบนี้ตอนนี้ — ลองใหม่ หรือพิมพ์ที่ Seller Centre";
  if (c === "unsupported") return "ออเดอร์ช่องทางนี้ยังดึงใบปะหน้าจริงไม่ได้";
  if (c === "cancelled") return "ออเดอร์ถูกยกเลิกแล้ว";
  return m || "ดึงใบปะหน้าไม่สำเร็จ";
}

/* ───────── กระดาษ ───────── */
export type LabelPaper = { code: string; label: string; hint: string; w: number; h: number; perPage: 1 | 4 } | { code: "original"; label: string; hint: string; w: 0; h: 0; perPage: 1 };
/** ขนาดกระดาษ (มม.) — ค่าเริ่ม = สติกเกอร์ 9×15 ซม. (เครื่องของร้าน · เจ้าของบอก 2026-11-26) */
export const LABEL_PAPERS: LabelPaper[] = [
  { code: "s90x150", label: "สติกเกอร์ 9×15 ซม.", hint: "เครื่องพิมพ์ความร้อนของร้าน", w: 90, h: 150, perPage: 1 },
  { code: "s100x150", label: "สติกเกอร์ 10×15 ซม. (4×6 นิ้ว)", hint: "ขนาดมาตรฐาน Shopee", w: 100, h: 150, perPage: 1 },
  { code: "a4x4", label: "A4 ใบละ 4", hint: "เครื่องพิมพ์ทั่วไป ตัดเป็น 4 ส่วน", w: 210, h: 297, perPage: 4 },
  { code: "original", label: "ขนาดเดิมจาก Shopee", hint: "ไม่ย่อ/ไม่หมุน", w: 0, h: 0, perPage: 1 },
];
export const DEFAULT_LABEL_PAPER = "s90x150";
export const labelPaperOf = (code: unknown): LabelPaper => LABEL_PAPERS.find((p) => p.code === code) ?? LABEL_PAPERS[0];
export const MM_PT = 72 / 25.4;
export const mmToPt = (mm: number) => mm * MM_PT;

export type Box = { x: number; y: number; w: number; h: number };
/** ช่องวางใบบนกระดาษ 1 แผ่น (หน่วย pt · จุดเริ่มมุมล่างซ้ายแบบ PDF) · A4 ใบละ 4 = 2×2 เรียงซ้าย→ขวา บน→ล่าง */
export function paperSlots(paper: LabelPaper): Box[] {
  const W = mmToPt(paper.w), H = mmToPt(paper.h);
  if (paper.perPage === 4) {
    const w = W / 2, h = H / 2;
    return [{ x: 0, y: h, w, h }, { x: w, y: h, w, h }, { x: 0, y: 0, w, h }, { x: w, y: 0, w, h }];
  }
  return [{ x: 0, y: 0, w: W, h: H }];
}

/**
 * วางหน้า PDF ขนาด srcW×srcH ลงช่อง box ให้ใหญ่ที่สุดโดยไม่ล้น (เว้นขอบ pad) — ลองทั้งตั้งตรงและหมุน 90° เลือกตัวที่ใหญ่กว่า
 * rotate=90 = หมุนทวนเข็ม (pdf-lib drawPage rotate degrees(90) หมุนรอบจุด x,y) → x ที่คืนให้ = ขอบขวาของภาพ
 * คืน scale (ย่อเป็นกี่เท่า) ไว้เตือนถ้าย่อมาก (บาร์โค้ดอาจสแกนยาก)
 */
export function fitPage(srcW: number, srcH: number, box: Box, pad = 0): { x: number; y: number; scale: number; rotate: 0 | 90 } {
  const bw = Math.max(1, box.w - pad * 2), bh = Math.max(1, box.h - pad * 2);
  const s0 = Math.min(bw / srcW, bh / srcH);
  const s90 = Math.min(bw / srcH, bh / srcW);
  if (s90 > s0 * 1.02) {
    const dw = srcH * s90, dh = srcW * s90;   // ขนาดที่เห็นหลังหมุน
    const left = box.x + pad + (bw - dw) / 2, bottom = box.y + pad + (bh - dh) / 2;
    return { x: left + dw, y: bottom, scale: s90, rotate: 90 };
  }
  const dw = srcW * s0, dh = srcH * s0;
  return { x: box.x + pad + (bw - dw) / 2, y: box.y + pad + (bh - dh) / 2, scale: s0, rotate: 0 };
}

/** ย่อน้อยกว่านี้ = เตือนให้ลองสแกนบาร์โค้ด */
export const SMALL_SCALE = 0.8;

/* ───────── เตือนพิมพ์ซ้ำ ───────── */
/** ใบที่พิมพ์ไปแล้ว (ในชุดที่เลือก) — เรียงพิมพ์ล่าสุดก่อน */
export function alreadyPrinted(rows: LabelCheckRow[]): (LabelCheckRow & { printed: LabelPrinted })[] {
  return rows.filter((r): r is LabelCheckRow & { printed: LabelPrinted } => !!r.printed && r.supported)
    .sort((a, b) => b.printed.last.localeCompare(a.printed.last));
}
/** ข้อความ "พิมพ์แล้วเมื่อ … โดย …" */
export function printedText(p: LabelPrinted): string {
  const t = Date.parse(p.last);
  const when = Number.isFinite(t)
    ? new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" })
    : p.last;
  return `พิมพ์แล้ว${p.n > 1 ? ` ${p.n} ครั้ง ล่าสุด` : ""}เมื่อ ${when}${p.by ? ` โดย ${p.by}` : ""}`;
}
