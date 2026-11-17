// ============================================================
// save-shortcut — Ctrl+S (Mac: ⌘S) = บันทึก ทุกฟอร์มที่ใช้ของกลาง (แกนกลาง · pure เทสต์ได้)
// ของกลางที่ลงทะเบียนให้แล้ว: SaveBar · FooterSaveButton (แถบล่างลิ้นชัก MasterCRUD) · ERPForm · ฟอร์มลิ้นชัก MasterCRUD
// ฟอร์มซ้อนกัน (ป๊อปเปิดทับหน้า) → ตัวที่ลงทะเบียน "ล่าสุด" (บนสุด) ได้บันทึกก่อน ตัวเดียว
// แป้นไทยกด Ctrl+S ได้ "ห" → อ่านปุ่มด้วย shortcutKey (lib/shortcut-key) เสมอ
// hook ฝั่งหน้า: useSaveShortcut (components/save-bar/use-save-shortcut.ts)
// ============================================================
import { shortcutKey } from "@/lib/shortcut-key";

type Entry = { id: number; save: () => void; enabled: () => boolean };
const entries: Entry[] = [];
let seq = 0;

/** กดปุ่มนี้ = บันทึกไหม (Ctrl/⌘ + S · ไม่นับ Shift/Alt เพื่อไม่ชนคีย์อื่น) */
export function isSaveShortcut(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && shortcutKey(e) === "s";
}

export function registerSaveHandler(save: () => void, enabled: () => boolean = () => true): () => void {
  const id = ++seq;
  entries.push({ id, save, enabled });
  return () => {
    const i = entries.findIndex((x) => x.id === id);
    if (i >= 0) entries.splice(i, 1);
  };
}

/** หาตัวบันทึกบนสุดที่กดได้ แล้วเรียก · คืน true = มีตัวรับ (ควรกันเบราว์เซอร์ "บันทึกหน้าเว็บ") */
export function runTopSave(): boolean {
  if (entries.length === 0) return false;
  for (let i = entries.length - 1; i >= 0; i--) {
    const x = entries[i];
    if (x.enabled()) { x.save(); return true; }
  }
  return true; // มีฟอร์มอยู่ แต่ยังไม่มีอะไรให้บันทึก → กันหน้าต่าง "บันทึกหน้าเว็บ" ของเบราว์เซอร์ไว้ก่อน
}

export function saveHandlerCount(): number {
  return entries.length;
}

let listening = false;
/** ติดตัวฟังปุ่มครั้งเดียวทั้งหน้า (เรียกจาก hook) */
export function ensureSaveShortcutListener(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("keydown", (e) => {
    if (!isSaveShortcut(e) || e.defaultPrevented) return;
    if (runTopSave()) e.preventDefault();
  });
}
