// ============================================================
// สีที่ใช้ล่าสุด (ของกลาง ColorPicker) — จำ 8 สีล่าสุดในเครื่องผู้ใช้ (localStorage)
// ไม่ต้องมีตารางฐานข้อมูล · ล้างเบราว์เซอร์ = หาย (ยอมรับได้ เป็นแค่ความสะดวก)
// ============================================================

export const RECENT_COLORS_KEY = "erp:recent-colors";
export const RECENT_COLORS_MAX = 8;

/** ใส่สีใหม่ไว้หน้าสุด ตัดตัวซ้ำ เหลือไม่เกิน max (pure — เทสต์ได้) */
export function pushRecentColor(list: string[], hex: string, max = RECENT_COLORS_MAX): string[] {
  const h = String(hex ?? "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(h)) return list.slice(0, max);
  return [h, ...list.filter((c) => c.toLowerCase() !== h)].slice(0, max);
}

export function readRecentColors(): string[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(RECENT_COLORS_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)).slice(0, RECENT_COLORS_MAX) : [];
  } catch { return []; }
}

export function rememberColor(hex: string): string[] {
  const next = pushRecentColor(readRecentColors(), hex);
  try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next)); } catch { /* โหมดส่วนตัว = ไม่จำ */ }
  return next;
}
