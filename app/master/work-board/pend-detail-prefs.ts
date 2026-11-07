/**
 * ค่าที่หน้าบอร์ดจ่ายงานใช้ร่วมกับป๊อปรายละเอียดงานค้าง (pend-detail) — แยกเป็นไฟล์เบา
 * ให้หน้าใช้ได้ทันทีโดยไม่ต้องลากโค้ดป๊อปทั้งก้อน (ป๊อปโหลดตอนเปิดใช้ · perf-check 2026-11-07)
 * pend-detail.tsx re-export ทุกชื่อ — import เดิมใช้ได้เหมือนเดิม
 */

export type PendPane = "job" | "bom" | "prep" | "stage" | "dispatch" | "due" | "group" | "hist";
export const PEND_PANES: [PendPane, string][] = [
  ["job", "📋 รายละเอียดงาน"], ["bom", "🛒 BOM / ซื้อของ"], ["prep", "✂️ เตรียม / ตัด"], ["stage", "🚦 ความคืบหน้า"],
  ["dispatch", "🚚 จ่ายงาน"], ["due", "📅 กำหนดส่ง"], ["group", "🗂 กลุ่ม"], ["hist", "🕘 ประวัติ"],
];
/** คอลัมน์ → แท็บที่เปิด (ไม่มีในนี้ = กดแล้วไม่กาง เช่น ช่องค่าแรงที่ไว้ดับเบิลคลิกแก้) */
export const CELL_PANE: Record<string, PendPane> = {
  img: "job", prod: "job", brand: "job", prio: "job", issues: "job", price: "job", value: "job",
  created: "hist", qty: "dispatch", prep: "prep", buy: "bom", eta: "bom", stage: "stage", due: "due", group: "group",
};

/** ตั้งค่ารายละเอียดงาน "ต่อคน" — ปุ่มไหน / กล่องไหน ซ่อนไว้ */
export type DetailPrefs = { hideBtns: string[]; hideSecs: string[] };
export const DETAIL_PREFS_DEFAULT: DetailPrefs = { hideBtns: ["printSteps"], hideSecs: [] };
export const parseDetailPrefs = (v: unknown): DetailPrefs | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return { hideBtns: strs(o.hideBtns), hideSecs: strs(o.hideSecs) };
};
