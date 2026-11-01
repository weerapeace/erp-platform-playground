/**
 * โน้ตจัดรูปแบบ (ของกลาง) — ช่องเดียวเก็บได้ทั้ง HTML จากกล่องพิมพ์จัดรูปแบบ (RichTextEditor)
 * และข้อความธรรมดาจากระบบเก่า/ที่ AI เขียนให้ (เช่น บรีฟจากวางแผนหลายโพสต์ที่ขึ้นบรรทัดใหม่ด้วย \n)
 * ใช้กับ erp_creative_content.brief — ป๊อปโพสต์ + หน้าวางแผนคอนเทนต์
 */

/** เป็น HTML จากกล่องพิมพ์จัดรูปแบบไหม (ขึ้นต้นด้วยแท็กบล็อก) */
export function isHtmlNote(s: string | null | undefined): boolean {
  return /^\s*<(p|ul|ol|h[1-6]|div|blockquote|br)\b/i.test(s ?? "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** แปลงเป็น HTML ให้กล่องพิมพ์ — ข้อความธรรมดา: 1 บรรทัด = 1 ย่อหน้า · บรรทัดขึ้นต้น "- " / "• " ติดกัน = bullet */
export function noteToHtml(s: string | null | undefined): string {
  const src = s ?? "";
  if (!src.trim()) return "";
  if (isHtmlNote(src)) return src;
  const out: string[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push(`<ul>${bullets.map((b) => `<li><p>${esc(b)}</p></li>`).join("")}</ul>`); bullets = []; } };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^[-•*]\s+(.*)$/.exec(line);
    if (m) { bullets.push(m[1]); continue; }
    flush();
    if (line) out.push(`<p>${esc(line)}</p>`);
  }
  flush();
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
