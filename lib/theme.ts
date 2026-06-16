// theme (ของกลาง) — สีเน้น (accent) ต่อผู้ใช้ → ตั้งตัวแปร CSS `--accent` ที่ :root
// เก็บใน localStorage (ทันที) + sync เข้าบัญชีผ่าน <ThemeSync/> · แจ้ง listeners ตอนเปลี่ยน
const KEY = "erp-theme-accent";
let current: string | null = null;
const listeners = new Set<(c: string | null) => void>();

function apply(c: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (c) root.style.setProperty("--accent", c);
  else root.style.removeProperty("--accent");   // กลับไปใช้ค่า default ใน globals.css
}

export function getTheme(): string | null { return current; }

export function initTheme(): string | null {
  try { const s = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null; if (s) current = s; } catch { /* ignore */ }
  apply(current);
  return current;
}

export function setTheme(c: string | null): void {
  current = c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
  try {
    if (typeof localStorage !== "undefined") {
      if (current) localStorage.setItem(KEY, current); else localStorage.removeItem(KEY);
    }
  } catch { /* ignore */ }
  apply(current);
  listeners.forEach((fn) => fn(current));
}

export function subscribeTheme(fn: (c: string | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
