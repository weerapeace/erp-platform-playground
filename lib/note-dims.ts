/**
 * 📝 อ่านโน้ตขนาดชิ้นวัสดุ (ลายมือช่าง) → บรรทัดตีราคา (ไม่มีหน้าจอ) — เจ้าของขอ 2026-11-16
 *   ช่างจดเป็นกลุ่ม ๆ เช่น "PU ชิ้น 1" แล้วไล่ "10.5x2.4 x2" (กว้าง × ยาว × จำนวนชิ้น) · บรรทัดที่ไม่ใช่ขนาด ("ช่องซิปกระเป๋า") = ชื่อของชิ้นถัดไป
 *
 *   NOTE_DIMS_SYSTEM / NOTE_DIMS_ASK — คำสั่งให้ AI อ่านรูป (ตอบ JSON) · ใช้ที่ POST /api/design-sheets/read-note
 *   parseNoteDims   — คำตอบ AI → แถวที่ตรวจแล้ว (ตัดค่าเพี้ยน · จำกัดจำนวน) · ใช้ทั้งเซิร์ฟเวอร์และหน้าจอ
 *   guessNoteItem   — เดาวัตถุดิบจากชื่อกลุ่ม เทียบทะเบียนวัสดุตีราคา (ผู้ใช้ต้องยืนยันเอง)
 *   matchNoteName   — ชื่อชิ้นตรง/คล้ายวัสดุในทะเบียน → ใส่ให้ (ตรง = เลย · คล้าย = ป้าย AI เดา) · sameNoteName = ชื่อซ้ำ
 *   costLineFromNote — แถว + วัตถุดิบ → บรรทัดตีราคา (สูตรเดียวกับเพิ่มเอง: lib/design-sheet-cost-row)
 * ใช้ที่: components/design-sheet-detail/note-dims-modal.tsx (หน้าคอม + มือถือ)
 */
import { costLineFromItem, recomputeCostLine, type CostItemLike } from "@/lib/design-sheet-cost-row";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";

export type NoteDimRow = { group: string; name: string; w: number | null; h: number | null; qty: number; unsure: boolean };
export type NoteDims = { rows: NoteDimRow[]; groups: string[]; notes: string };

export const NOTE_DIMS_MAX_ROWS = 80;

export const NOTE_DIMS_SYSTEM = `คุณอ่านโน้ตลายมือของช่างทำกระเป๋า ที่จดขนาดชิ้นวัสดุ (หน่วยเซนติเมตร) ตอบเป็น JSON อย่างเดียว
รูปแบบโน้ตที่พบบ่อย:
- หัวกลุ่ม เช่น "PU ชิ้น 1", "P.U ชิ้น 2", "ผ้าซับใน" = ชื่อวัสดุ/กลุ่ม ของบรรทัดที่อยู่ใต้หัวนั้น (มักแบ่งเป็นคอลัมน์)
- บรรทัดขนาด เช่น "10.5x2.4 x2" = กว้าง 10.5 × ยาว 2.4 จำนวน 2 ชิ้น · "9x6.5" = 1 ชิ้น · "13x9.5x2" = กว้าง 13 ยาว 9.5 จำนวน 2
- บรรทัดที่เป็นคำ ไม่มีตัวเลขขนาด เช่น "ช่องซิปกระเป๋า" = ชื่อของชิ้นในบรรทัดขนาดถัดไป (ไม่ใช่ชิ้นแยก)
- ตัวเลขที่ตามหลังคำ เช่น "ไหมพรม 15" ให้ใส่เป็น name พร้อม w = ตัวเลขนั้น h = null
อ่านทุกคอลัมน์ ตามลำดับบนลงล่าง ซ้ายไปขวา ห้ามแต่งตัวเลขเอง ถ้าอ่านไม่ชัดให้ใส่ค่าที่น่าจะเป็นที่สุดแล้วตั้ง unsure = true`;

export const NOTE_DIMS_ASK = `อ่านโน้ตในรูป แล้วตอบ JSON:
{"rows":[{"group":"PU ชิ้น 1","name":"","w":10.5,"h":2.4,"qty":2,"unsure":false}],"notes":"สิ่งที่อ่านไม่ออก/ข้อสังเกต สั้น ๆ ภาษาไทย"}
group = หัวกลุ่มที่บรรทัดนั้นอยู่ (ไม่มีหัว = "") · name = ชื่อชิ้นจากบรรทัดคำก่อนหน้า (ไม่มี = "") · qty ไม่ระบุ = 1`;

const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** คำตอบ AI (object ที่ parse แล้ว หรือข้อความ JSON) → แถวที่ใช้ได้ · แถวที่ไม่มีทั้งชื่อและขนาด = ทิ้ง */
export function parseNoteDims(raw: unknown): NoteDims {
  let d: unknown = raw;
  if (typeof raw === "string") {
    const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
    try { d = JSON.parse(i >= 0 && j > i ? raw.slice(i, j + 1) : raw); } catch { d = null; }
  }
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const list = Array.isArray(o.rows) ? o.rows : [];
  const rows: NoteDimRow[] = [];
  for (const item of list) {
    if (rows.length >= NOTE_DIMS_MAX_ROWS) break;
    const p = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const w = numOrNull(p.w), h = numOrNull(p.h), name = text(p.name, 60);
    if (w == null && h == null && !name) continue;
    const q = Math.round(Number(p.qty));
    rows.push({ group: text(p.group, 40), name, w, h, qty: q >= 1 && q <= 999 ? q : 1, unsure: p.unsure === true || (w == null || h == null) });
  }
  const groups: string[] = [];
  for (const r of rows) if (!groups.includes(r.group)) groups.push(r.group);
  return { rows, groups, notes: text(o.notes, 300) };
}

/** ตัดคำ/สัญลักษณ์ที่ไม่ช่วยเทียบ ("ชิ้น 1", จุด, ตัวเลข) → คำหลักตัวเล็ก */
const keyWords = (s: string) => s.toLowerCase().replace(/ชิ้น(ที่)?\s*\d*/g, " ").replace(/[.\-_/()]/g, "").replace(/\d+/g, " ").split(/\s+/).filter((w) => w.length >= 2);

/**
 * เดาวัตถุดิบของกลุ่ม: คำหลักของชื่อกลุ่มทุกคำต้องอยู่ในชื่อวัสดุ (หรือชื่อชนิดวัสดุ) — เจอหลายตัวเลือกตัวที่ชื่อสั้นสุด (ตรงสุด)
 * ไม่เจอ / ชื่อกลุ่มว่าง = null (ให้ผู้ใช้เลือกเอง)
 */
export function guessNoteItem<T extends { id: string; name: string; group_name?: string | null }>(group: string, items: readonly T[]): T | null {
  const keys = keyWords(group);
  if (!keys.length) return null;
  let best: T | null = null;
  for (const it of items) {
    const hay = `${it.name} ${it.group_name ?? ""}`.toLowerCase().replace(/[.\-_/()]/g, "");
    if (keys.every((k) => hay.includes(k)) && (!best || it.name.length < best.name.length)) best = it;
  }
  return best;
}

/** ชื่อเทียบแบบหลวม: ตัวเล็ก ตัดช่องว่าง/จุด/ขีด */
const normName = (s: string) => s.toLowerCase().replace(/[\s.\-_/()]/g, "");
/** คู่ตัวอักษรติดกัน (ไว้วัดความคล้ายของคำไทยที่ไม่มีช่องว่าง) */
const bigrams = (s: string) => { const out: string[] = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
function similarity(a: string, b: string): number {
  const x = bigrams(a), y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const pool = [...y]; let hit = 0;
  for (const g of x) { const k = pool.indexOf(g); if (k >= 0) { hit++; pool.splice(k, 1); } }
  return (2 * hit) / (x.length + y.length);
}
const numsOf = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));

/**
 * จับคู่ชื่อชิ้น (บรรทัดคำในโน้ต เช่น "โฟมดำ 1.5") กับวัสดุในทะเบียน
 *   "match" = ชื่อตรงกัน (ไม่สนช่องว่าง/จุด/ตัวเล็กใหญ่) → ใส่ให้เลย
 *   "guess" = ชื่อคล้าย (คำหลักครบ หรือคล้ายกัน ≥ 55%) → ใส่ให้แต่ติดป้าย "AI เดา" ให้ตรวจ · ตัวเลขในชื่อ (ความหนา) ต้องตรงกันด้วย
 *   null = ไม่มีตัวที่ใกล้พอ
 */
export function matchNoteName<T extends { id: string; name: string; group_name?: string | null }>(name: string, items: readonly T[]): { item: T; kind: "match" | "guess" } | null {
  const n = normName(name);
  if (n.length < 2) return null;
  const exact = items.find((it) => normName(it.name) === n);
  if (exact) return { item: exact, kind: "match" };
  const nums = numsOf(name);
  const okNums = (it: T) => nums.every((x) => numsOf(it.name).includes(x));
  const kw = guessNoteItem(name, items.filter(okNums));
  if (kw) return { item: kw, kind: "guess" };
  let best: T | null = null, score = 0;
  for (const it of items) {
    if (!okNums(it)) continue;
    const sc = similarity(n, normName(it.name));
    if (sc > score) { score = sc; best = it; }
  }
  return best && score >= 0.55 ? { item: best, kind: "guess" } : null;
}

/** ชื่อชิ้นเดียวกันไหม (ไว้ให้บรรทัดชื่อซ้ำได้วัสดุตาม) */
export const sameNoteName = (a: string, b: string) => !!normName(a) && normName(a) === normName(b);

/** บรรทัดตีราคาว่าง (ยังไม่เลือกวัตถุดิบ) — ช่องเดียวกับปุ่ม "เพิ่มวัตถุดิบ" */
function blankLine(idx: number): CostLine {
  return {
    item_id: null, item_name: null, group_name: null, calc_method: null,
    width_cm: null, length_cm: null, pieces: null, face_width_cm: null,
    waste_percent: null, divisor: null, qty: null, uom: null,
    unit_price: null, amount: null, note: null, sort_order: idx + 1,
  };
}

/** แถวโน้ต + วัตถุดิบ (ไม่เลือก = null) → บรรทัดตีราคา · ชื่อชิ้นไปอยู่ "หมายเหตุ" · คิดปริมาณ/ยอดด้วยสูตรกลาง */
export function costLineFromNote(r: Pick<NoteDimRow, "name" | "w" | "h" | "qty">, item: CostItemLike | null, idx: number, parentCode: string | null): CostLine {
  const base = item ? (costLineFromItem(item, idx) as unknown as CostLine) : blankLine(idx);
  return recomputeCostLine({ ...base, parent_code: parentCode, width_cm: r.w, length_cm: r.h, pieces: r.qty, note: r.name || null });
}
