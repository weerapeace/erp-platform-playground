/**
 * 🎞️ คลังไอคอน Lottie มาตรฐาน (ของกลาง · pure) — ไฟล์อยู่ public/lottie/library/<key>.json (สร้างด้วย scripts/gen-lottie-library.cjs)
 *   ค่าไอคอนที่เก็บ = "img:/lottie/library/<key>.json" → <Icon value> ของกลางเล่นเป็นไอคอนเคลื่อนไหว (components/animated-icon)
 *   เพิ่มไอคอน = เพิ่มในสคริปต์ + ทะเบียนนี้ (ชื่อ 2 ภาษา) แล้วรันสคริปต์ใหม่
 */

export type LottieLibraryItem = { key: string; th: string; en: string };

export const LOTTIE_LIBRARY: LottieLibraryItem[] = [
  { key: "cut", th: "กรรไกร / ตัด", en: "Scissors / cut" },
  { key: "block", th: "บล็อก", en: "Block" },
  { key: "sew", th: "เย็บ / ตะเข็บ", en: "Sewing" },
  { key: "screen", th: "สกรีน", en: "Screen print" },
  { key: "laser", th: "เลเซอร์", en: "Laser" },
  { key: "grade", th: "เกรดไซซ์", en: "Size grading" },
  { key: "emb", th: "ปัก / ดอกไม้", en: "Embroidery" },
  { key: "other", th: "อื่นๆ", en: "Other" },
  { key: "check", th: "ตรวจ / อนุมัติ", en: "Check / approve" },
  { key: "box", th: "กล่อง / แพ็ก", en: "Box / pack" },
  { key: "pencil", th: "วาด / สเก็ตช์", en: "Draw / sketch" },
  { key: "camera", th: "ถ่ายรูป", en: "Photo" },
  { key: "doc", th: "เอกสาร / สเปก", en: "Document / spec" },
  { key: "tag", th: "ป้าย / แท็ก", en: "Label / tag" },
  { key: "palette", th: "สี / พาเลต", en: "Colour / palette" },
  { key: "layers", th: "ชั้นงาน", en: "Layers" },
];

const KEYS = new Set(LOTTIE_LIBRARY.map((x) => x.key));
export const LOTTIE_LIBRARY_PREFIX = "img:/lottie/library/";

/** ค่าไอคอนของไอคอนในคลัง */
export const lottieLibraryValue = (key: string) => `${LOTTIE_LIBRARY_PREFIX}${key}.json`;

/** ค่าไอคอนนี้มาจากคลังไหม → คืน key · ไม่ใช่ = null */
export function lottieLibraryKey(v: string | null | undefined): string | null {
  const s = String(v ?? "");
  if (!s.startsWith(LOTTIE_LIBRARY_PREFIX)) return null;
  const key = s.slice(LOTTIE_LIBRARY_PREFIX.length).replace(/\.json$/, "");
  return KEYS.has(key) ? key : null;
}
