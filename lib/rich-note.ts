/**
 * โน้ตจัดรูปแบบ (ของกลาง) — ช่องเดียวเก็บได้ทั้ง HTML จากกล่องพิมพ์จัดรูปแบบ (RichTextEditor)
 * และข้อความธรรมดาจากระบบเก่า/ที่ AI เขียนให้ (เช่น บรีฟจากวางแผนหลายโพสต์ที่ขึ้นบรรทัดใหม่ด้วย \n)
 * ใช้กับ erp_creative_content.brief — ป๊อปโพสต์ + หน้าวางแผนคอนเทนต์
 * + รายละเอียดสินค้าที่ส่งขึ้น LINE (lib/line-create-payload · LINE_DESC_HTML): รายละเอียดในระบบเป็นข้อความธรรมดา
 *   แต่ LINE เก็บเป็น HTML ย่อหน้า → ต้องแปลง ไม่งั้นทุกย่อหน้าบน LINE ติดกันเป็นก้อนเดียว (เจ้าของขอ "เว้นวรรคสวย ๆ" 2026-11-10)
 */

/** เป็น HTML จากกล่องพิมพ์จัดรูปแบบไหม (ขึ้นต้นด้วยแท็กบล็อก) */
export function isHtmlNote(s: string | null | undefined): boolean {
  return /^\s*<(p|ul|ol|h[1-6]|div|blockquote|br)\b/i.test(s ?? "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type NoteHtmlOptions = {
  /** บรรทัดว่าง = ย่อหน้าว่าง (<p><br></p> แบบตัวแก้ไขของ LINE) — ค่าเริ่ม: ทิ้ง */
  keepBlankLines?: boolean;
  /** เว้นวรรคหน้าบรรทัด = &nbsp; (ย่อหน้าเยื้อง) — ค่าเริ่ม: ตัดทิ้ง */
  keepIndent?: boolean;
  /** บรรทัด "- " ติดกัน = รายการ <ul> — ค่าเริ่ม: ใช่ · false = เก็บขีดไว้เป็นข้อความ */
  bullets?: boolean;
};

/** แปลงเป็น HTML ให้กล่องพิมพ์ — ข้อความธรรมดา: 1 บรรทัด = 1 ย่อหน้า · บรรทัดขึ้นต้น "- " / "• " ติดกัน = bullet (ปิดได้) */
export function noteToHtml(s: string | null | undefined, opts: NoteHtmlOptions = {}): string {
  const src = s ?? "";
  if (!src.trim()) return "";
  if (isHtmlNote(src)) return src;
  const { keepBlankLines = false, keepIndent = false, bullets: useBullets = true } = opts;
  const out: string[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push(`<ul>${bullets.map((b) => `<li><p>${esc(b)}</p></li>`).join("")}</ul>`); bullets = []; } };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const m = useBullets ? /^[-•*]\s+(.*)$/.exec(line) : null;
    if (m) { bullets.push(m[1]); continue; }
    flush();
    if (line) {
      const indent = keepIndent ? (/^[ \t ]*/.exec(raw)?.[0] ?? "").replace(/\t/g, "    ").replace(/[  ]/g, "&nbsp;") : "";
      out.push(`<p>${indent}${esc(line)}</p>`);
    } else if (keepBlankLines) out.push("<p><br></p>");
  }
  flush();
  // ย่อหน้าว่างหัว/ท้าย ไม่มีประโยชน์
  while (out[0] === "<p><br></p>") out.shift();
  while (out[out.length - 1] === "<p><br></p>") out.pop();
  return out.join("");
}

/** แปลงเป็นข้อความล้วน (ค้นหา / ตัวอย่างบนการ์ด / ส่งต่อเป็นรายละเอียดงาน) — bullet เป็น "- " */
export function noteToText(s: string | null | undefined): string {
  const src = s ?? "";
  if (!isHtmlNote(src)) return src.trim();
  return src
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|div|blockquote|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .split("\n").map((l) => l.trim()).filter((l) => l && l !== "-")
    .join("\n");
}

/** ว่างจริงไหม (กล่องพิมพ์ที่ลบหมดจะเหลือ "<p></p>") */
export const isEmptyNote = (s: string | null | undefined): boolean => !noteToText(s);
