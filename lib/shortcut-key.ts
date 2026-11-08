// ============================================================
// shortcutKey — อ่าน "ปุ่มที่กด" สำหรับคีย์ลัด (Ctrl+Z / Ctrl+D ...) ให้ทำงานทุกภาษาแป้นพิมพ์
//
// ปัญหา: e.key บอก "ตัวอักษรตามภาษาที่เปิดอยู่" → แป้นพิมพ์ไทย กด Ctrl+Z ได้ "ผ" ไม่ใช่ "z" → คีย์ลัดเงียบ
// แก้:   ดู e.code (ตำแหน่งปุ่มจริงบนแป้น "KeyZ") ก่อน · ไม่มี code ค่อยใช้ e.key
// ใช้:   if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "z") undo();
// ใช้ที่: กระดาน flowchart กลาง · คีย์ลัดอื่นที่ยังเช็ก e.key ตรง ๆ ควรเปลี่ยนมาใช้ตัวนี้
// ============================================================

/** ปุ่มตัวอักษร/ตัวเลขที่กด (ตัวเล็ก a-z / 0-9) ไม่ขึ้นกับภาษาแป้นพิมพ์ · ปุ่มอื่นคืน e.key ตัวเล็ก (เช่น "enter", "delete") */
export function shortcutKey(e: Pick<KeyboardEvent, "key" | "code">): string {
  const code = e.code ?? "";
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1];
  return (e.key ?? "").toLowerCase();
}
