/**
 * จ่ายงานเหมาแบบตาราง — กติกากลาง (ใช้ทั้งหน้าต่าง "จ่ายงานเหมา" บนบอร์ด และ API /api/mo/piecework/batch)
 *   1 แถว = งานเหมา 1 อย่าง × คน 1 คน ของใบสั่งผลิต 1 ใบ · งานเดียวแบ่งหลายคน = หลายแถว
 *   "ต้องจ่าย" ของงาน = ชิ้นต่อใบ × จำนวนสั่ง · นับที่จ่ายไปแล้ว (แถวเดิมที่ยังไม่ยกเลิก) รวมด้วย → กันจ่ายซ้ำ
 *   ค่าเหมาที่ได้จริง = ราคา × ชิ้นที่รับคืน (done_qty) — ไม่ได้ใส่ = เท่าที่จ่าย
 */

export type PwLine = {
  key: string;
  mo_no: string;
  job_id: string | null;
  job_name: string;
  rate: number;
  /** ชิ้นต่อสินค้า 1 ใบ (เหมือนกันทุกแถวของงานเดียวกันในใบนั้น) */
  qty_per: number;
  /** ชิ้นที่จ่ายให้คนนี้ */
  qty: number;
  assignee_id: string | null;
  assignee_name: string;
  /** แถวนี้มาจากงานเหมาใน BOM (ตั้งต้นให้) */
  from_bom?: boolean;
};

/** งานเหมาที่จ่ายไปแล้ว (mo_piecework ที่ยังไม่ยกเลิก) — ใช้นับกันจ่ายซ้ำ */
export type PwExisting = {
  id: string; mo_no: string; job_id: string | null; job_name: string;
  total_qty: number; assignee_name: string | null; status: string; done_qty?: number | null;
};

export const pwJobKey = (jobId: string | null, name: string) => (jobId ? `id:${jobId}` : `nm:${name.trim().toLowerCase()}`);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type PwJobState = {
  key: string; job_name: string;
  need: number;          // ต้องจ่ายทั้งหมด (ชิ้นต่อใบ × จำนวนสั่ง)
  before: number;        // จ่ายไปแล้วก่อนหน้า
  now: number;           // จ่ายรอบนี้
  left: number;          // ยังไม่จ่าย (ติดลบ = เกิน)
  beforeWho: { name: string; qty: number }[];
};

/** สถานะต่องานของใบสั่งผลิต 1 ใบ: ต้องจ่าย / จ่ายแล้ว / รอบนี้ / เหลือ */
export function pwJobStates(moQty: number, lines: PwLine[], existing: PwExisting[]): PwJobState[] {
  const out = new Map<string, PwJobState>();
  const get = (jobId: string | null, name: string) => {
    const k = pwJobKey(jobId, name);
    let s = out.get(k);
    if (!s) { s = { key: k, job_name: name, need: 0, before: 0, now: 0, left: 0, beforeWho: [] }; out.set(k, s); }
    return s;
  };
  for (const l of lines) {
    const s = get(l.job_id, l.job_name);
    s.need = r2((Number(l.qty_per) || 0) * moQty);
    s.now = r2(s.now + (Number(l.qty) || 0));
  }
  for (const e of existing) {
    const s = get(e.job_id, e.job_name);
    // รับคืนแล้วแต่ไม่ครบ = นับเท่าที่ทำจริง (ที่เหลือแยกเป็นแถวใหม่ หรือไม่ทำแล้ว)
    const q = e.status === "done" && e.done_qty != null ? Number(e.done_qty) : Number(e.total_qty) || 0;
    s.before = r2(s.before + q);
    if (e.assignee_name) s.beforeWho.push({ name: e.assignee_name, qty: q });
  }
  for (const s of out.values()) s.left = r2(s.need - s.before - s.now);
  return [...out.values()];
}

export type PwIssue = { key: string; msg: string };

/** ตรวจก่อนบันทึก — ว่าง = บันทึกได้ */
export function pwValidate(lines: PwLine[]): PwIssue[] {
  const out: PwIssue[] = [];
  for (const l of lines) {
    if (!l.job_name.trim()) out.push({ key: l.key, msg: "เลือกงานเหมาก่อน" });
    else if (!l.assignee_name.trim()) out.push({ key: l.key, msg: `${l.job_name}: เลือกคนรับก่อน` });
    else if (!(Number(l.qty) > 0)) out.push({ key: l.key, msg: `${l.job_name} (${l.assignee_name}): ใส่จำนวนชิ้น` });
    else if (Number(l.rate) < 0) out.push({ key: l.key, msg: `${l.job_name}: ราคาติดลบไม่ได้` });
  }
  return out;
}

/** แถวเดียวกันซ้ำในรอบนี้ (งานเดียวกัน ใบเดียวกัน คนเดียวกัน) — ควรรวมเป็นแถวเดียว */
export function pwDupLines(lines: PwLine[]): string[] {
  const seen = new Map<string, string>(), dup: string[] = [];
  for (const l of lines) {
    if (!l.assignee_name.trim()) continue;
    const k = `${l.mo_no}|${pwJobKey(l.job_id, l.job_name)}|${(l.assignee_id ?? l.assignee_name).trim().toLowerCase()}`;
    if (seen.has(k)) dup.push(l.key); else seen.set(k, l.key);
  }
  return dup;
}

/** รวมเงินต่อคน (แถวที่ยังไม่เลือกคน ไม่นับ) */
export function pwPersonTotals(lines: PwLine[]): { name: string; qty: number; money: number; rows: number }[] {
  const m = new Map<string, { name: string; qty: number; money: number; rows: number }>();
  for (const l of lines) {
    const name = l.assignee_name.trim(); if (!name) continue;
    const p = m.get(name) ?? { name, qty: 0, money: 0, rows: 0 };
    p.qty = r2(p.qty + (Number(l.qty) || 0)); p.money = r2(p.money + (Number(l.qty) || 0) * (Number(l.rate) || 0)); p.rows++;
    m.set(name, p);
  }
  return [...m.values()].sort((a, b) => b.money - a.money);
}

/** แถวใหม่ของงานที่ยังเหลือ (กด "+ คนอื่น") — จำนวนตั้งต้น = ที่ยังไม่จ่าย */
export function pwRestLine(src: PwLine, left: number, key: string): PwLine {
  return { ...src, key, qty: Math.max(0, r2(left)), assignee_id: null, assignee_name: "", from_bom: false };
}

/** ค่าเหมาที่ได้จริงของแถว (สรุปค่าแรงรายเดือน) — รับคืนไม่ครบ = คิดเท่าที่รับคืน */
export const pwEarned = (r: { rate: number | null; total_qty: number | null; done_qty?: number | null }) =>
  r2((Number(r.rate) || 0) * (r.done_qty != null ? Number(r.done_qty) : Number(r.total_qty) || 0));

/** รับคืนไม่ครบ: ที่เหลือยังให้คนเดิมทำต่อ (keep → แถวใหม่) หรือไม่ทำแล้ว (drop) */
export type PwDoneItem = { id: string; qty: number; rest: "keep" | "drop" };
export function pwDonePlan(row: { total_qty: number }, item: PwDoneItem): { done_qty: number; rest_qty: number } {
  const total = Number(row.total_qty) || 0;
  const done = Math.max(0, Math.min(total, r2(Number(item.qty) || 0)));
  return { done_qty: done, rest_qty: item.rest === "keep" ? r2(total - done) : 0 };
}
