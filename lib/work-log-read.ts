/**
 * 📝 ใบจดผลงาน — กติกากลาง (ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์ ไม่มี I/O)
 *   • อ่าน QR บนใบ (lib/work-log-sheet.ts เป็นคนเขียน)
 *   • จับคู่ชื่อลายมือกับรายชื่อพนักงาน
 *   • คิดนาทีทำงาน (หักพักเที่ยง) · เดาปีจาก วว/ดด
 *   • ตรวจบรรทัด: เหลือง = เตือน (ยังบันทึกได้) · แดง = ผิด (ต้องแก้ก่อนบันทึก)
 *   ตาราง: work_log_sheets / work_log_entries (supabase/migrations/202611150300_work_logs.sql)
 */

// ── QR ────────────────────────────────────────────────────────────────────────────────
export type WorkLogQr = { moId: string; page: number; total: number; linesPerStep: number; stepPrefixes: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "WL1|<mo_id>|1/2|3|abcd1234.ef567890" → โครง · อ่านไม่ออก = null */
export function parseWorkLogQr(text: string | null | undefined): WorkLogQr | null {
  const parts = String(text ?? "").trim().split("|");
  if (parts.length < 4 || parts[0] !== "WL1" || !UUID_RE.test(parts[1])) return null;
  const pm = /^(\d{1,3})\/(\d{1,3})$/.exec(parts[2]);
  const lines = Number(parts[3]);
  if (!pm || !Number.isInteger(lines) || lines < 1 || lines > 6) return null;
  const page = Number(pm[1]), total = Number(pm[2]);
  if (page < 1 || page > total) return null;
  const stepPrefixes = (parts[4] ?? "").split(".").map((s) => s.trim().toLowerCase()).filter((s) => /^[0-9a-f]{8}$/.test(s));
  return { moId: parts[1].toLowerCase(), page, total, linesPerStep: lines, stepPrefixes };
}

/** ขั้นตอนตาม QR — หาจากรหัสย่อ 8 ตัว (รวมขั้นตอนที่ถูกปิดไปแล้ว เพราะแก้สูตร = สร้างแถวใหม่ id ใหม่) */
export function stepsForQr<T extends { id: string }>(qr: WorkLogQr, steps: T[]): (T | null)[] {
  return qr.stepPrefixes.map((p) => steps.find((s) => s.id.replace(/-/g, "").toLowerCase().startsWith(p)) ?? null);
}

// ── บรรทัดบนใบ ───────────────────────────────────────────────────────────────────────
/** 1 บรรทัดที่หน้าตรวจแสดง/แก้ (ค่าจาก AI แล้วคนแก้ทับได้) */
export type WorkLogRow = {
  line_key: string;                 // "p1:S01#2" (ขั้นตอนจากสูตร) · "p1:x3" (ขั้นตอนเพิ่ม)
  kind: "step" | "extra";
  step_id: string | null;
  step_code: string | null;
  step_name: string;
  name_written: string;
  employee_id: string | null;
  work_date: string | null;          // YYYY-MM-DD
  start_time: string | null;         // HH:MM
  end_time: string | null;
  qty_done: number | null;
  qty_waste: number | null;
  step_done: boolean;
  note: string;
  unsure: string[];                  // ช่องที่ AI ไม่แน่ใจ (ชื่อฟิลด์)
  include: boolean;                  // ติ๊กออก = ไม่บันทึกบรรทัดนี้
};

export const lineKeyStep = (page: number, code: string, line: number) => `p${page}:${code}#${line}`;
export const lineKeyExtra = (page: number, n: number) => `p${page}:x${n}`;

// ── ชื่อพนักงาน ─────────────────────────────────────────────────────────────────────
export type WorkLogEmployee = { id: string; nickname: string | null; first_name: string | null; last_name: string | null; code: string | null };

const TITLE_RE = /^(คุณ|พี่|น้อง|นาย|นาง|นางสาว|น\.ส\.|ป้า|ลุง|น้า|อา)\s*/;
export const normName = (s: string | null | undefined) => String(s ?? "").normalize("NFC").trim().replace(TITLE_RE, "").replace(/[\s.·\-_]/g, "").toLowerCase();

/** ป้ายที่ส่งให้ AI เลือก และโชว์บนจอ — "น้อย (สมใจ ใจดี)" */
export const employeeLabel = (e: WorkLogEmployee) => {
  const full = [e.first_name, e.last_name].filter(Boolean).join(" ");
  return e.nickname ? (full ? `${e.nickname} (${full})` : e.nickname) : full || e.code || e.id.slice(0, 8);
};

/** ระยะแก้คำ (Levenshtein) — ใช้กับชื่อสั้น ๆ เท่านั้น */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

export type NameMatch = { employee_id: string | null; sure: boolean; candidates: string[] };

/**
 * ชื่อที่เขียน (หรือป้ายที่ AI เลือก) → พนักงาน
 *   ตรงป้ายเต็ม / ชื่อเล่น / ชื่อจริง คนเดียว = แน่ใจ · ใกล้เคียงหลายคน = ไม่แน่ใจ (ให้คนเลือก)
 */
export function matchEmployee(written: string | null | undefined, employees: WorkLogEmployee[], aiLabel?: string | null): NameMatch {
  const byLabel = aiLabel ? employees.filter((e) => employeeLabel(e) === aiLabel) : [];
  const w = normName(written);
  if (!w) return byLabel.length === 1 ? { employee_id: byLabel[0].id, sure: false, candidates: [byLabel[0].id] } : { employee_id: null, sure: false, candidates: [] };
  const exact = employees.filter((e) => normName(e.nickname) === w || normName(e.first_name) === w);
  if (exact.length === 1) return { employee_id: exact[0].id, sure: true, candidates: [exact[0].id] };
  if (exact.length > 1) {
    const pick = byLabel.find((b) => exact.some((e) => e.id === b.id));
    return { employee_id: pick?.id ?? null, sure: false, candidates: exact.map((e) => e.id) };
  }
  const near = employees
    .map((e) => ({ e, d: Math.min(...[e.nickname, e.first_name].map(normName).filter(Boolean).map((n) => (n.startsWith(w) || w.startsWith(n) ? 1 : editDistance(n, w)))) }))
    .filter((x) => x.d <= (w.length <= 3 ? 1 : 2))
    .sort((a, b) => a.d - b.d);
  if (byLabel.length === 1 && near.some((x) => x.e.id === byLabel[0].id)) return { employee_id: byLabel[0].id, sure: false, candidates: near.map((x) => x.e.id) };
  if (near.length === 1) return { employee_id: near[0].e.id, sure: false, candidates: [near[0].e.id] };
  return { employee_id: null, sure: false, candidates: near.map((x) => x.e.id) };
}

// ── เวลา / วันที่ ───────────────────────────────────────────────────────────────────
/** "13:5" / "1305" / "13.05" → "13:05" · ผิด = null */
export function normTime(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/[.\s]/g, ":");
  const m = /^(\d{1,2}):?(\d{2})$/.exec(s) ?? /^(\d{1,2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] ?? 0);
  return h <= 23 && mi <= 59 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : null;
}
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** พักเที่ยงที่หักให้อัตโนมัติ */
export const WORK_LOG_BREAKS: [string, string][] = [["12:00", "13:00"]];

/** นาทีทำงานจริง = เลิก − เริ่ม − ช่วงพักที่ทับ · ข้อมูลไม่ครบ/เลิกก่อนเริ่ม = null */
export function workMinutes(start: string | null, end: string | null, breaks = WORK_LOG_BREAKS): number | null {
  if (!start || !end) return null;
  const s = toMin(start), e = toMin(end);
  if (e <= s) return null;
  let m = e - s;
  for (const [bs, be] of breaks) m -= Math.max(0, Math.min(e, toMin(be)) - Math.max(s, toMin(bs)));
  return Math.max(0, m);
}

/** "05/11" (วว/ดด) → YYYY-MM-DD ปีปัจจุบัน · ถ้าเลยวันนี้ไปเกิน 1 วัน = ปีที่แล้ว (จดข้ามปีใหม่) */
export function dayMonthToIso(v: unknown, today: string): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\s*[/.\-]\s*(\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let y = Number(today.slice(0, 4));
  const iso = (yy: number) => `${yy}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = (yy: number) => { const t = new Date(`${iso(yy)}T00:00:00Z`); return t.getUTCDate() === d ? iso(yy) : null; };
  if (!check(y)) return null;
  const limit = new Date(`${today}T00:00:00Z`); limit.setUTCDate(limit.getUTCDate() + 1);
  if (new Date(`${iso(y)}T00:00:00Z`) > limit) y -= 1;
  return check(y);
}

/** วันนี้ตามเวลาไทย YYYY-MM-DD */
export const todayBangkok = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

// ── ตัวเลข ─────────────────────────────────────────────────────────────────────────
/** ตัวเลขจากลายมือ/AI → จำนวนเต็ม ≥0 · ว่าง/อ่านไม่ได้ = null */
export function normQty(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// ── ตรวจบรรทัด ──────────────────────────────────────────────────────────────────────
export type RowField = "step_name" | "employee_id" | "work_date" | "start_time" | "end_time" | "qty_done" | "qty_waste";
export type RowIssue = { field: RowField; level: "warn" | "error"; msg: string };

export function validateWorkLogRow(r: WorkLogRow, ctx: { moQty: number | null; today: string }): RowIssue[] {
  const out: RowIssue[] = [];
  if (!r.include) return out;
  if (!r.step_name.trim()) out.push({ field: "step_name", level: "error", msg: "ยังไม่มีชื่อขั้นตอน" });
  if (!r.employee_id) out.push({ field: "employee_id", level: "error", msg: r.name_written ? `จับคู่ "${r.name_written}" กับพนักงานไม่ได้ — เลือกเอง` : "ยังไม่ได้เลือกพนักงาน" });
  if (!r.work_date) out.push({ field: "work_date", level: "error", msg: "ยังไม่มีวันที่" });
  else if (r.work_date > ctx.today) out.push({ field: "work_date", level: "error", msg: "วันที่อยู่ในอนาคต" });
  if (!r.start_time) out.push({ field: "start_time", level: "warn", msg: "ไม่มีเวลาเริ่ม — คิดชิ้น/ชม. ไม่ได้" });
  if (!r.end_time) out.push({ field: "end_time", level: "warn", msg: "ไม่มีเวลาเลิก — คิดชิ้น/ชม. ไม่ได้" });
  if (r.start_time && r.end_time && workMinutes(r.start_time, r.end_time) === null) out.push({ field: "end_time", level: "error", msg: "เวลาเลิกต้องหลังเวลาเริ่ม" });
  if (r.qty_done === null) out.push({ field: "qty_done", level: "warn", msg: "ไม่มีจำนวนที่ทำได้" });
  else if (ctx.moQty && r.qty_done > ctx.moQty) out.push({ field: "qty_done", level: "error", msg: `ทำได้ ${r.qty_done} เกินจำนวนสั่ง ${ctx.moQty}` });
  if (r.qty_waste !== null && r.qty_done !== null && r.qty_waste > r.qty_done && r.qty_done > 0) out.push({ field: "qty_waste", level: "warn", msg: "ของเสียมากกว่าที่ทำได้ — ตรวจอีกครั้ง" });
  for (const f of r.unsure) {
    const field = (f === "name" ? "employee_id" : f === "date" ? "work_date" : f === "start" ? "start_time" : f === "end" ? "end_time" : f === "done" ? "qty_done" : f === "waste" ? "qty_waste" : null) as RowField | null;
    if (field && !out.some((x) => x.field === field)) out.push({ field, level: "warn", msg: "AI ไม่แน่ใจ — เทียบกับรูป" });
  }
  return out;
}

/** มีบรรทัดไหนผิดจนบันทึกไม่ได้ไหม */
export const rowsBlocking = (rows: WorkLogRow[], ctx: { moQty: number | null; today: string }) =>
  rows.some((r) => validateWorkLogRow(r, ctx).some((i) => i.level === "error"));
