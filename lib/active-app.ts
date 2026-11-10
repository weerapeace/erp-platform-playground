/**
 * 🧭 ความจำกลาง "แอปที่กำลังเปิด" ของแถบแอปด้านบน (PlaygroundShell) + การ์ดเปิดแอปในวงแอป (/apps)
 *
 * ทำไมต้องมี: เชลล์ถูก mount ใหม่ทุกครั้งที่ข้ามโซนหน้า (เช่น /purchasing → /master/skus คนละ layout)
 *   เดิมจำ "แท็บที่กด" ไว้ใน useRef ของเชลล์ (หายตอน mount ใหม่) + จำแอปไว้ใน localStorage อย่างเดียว (แชร์ทุกแท็บ)
 *   → กด Master Data จากหน้าจัดซื้อ: หน้าเก่าดึงแอปกลับเป็นจัดซื้อก่อนเปลี่ยนหน้า แล้วหน้า SKUs ก็เชื่อค่านั้น
 *     (SKUs อยู่ทั้ง Master Data + จัดซื้อ + จัดการงาน) = แถบบนไฮไลต์ "จัดซื้อ"
 *
 * เก็บ 3 อย่าง:
 *   - แอปของแท็บเบราว์เซอร์นี้ → ในหน่วยความจำ (ไม่ปนกับแท็บอื่น · รอดตอนเชลล์ mount ใหม่)
 *   - แอปล่าสุดที่ใช้ → localStorage "erp-active-app" (ใช้ตอนเปิดแท็บใหม่/รีโหลด + หน้า /apps ไฮไลต์การ์ดล่าสุด)
 *   - "เพิ่งกดเลือกแอป" → ค้างไว้จนถึงหน้าใหม่ (กันหน้าเก่าดึงแอปกลับ) — กฎอยู่ที่ lib/app-orbit appPickState
 * กฎว่าหน้าไหนไฮไลต์แอปไหน: lib/app-orbit choosePageApp
 * ใช้ที่: components/playground-shell · components/app-orbit
 */
import { APP_PICK_TTL_MS, hrefPath, type AppPick } from "@/lib/app-orbit";

const LS_KEY = "erp-active-app";
let tabApp: string | null = null;
let pending: AppPick | null = null;

/** จำแอปล่าสุดไว้ให้แท็บใหม่/รีโหลด (ไม่แตะแอปของแท็บนี้) — ใช้ตอนกดแท็บแอปแบบเปิดแท็บใหม่ (Ctrl/⌘+คลิก) */
export function rememberLastApp(key: string | null): void {
  try { if (key) localStorage.setItem(LS_KEY, key); else localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

/** แอปที่แท็บนี้เปิดอยู่ (เชลล์เรียกทุกครั้งที่เปลี่ยนแอป) */
export function setTabActiveApp(key: string | null): void {
  tabApp = key;
  rememberLastApp(key);
}

/** ผู้ใช้กดเลือกแอปเอง (แท็บแอปด้านบน / การ์ดวงแอป) · from = หน้าที่อยู่ตอนกด · toHref = หน้าที่จะไป (ไม่รู้ = null) */
export function pickActiveApp(key: string, from: string, toHref: string | null): void {
  pending = { app: key, from, to: toHref ? hrefPath(toHref) : from, at: Date.now() };
  setTabActiveApp(key);
}

export function pendingAppPick(): AppPick | null { return pending; }
export function clearAppPick(): void { pending = null; }

/** แอปเริ่มต้นตอนเชลล์ mount: เพิ่งกดเลือก → แอปของแท็บนี้ → แอปล่าสุดที่ใช้ (แท็บใหม่/รีโหลด) */
export function initialActiveApp(now = Date.now()): string | null {
  if (pending && now - pending.at <= APP_PICK_TTL_MS) return pending.app;
  if (tabApp) return tabApp;
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}
