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

const SHIFT_DIGIT = ")!@#$%^&*(";
const SHIFT_PUNCT: Record<string, string> = {
  Slash: "?", Period: ">", Comma: "<", Minus: "_", Equal: "+", Semicolon: ":", Quote: "\"",
  BracketLeft: "{", BracketRight: "}", Backslash: "|", Backquote: "~",
};

/**
 * ตัวอักษรที่ "เครื่องยิงบาร์โค้ด" ตั้งใจพิมพ์ — ไม่ขึ้นกับภาษาแป้นพิมพ์ (คืน "" = ไม่ใช่ตัวอักษร)
 * ปัญหา: เครื่องยิงทำตัวเป็นคีย์บอร์ด ถ้าเครื่องเปิดภาษาไทยอยู่ ยิง "TH123" ได้ "ฮ๊ๅ/-" → ค้นไม่เจอ
 * แก้: ดูตำแหน่งปุ่มจริง e.code + Shift ก่อนเสมอ (เครื่องยิงส่งปุ่มตามแป้นอังกฤษ US · ไม่สน Caps Lock)
 *      ⚠️ ห้ามเชื่อ e.key แม้เป็นตัวอังกฤษ — แป้นไทยปุ่มเลข 2 ได้ "/" · เลข 3 ได้ "-" (เป็นตัวอังกฤษแต่ผิด)
 *      ไม่รู้ตำแหน่งปุ่ม (e.code ว่าง/ปุ่มแปลก) ค่อยใช้ e.key · แป้น AZERTY/Dvorak ไม่รองรับ (ไม่มีใช้ในร้าน)
 * ใช้ที่: useScanGun (ของกลางจับเครื่องยิง) — ห้ามใช้กับช่องพิมพ์ของคน
 */
export function typedChar(e: Pick<KeyboardEvent, "key" | "code" | "shiftKey">): string {
  const key = e.key ?? "";
  const code = e.code ?? "";
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return e.shiftKey ? letter[1] : letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return e.shiftKey ? SHIFT_DIGIT[Number(digit[1])] : digit[1];
  const num = /^Numpad([0-9])$/.exec(code);
  if (num) return num[1];
  if (code === "Space") return " ";
  if (SHIFT_PUNCT[code]) return e.shiftKey ? SHIFT_PUNCT[code] : PUNCT[code];
  const numOp: Record<string, string> = { NumpadAdd: "+", NumpadSubtract: "-", NumpadMultiply: "*", NumpadDivide: "/", NumpadDecimal: "." };
  if (numOp[code]) return numOp[code];
  return key.length === 1 && key >= " " && key <= "~" ? key : "";
}
