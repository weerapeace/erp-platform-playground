/**
 * 🖼 เปิดรูปไม่ได้ → บอกสาเหตุเป็นภาษาคน (ของกลาง · pure ห้ามใส่ "use client" — เทสต์ import ได้)
 *
 * ใช้ตอนย่อรูปก่อนอัป (lib/image-decode → components/image-attach resizeImage) แทนข้อความกว้าง ๆ "อัปโหลดไม่สำเร็จ"
 * สาเหตุดูจาก: ขนาดไฟล์ · อ่านไฟล์ได้ไหม · ชนิดจริงจากหัวไฟล์ (lib/media-upload-limits sniffMediaType)
 * เจอจริง 2026-11-01: ลงรูปเว็บ CVRS004 พลาด 10 ไฟล์ ขึ้นแค่ "อัปโหลดไม่สำเร็จ" — ไฟล์ไม่เคยถึงเซิร์ฟเวอร์ เพราะเบราว์เซอร์เปิดรูปไม่ได้
 */

export type ImageOpenProblem =
  | "empty" | "unreadable" | "heic_failed" | "avif" | "tiff" | "psd" | "pdf" | "video" | "unknown_format" | "corrupt";

const MESSAGES: Record<ImageOpenProblem, string> = {
  empty: "ไฟล์ว่าง (0 ไบต์) — เซฟมาไม่ครบ ลองคัดลอกไฟล์ใหม่",
  unreadable: "อ่านไฟล์ไม่ได้ — ถ้าอยู่ใน Google Drive ให้โหลดลงเครื่องก่อน (คลิกขวา → ใช้แบบออฟไลน์ได้) แล้วกดลงซ้ำ",
  heic_failed: "รูป HEIC (จาก iPhone) แปลงเป็น JPG ไม่สำเร็จ — เปิดรูปแล้วบันทึกเป็น JPG ก่อน",
  avif: "รูป AVIF ที่เบราว์เซอร์นี้เปิดไม่ได้ — บันทึกเป็น JPG ก่อน",
  tiff: "ไฟล์ TIFF เบราว์เซอร์เปิดไม่ได้ — ส่งออกเป็น JPG ก่อน",
  psd: "ไฟล์ Photoshop (PSD) — ส่งออกเป็น JPG หรือ PNG ก่อน",
  pdf: "เป็นไฟล์ PDF ไม่ใช่รูป",
  video: "เป็นไฟล์วิดีโอ ไม่ใช่รูป",
  unknown_format: "ข้างในไม่ใช่ JPG / PNG / WebP (แม้นามสกุลเป็นรูป) — เปิดแล้วบันทึกเป็น JPG ใหม่",
  corrupt: "ไฟล์รูปเสียหรือเซฟมาไม่ครบ — เปิดดูในเครื่องแล้วบันทึกใหม่",
};

export const imageOpenMessage = (p: ImageOpenProblem) => MESSAGES[p];

export class ImageOpenError extends Error {
  readonly problem: ImageOpenProblem;
  constructor(problem: ImageOpenProblem) {
    super(MESSAGES[problem]);
    this.name = "ImageOpenError";
    this.problem = problem;
  }
}

/**
 * สาเหตุที่เปิดรูปไม่ได้ — ใช้หลังเบราว์เซอร์เปิดไม่สำเร็จ (หรือก่อนเปิด สำหรับไฟล์ว่าง/อ่านไม่ได้)
 * sniffed = ชนิดจากหัวไฟล์ ("" = ไม่รู้จัก) · null = อ่านหัวไฟล์ไม่ได้เลย
 */
export function imageOpenProblem(size: number, sniffed: string | null): ImageOpenProblem {
  if (size === 0) return "empty";
  if (sniffed === null) return "unreadable";
  if (sniffed === "image/heic") return "heic_failed";
  if (sniffed === "image/avif") return "avif";
  if (sniffed === "image/tiff") return "tiff";
  if (sniffed === "image/vnd.adobe.photoshop") return "psd";
  if (sniffed === "application/pdf") return "pdf";
  if (sniffed.startsWith("video/") || sniffed.startsWith("audio/")) return "video";
  if (!sniffed) return "unknown_format";
  return "corrupt";   // หัวไฟล์เป็นรูปที่เบราว์เซอร์รู้จัก แต่เปิดไม่ขึ้น
}

/** ข้อความจาก error ใด ๆ ตอนอัปรูป (ไม่ใช่ Error = ข้อความกว้าง ๆ) */
export function uploadErrorText(e: unknown, fallback = "อัปโหลดไม่สำเร็จ"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}

/** จัดกลุ่มไฟล์ที่พลาดตามสาเหตุ (ข้อความเดียวกัน = กลุ่มเดียว · คงลำดับที่เจอก่อน) */
export function groupFailures<T extends { why: string }>(list: T[]): { why: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const x of list) { const a = m.get(x.why) ?? []; a.push(x); m.set(x.why, a); }
  return [...m].map(([why, items]) => ({ why, items }));
}
