// ============================================================
// shortcutKey — อ่าน "ปุ่มที่กด" สำหรับคีย์ลัด (Ctrl+Z / Ctrl+P / ปุ่ม 1-9 / "/" ...) ให้ทำงานทุกภาษาแป้นพิมพ์
//
// ปัญหา: e.key บอก "ตัวอักษรตามภาษาที่เปิดอยู่" → แป้นพิมพ์ไทย กด Ctrl+Z ได้ "ผ" · ปุ่ม 1 ได้ "ๅ" · "/" ได้ "ฝ" → คีย์ลัดเงียบ
// แก้:   e.key เป็นตัวอังกฤษ/ตัวเลข/เครื่องหมายปกติ → เชื่อ e.key (แป้นแบบอื่นเช่น Dvorak ยังถูก)
//        e.key เป็นตัวอักษรภาษาอื่น (ไทย) → ดูตำแหน่งปุ่มจริง e.code ("KeyZ" → "z" · "Digit1" → "1" · "Slash" → "/")
// ใช้:   if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "z") undo();
// ใช้ที่: ทุกคีย์ลัดตัวอักษร/ตัวเลข/เครื่องหมาย (ดูในทะเบียนของกลาง key "shortcut-key")
// ============================================================

const PUNCT: Record<string, string> = {
  Slash: "/", Period: ".", Comma: ",", Minus: "-", Equal: "=", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`",
};

/** ปุ่มที่กด (ตัวเล็ก a-z / 0-9 / เครื่องหมาย) ไม่ขึ้นกับภาษาแป้นพิมพ์ · ปุ่มพิเศษคืน e.key ตัวเล็ก (เช่น "enter", "delete", "arrowleft") */
export function shortcutKey(e: Pick<KeyboardEvent, "key" | "code">): string {
  const key = e.key ?? "";
  if (key.length === 1 && key >= "!" && key <= "~") return key.toLowerCase();   // ตัวอังกฤษ/ตัวเลข/เครื่องหมาย → เชื่อตามที่พิมพ์
  const code = e.code ?? "";
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1];
  if (PUNCT[code]) return PUNCT[code];
  return key.toLowerCase();
}
