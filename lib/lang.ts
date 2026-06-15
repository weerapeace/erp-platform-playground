// ============================================================
// ภาษา (i18n core) — ไม่ผูก React เพื่อให้ฟังก์ชัน label นอก component ใช้ได้ด้วย
// เก็บใน localStorage + แจ้ง listeners ตอนเปลี่ยน
// ============================================================
export type Lang = "th" | "en";
const KEY = "erp-lang";

let current: Lang = "th";
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang { return current; }

export function initLang(): Lang {
  try { const s = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null; if (s === "en" || s === "th") current = s; } catch { /* ignore */ }
  return current;
}

export function setLang(l: Lang): void {
  current = l;
  try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY, l); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(l));
}

export function subscribeLang(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** แปลตรงจุด: tr("ไทย", "English") — ใช้ในฟังก์ชันนอก React */
export function tr(th: string, en: string): string { return current === "en" ? en : th; }
