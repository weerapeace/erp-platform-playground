// ============================================================
// hover-delay — เวลาหน่วงก่อนโชว์รูปใหญ่ตอนชี้รูป (ของกลาง HoverImage / HoverPreview)
// ตั้งต่อคนในเครื่อง (localStorage) ที่เมนูโปรไฟล์ → หน้าตา → "ชี้รูปแล้วเห็นรูปใหญ่"
// ค่าเริ่ม 0 = เด้งทันทีเหมือนเดิม · หน้าไหนอยากหน่วงเฉพาะ ส่ง prop delay ได้ (ชนะค่าของคน)
// ============================================================

export const HOVER_DELAY_KEY = "erp:hover-delay";
export const HOVER_DELAY_CHOICES = [0, 200, 400, 700] as const;
export const HOVER_DELAY_EVENT = "erp:hover-delay";

export function readHoverDelay(): number {
  try {
    const n = Number(localStorage.getItem(HOVER_DELAY_KEY));
    return Number.isFinite(n) && n >= 0 && n <= 3000 ? n : 0;
  } catch { return 0; }
}

export function setHoverDelay(ms: number): void {
  try { localStorage.setItem(HOVER_DELAY_KEY, String(Math.max(0, Math.min(3000, Math.round(ms))))); } catch { /* โหมดส่วนตัว */ }
  try { window.dispatchEvent(new Event(HOVER_DELAY_EVENT)); } catch { /* server */ }
}

/** ซูมด้วยล้อเมาส์: ขยับทีละ 1.15 เท่า อยู่ในช่วง 1–5 เท่า (pure เทสต์ได้) */
export function nextWheelZoom(scale: number, deltaY: number): number {
  const n = deltaY < 0 ? scale * 1.15 : scale / 1.15;
  return Math.round(Math.max(1, Math.min(5, n)) * 100) / 100;
}
