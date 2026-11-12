/**
 * เช็กลิสต์กลาง (erp_record_tasks) — ส่วนที่ใช้ร่วมกันทั้งจอและ API (ห้าม import ของฝั่งเซิร์ฟเวอร์ในไฟล์นี้)
 * สรุปสั้นไว้โชว์บนการ์ด/อีเมล: ข้อที่ยังไม่เสร็จ (เรียงตามเวลาที่เพิ่ม) + ผู้รับผิดชอบของแต่ละข้อ + จำนวนข้อที่เสร็จแล้ว
 * ลิงก์ต่อข้อ (เช่น ร้านที่จะ "ซื้อของ") เก็บใน erp_record_tasks.metadata.links — ไม่มีคอลัมน์ใหม่
 * doc: docs/record-tasks.md
 */

/** ลิงก์ในข้อเช็กลิสต์ — label = ชื่อกำกับ (ไม่บังคับ · ไม่ใส่ = โชว์ชื่อเว็บ) */
export type TaskLink = { url: string; label?: string | null };
export const MAX_TASK_LINKS = 10;
const MAX_LINK_LABEL = 60;

/** open[i] = ข้อความข้อที่ค้าง · who[i] = ชื่อผู้รับผิดชอบ (null = ยังไม่มีคนรับ) · ids[i] = id ข้อ (ติ๊กบนการ์ดได้ตรง) · aids[i] = user id ผู้รับผิดชอบ
 *  links[i] = ลิงก์ของข้อนั้น (มีเฉพาะเมื่อมีข้อค้างที่ใส่ลิงก์ไว้) */
export type ChecklistSummary = { open: string[]; who?: (string | null)[]; ids?: string[]; aids?: (string | null)[]; links?: TaskLink[][]; done: number };

/** สวิตช์ในค่าที่ใช้บ่อย (erp_lookups.metadata.auto_new) = "ใส่ข้อนี้ให้เองทุกครั้งที่สร้างเรคคอร์ดใหม่" — ฝั่งสร้างเรียก seedChecklistOnCreate */
export const PRESET_AUTO_NEW = "auto_new";
export const isAutoNewPreset = (metadata: unknown) => (metadata as Record<string, unknown> | null)?.[PRESET_AUTO_NEW] === true;

/** "เสร็จ" ในตาราง = resolved (check constraint: open/in_progress/resolved/ignored/archived) */
export const isTaskDone = (status: string | null | undefined) => status === "resolved";

/** ข้อความที่พิมพ์/วาง → ลิงก์ที่ใช้ได้ (http/https เท่านั้น · ไม่มี http นำหน้าแต่หน้าตาเป็นชื่อเว็บ = เติม https:// ให้) · ไม่ใช่ลิงก์ = null */
export function parseTaskLinkUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > 1000 || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s) ? `https://${s}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

/** ทำความสะอาดรายการลิงก์ (ใช้ทั้งตอนรับเข้า API และตอนอ่านออกมาโชว์): ลิงก์ไม่ถูกต้องทิ้ง · ซ้ำทิ้ง · สูงสุด MAX_TASK_LINKS */
export function normalizeTaskLinks(raw: unknown): TaskLink[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskLink[] = [];
  for (const x of raw) {
    const r = (typeof x === "string" ? { url: x } : x) as { url?: unknown; label?: unknown } | null;
    const url = typeof r?.url === "string" ? parseTaskLinkUrl(r.url) : null;
    if (!url || out.some((l) => l.url === url)) continue;
    const label = typeof r?.label === "string" ? r.label.trim().slice(0, MAX_LINK_LABEL) : "";
    out.push(label ? { url, label } : { url });
    if (out.length >= MAX_TASK_LINKS) break;
  }
  return out;
}

/** ลิงก์ของข้อ จาก erp_record_tasks.metadata */
export const linksOf = (metadata: unknown): TaskLink[] => normalizeTaskLinks((metadata as { links?: unknown } | null)?.links);

/** "shopee.co.th" — ชื่อเว็บของลิงก์ (ตัด www.) */
export function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
/** ชื่อที่โชว์ของลิงก์ = ชื่อกำกับ หรือชื่อเว็บ */
export const linkLabel = (l: TaskLink) => l.label?.trim() || linkHost(l.url);

export function summarizeTasks(items: { id?: string; title: string; status: string; assigned_to?: string | null; assigned_name?: string | null; links?: TaskLink[] }[]): ChecklistSummary {
  const open = items.filter((t) => !isTaskDone(t.status));
  return {
    open: open.map((t) => t.title),
    who: open.map((t) => t.assigned_name ?? null),
    ...(open.every((t) => t.id) ? { ids: open.map((t) => t.id!), aids: open.map((t) => t.assigned_to ?? null) } : {}),
    ...(open.some((t) => t.links?.length) ? { links: open.map((t) => t.links ?? []) } : {}),
    done: items.filter((t) => isTaskDone(t.status)).length,
  };
}

/** สรุป → เสร็จกี่ข้อจากทั้งหมด (ป้าย "2/4" บนการ์ด) · allDone = มีข้อและเสร็จครบ */
export function checklistProgress(s: ChecklistSummary | null | undefined): { done: number; total: number; allDone: boolean } {
  const done = s?.done ?? 0;
  const total = done + (s?.open.length ?? 0);
  return { done, total, allDone: total > 0 && done === total };
}

/** แม่แบบเช็กลิสต์ = ค่ากลาง erp_lookups (ชนิด templateType) · name = ชื่อแม่แบบ · metadata.items = ข้อในแม่แบบ */
export const TEMPLATE_MAX_ITEMS = 30;
/** อ่านข้อในแม่แบบ — ตัดว่าง/ซ้ำ · ยาวสุด 300 ตัวอักษร · สูงสุด TEMPLATE_MAX_ITEMS ข้อ */
export function templateItems(metadata: unknown): string[] {
  const raw = (metadata as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const t = typeof v === "string" ? v.trim().slice(0, 300) : "";
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= TEMPLATE_MAX_ITEMS) break;
  }
  return out;
}
const sameTitle = (a: string) => a.trim().replace(/\s+/g, " ").toLowerCase();
/** ข้อในแม่แบบที่ยังไม่มีในเช็กลิสต์ (เทียบชื่อแบบไม่สนช่องว่าง/ตัวพิมพ์) — กดใช้แม่แบบซ้ำไม่เพิ่มข้อซ้ำ */
export function templateTitlesToAdd(existing: string[], items: string[]): string[] {
  const have = new Set(existing.map(sameTitle));
  const out: string[] = [];
  for (const t of items) { const k = sameTitle(t); if (k && !have.has(k)) { have.add(k); out.push(t.trim()); } }
  return out;
}

/** "รอหาผ้า · ฝน" — ข้อความ + ชื่อผู้รับผิดชอบ (ถ้ามี) */
export const taskWithWho = (title: string, who: string | null | undefined, sep = " · ") => (who ? `${title}${sep}${who}` : title);

/** "ซื้อของ - ของเล่น, ผ้าสีครีม" — ข้อความข้อ + ชื่อกำกับของลิงก์ (ลิงก์ไม่มีชื่อกำกับ = ไม่ต่อท้าย)
 *  ใช้ในที่แคบที่ไม่ได้โชว์รายการลิงก์เต็ม: แถวบนการ์ด · ปุ่ม Discord · อีเมล */
export function taskTitleWithLinks(title: string, links?: TaskLink[] | null): string {
  const names = [...new Set((links ?? []).map((l) => l.label?.trim() ?? "").filter(Boolean))];
  return names.length ? `${title} - ${names.join(", ")}` : title;
}
