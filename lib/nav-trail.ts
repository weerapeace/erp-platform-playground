// ============================================================
// ทางเดินหน้า (ของกลาง) — จำว่าแท็บนี้เปิดหน้าไหนมาบ้าง เพื่อให้ปุ่ม "ย้อนกลับ" (components/back-button) พากลับหน้าที่เข้ามาได้ถูก
//  - เก็บใน sessionStorage (ต่อแท็บ · ปิดแท็บแล้วหาย) สูงสุด 30 หน้า · หน้าเดิมซ้ำ (แค่ query เปลี่ยน) = แทนที่ ไม่ต่อท้าย
//  - ใช้แทน history.back() ตรง ๆ เพราะหน้าที่ออกไปเว็บนอกแล้วกลับมา (เช่น เชื่อม Facebook/Lazada) back จะพากลับไปหน้าเว็บนอก
//  - ผู้บันทึก = components/nav-trail-recorder (วางใน app/layout ครั้งเดียว ทุกหน้าได้)
// ============================================================

const KEY = "erp.navTrail.v1";
const MAX = 30;

export type TrailEntry = { path: string; search: string };

export function readTrail(): TrailEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as TrailEntry[]).filter((e) => e && typeof e.path === "string") : [];
  } catch { return []; }
}

function writeTrail(t: TrailEntry[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(t.slice(-MAX))); } catch { /* โหมดส่วนตัว/ที่เก็บเต็ม — ปุ่มย้อนกลับจะใช้ทางสำรองแทน */ }
}

/** บันทึกว่าเปิดหน้านี้ (เรียกทุกครั้งที่ path เปลี่ยน) */
export function recordVisit(path: string, search: string): void {
  const t = readTrail();
  const last = t[t.length - 1];
  if (last && last.path === path) t[t.length - 1] = { path, search };   // หน้าเดิม (เช่น กลับจาก OAuth / เปลี่ยน query) — ไม่นับเป็นก้าวใหม่
  else t.push({ path, search });
  writeTrail(t);
}

/** หน้าก่อนหน้าที่ไม่ใช่หน้านี้ (ไล่จากท้าย) — null = ไม่มีประวัติในแท็บนี้ */
export function previousEntry(currentPath: string): { entry: TrailEntry; index: number } | null {
  const t = readTrail();
  for (let i = t.length - 1; i >= 0; i--) if (t[i].path !== currentPath) return { entry: t[i], index: i };
  return null;
}

/** ตัดทางเดินให้จบที่หน้าปลายทาง (กดย้อนกลับแล้วไม่วนกลับมาหน้าเดิม) */
export function truncateTrail(index: number): void {
  writeTrail(readTrail().slice(0, index + 1));
}
