/** ค่าตั้ง "ป๊อปเตือนงานแบบลอย" ต่อคน (ล้วน ๆ ไม่มี hook — ใช้ได้ทั้งหน้าจอและเทสต์) · hook อยู่ใน ./float */

export type WorkPopupFloatPosition = "br" | "tr";
export type WorkPopupFloatPref = { enabled: boolean; minimized: boolean; position: WorkPopupFloatPosition };

export const WORK_POPUP_FLOAT_KEY = "work_popup_float";
export const WORK_POPUP_FLOAT_DEFAULT: WorkPopupFloatPref = { enabled: true, minimized: false, position: "br" };
/** จอแคบกว่านี้ = หน้าต่างกลางจอแบบเดิม (ERP มีแถบเมนูล่าง ลอยแล้วบังงาน) */
export const FLOAT_MIN_WIDTH = 1280;
/** ข้อความบอกวิธีปิดถาวร — ปิดได้ที่เดียวคือเมนูโปรไฟล์ (✕ บนการ์ด = แค่ซ่อนเป็นปุ่มเล็ก) */
export const WORK_POPUP_HIDE_HINT = "ปิดป๊อปนี้ได้ที่ เมนูโปรไฟล์ (กดที่ชื่อคุณ) → 🔔 ป๊อปเตือนงาน";

export function parseWorkPopupFloatPref(raw: unknown): WorkPopupFloatPref | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<WorkPopupFloatPref>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : WORK_POPUP_FLOAT_DEFAULT.enabled,
    minimized: typeof r.minimized === "boolean" ? r.minimized : WORK_POPUP_FLOAT_DEFAULT.minimized,
    position: r.position === "tr" ? "tr" : "br",
  };
}
