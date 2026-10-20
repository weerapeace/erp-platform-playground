/**
 * 🩺 ตรวจลิงก์/คอลัมน์ของเว็บร้าน "จะขึ้นบนเว็บจริงไหม" (ของกลาง · pure) — ใช้ในตั้งค่าเมนู/ท้ายเว็บ (website-theme-panel)
 *   ปัญหาที่กันไว้: พรีวิวใน ERP โชว์หน้าที่ยังเป็นร่างด้วย → ดูเหมือนครบ แต่เว็บจริงซ่อน/ลิงก์พาไป "ไม่พบหน้า"
 *   - ลิงก์ชนิด "หน้า" → หน้าที่ไม่มี / ยังเป็นร่าง = ลูกค้ากดแล้วเจอไม่พบหน้า (ยกเว้นหน้าที่เว็บมีแบบเดิมในโค้ด)
 *   - คอลัมน์ท้ายเว็บ "ศูนย์ช่วยเหลือ" → ไม่มีหน้าในกลุ่มที่เผยแพร่แล้ว = เว็บจริงไม่โชว์คอลัมน์นี้ (เว็บร้าน Footer hasContent)
 * ข้อมูลหน้า = /api/public/storefront/page?preview=1 (มี status) · กติกาต้องตรงกับเว็บร้าน (Footer.tsx · src/app/<หน้า>)
 */
export type PageInfo = { slug: string; title: string; status?: string; help?: string };
export type LinkIssue = { level: "warn" | "info"; text: string };

/** หน้าที่เว็บร้านมีแบบเดิมในโค้ด — หน้าใน ERP ชื่อนี้ยังไม่เผยแพร่ = เว็บใช้หน้าแบบเดิมแทน (ไม่พัง) */
export const BUILTIN_PAGE_SLUGS = ["contact", "privacy", "track"] as const;

const isLive = (p: PageInfo) => !p.status || p.status === "published";
const isBuiltin = (slug: string) => (BUILTIN_PAGE_SLUGS as readonly string[]).includes(slug);

/** ลิงก์ไปหน้าที่สร้างเอง (เมนูชนิด "หน้า") */
export function pageLinkIssue(slug: string, pages: PageInfo[]): LinkIssue | null {
  const s = slug.trim();
  if (!s) return { level: "info", text: "ยังไม่ได้เลือกหน้า — ตอนนี้ลิงก์นี้พาไปหน้าแรก" };
  const p = pages.find((x) => x.slug === s);
  if (!p) return isBuiltin(s) ? null : { level: "warn", text: `ยังไม่มีหน้า /${s} — ลูกค้ากดแล้วจะเจอ "ไม่พบหน้า"` };
  if (isLive(p)) return null;
  return isBuiltin(s)
    ? { level: "info", text: `หน้า “${p.title}” ยังเป็นร่าง — ตอนนี้เว็บใช้หน้าแบบเดิมแทน (เผยแพร่แล้วจะใช้หน้าที่ทำไว้)` }
    : { level: "warn", text: `หน้า “${p.title}” ยังเป็นร่าง — ลูกค้ากดแล้วจะเจอ "ไม่พบหน้า" จนกว่าจะเผยแพร่` };
}

/** คอลัมน์ท้ายเว็บ "ศูนย์ช่วยเหลือ" (text = ชื่อกลุ่มไทย) */
export function helpColumnIssue(group: string, pages: PageInfo[]): LinkIssue | null {
  const g = group.trim();
  if (!g) return { level: "warn", text: "ยังไม่ได้เลือกกลุ่ม — คอลัมน์นี้จะไม่ขึ้นบนเว็บจริง" };
  const list = pages.filter((p) => p.help === g);
  if (!list.length) return { level: "warn", text: `ยังไม่มีหน้าในกลุ่ม “${g}” — คอลัมน์นี้จะไม่ขึ้นบนเว็บจริง` };
  const live = list.filter(isLive).length;
  if (!live) return { level: "warn", text: `หน้าในกลุ่ม “${g}” ยังเป็นร่างทั้ง ${list.length} หน้า — คอลัมน์นี้จะไม่ขึ้นบนเว็บจริง (พรีวิวเห็นเพราะพรีวิวโชว์ร่างด้วย)` };
  if (live < list.length) return { level: "info", text: `ขึ้นเว็บจริง ${live} จาก ${list.length} หน้า — ที่เหลือยังเป็นร่าง` };
  return null;
}

type LinkLike = { kind: string; value: string; children?: LinkLike[] };

/** ลิงก์ที่มีปัญหา (นับทุกชั้น · เฉพาะระดับ warn) — ไว้ทำป้ายสรุป */
export function countLinkWarnings(items: LinkLike[], pages: PageInfo[]): number {
  let n = 0;
  for (const it of items) {
    if (it.kind === "page" && pageLinkIssue(it.value, pages)?.level === "warn") n++;
    if (it.children?.length) n += countLinkWarnings(it.children, pages);
  }
  return n;
}
