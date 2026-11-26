/**
 * 🔒 ชุดกระดานแก้งาน (ส่วนคำนวณล้วน · ใช้กับ components/board-kit) — เจ้าของขอ 2026-11-26 เลือกแบบ A + ข้อ 1-4
 *   wheelAction = ล้อเมาส์บนกระดานควรทำอะไร (ล็อก = ปล่อยให้หน้าเว็บเลื่อน เว้นแต่กด Ctrl/⌘)
 *   clampToolboxPos = กันกล่องเครื่องมือหลุดออกนอกกระดาน (ย่อจอ/ออกเต็มจอแล้วยังเห็น)
 *   hotkeyLetter = ปุ่มลัดตัวอักษร ใช้ตำแหน่งปุ่ม (KeyV) → แป้นไทยก็กดได้
 */

export type WheelAction = "zoom" | "pan" | "pass";

/**
 * locked = กระดานล็อกอยู่ · wheelZooms = ตอนปลดล็อก หมุนลูกกลิ้งเฉย ๆ แล้วซูม (false = เลื่อนภาพ แบบหน้าต่างวาดชิ้น)
 * คืน "pass" = ไม่ต้องทำอะไร ปล่อยให้หน้าเว็บเลื่อนตามปกติ (ห้าม preventDefault)
 */
export function wheelAction(locked: boolean, ctrl: boolean, wheelZooms = true): WheelAction {
  if (ctrl) return "zoom";
  if (locked) return "pass";
  return wheelZooms ? "zoom" : "pan";
}

export type ToolboxPos = { x: number; y: number; fold: boolean };
export const DEFAULT_TOOLBOX_POS: ToolboxPos = { x: 8, y: 8, fold: false };

export function parseToolboxPos(v: unknown): ToolboxPos | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const x = Number(o.x), y = Number(o.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, fold: o.fold === true };
}

/** ให้กล่องขนาด box อยู่ในกระดานขนาด area เสมอ (เว้นขอบ 4px) */
export function clampToolboxPos(pos: { x: number; y: number }, box: { w: number; h: number }, area: { w: number; h: number }) {
  const m = 4;
  const x = Math.min(Math.max(m, pos.x), Math.max(m, area.w - box.w - m));
  const y = Math.min(Math.max(m, pos.y), Math.max(m, area.h - box.h - m));
  return { x: Math.round(x), y: Math.round(y) };
}

/** "V" → "KeyV" · ตัวเลข "1" → "Digit1" · อื่น ๆ = null */
export function hotkeyCode(letter: string): string | null {
  const k = letter.trim().toUpperCase();
  if (/^[A-Z]$/.test(k)) return `Key${k}`;
  if (/^[0-9]$/.test(k)) return `Digit${k}`;
  return null;
}

/** กำลังพิมพ์อยู่ในช่อง/อยู่ในกระดานวาด Excalidraw = ไม่รับปุ่มลัด */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  return !!el.closest?.(".excalidraw");
}
