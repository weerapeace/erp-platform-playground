/**
 * 🛠 โหมดทำงาน (หน้า SKU การตลาด) — type + กฎกลางที่ใช้ร่วมกันระหว่างหน้าจอกับ API
 * (ไฟล์ pure ห้ามใส่ "use client" — API route import ได้)
 *
 * แนวคิด: "งาน" 1 งาน = หลายรุ่น (Parent SKU) + ขั้นตอนชุดเดียวกัน (เช็กลิสต์) ติ๊กแยกทีละรุ่น
 *   - งาน Clearance: ใส่ส่วนลดต่อรุ่น (฿ หรือ %) → ราคาใหม่ "เก็บในงาน" ไม่แก้ราคาใน ERP
 *   - ใส่รุ่นเข้างาน → ติดป้ายหลักให้อัตโนมัติได้ (auto_label_id เช่น Clearance Products)
 *   - ผู้รับผิดชอบ (หลายคนได้) + วันครบกำหนด อยู่ระดับงาน
 *   - บางรุ่นไม่ต้องทำบางขั้นตอน → ตั้ง "ไม่ต้องทำ" รายรุ่น (step_skip) — ไม่นับในความคืบหน้า
 * ตาราง: marketing_work_jobs · marketing_work_job_items
 */

export type WorkJobKind = "clearance" | "website" | "custom";
export type WorkJobStatus = "open" | "done" | "archived";
export type DiscountUnit = "baht" | "percent";
export type WorkStep = { key: string; label: string };
export type StepDone = Record<string, { at: string; by: string | null }>;
/** ขั้นตอนที่ "ไม่ต้องทำ" ของรุ่นนี้ (เช่น ของแถมไม่ต้อง Photoshoot) — โครงเดียวกับ StepDone */
export type StepSkip = Record<string, { at: string; by: string | null }>;
/** ผู้รับผิดชอบงาน (ชื่อเก็บไว้ด้วย → โชว์ได้แม้คนนั้นปิดบัญชีภายหลัง) */
export type JobAssignee = { id: string; name: string };

export type WorkJob = {
  id: string;
  name: string;
  kind: WorkJobKind;
  steps: WorkStep[];
  auto_label_id: string | null;
  /** ผู้รับผิดชอบหลายคน (ตัวจริง) — assignee_id/assignee_name = คนแรก เก็บไว้ให้ของเก่าอ่านได้ */
  assignees: JobAssignee[];
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;         // YYYY-MM-DD
  status: WorkJobStatus;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  /** สรุป (คำนวณตอนโหลดรายการงาน) */
  item_count?: number;
  item_done?: number;
  step_done_count?: number;
};

export type WorkJobItem = {
  id: string;
  job_id: string;
  parent_sku_id: string;
  /** ข้อมูลรุ่น (อ่านอย่างเดียว ดึงมาโชว์) */
  code: string;
  name: string;
  image_key: string | null;
  brand_id: string | null;
  label_id: string | null;
  base_price_min: number | null;
  base_price_max: number | null;
  discount_value: number | null;
  discount_unit: DiscountUnit;
  step_done: StepDone;
  /** ขั้นตอนที่ไม่ต้องทำสำหรับรุ่นนี้ */
  step_skip: StepSkip;
  note: string | null;
  sort_order: number;
};

/** แบบงานตั้งต้น (ก้อนนี้ตั้งในโค้ด · ก้อนถัดไปทำหน้าตั้งค่าแบบงานเอง) */
export const JOB_KINDS: { kind: WorkJobKind; label: string; icon: string; defaultName: string; steps: string[]; hasPrice: boolean; autoLabel: RegExp | null }[] = [
  { kind: "clearance", label: "Clearance (ล้างสต็อก)", icon: "🏷️", defaultName: "Clearance", steps: ["ทำรูปป้ายลดราคา", "แก้ราคา Lazada", "แก้ราคา Shopee"], hasPrice: true, autoLabel: /clearance/i },
  { kind: "website", label: "ลงเว็บไซต์", icon: "🌐", defaultName: "ลงเว็บไซต์", steps: ["ถ่ายรูปใหม่", "เขียนรายละเอียด", "ขึ้นเว็บ"], hasPrice: false, autoLabel: null },
  { kind: "custom", label: "งานอื่น ๆ", icon: "🛠️", defaultName: "", steps: [], hasPrice: false, autoLabel: null },
];
export const kindInfo = (k: WorkJobKind) => JOB_KINDS.find((x) => x.kind === k) ?? JOB_KINDS[2];
export const isJobKind = (v: unknown): v is WorkJobKind => v === "clearance" || v === "website" || v === "custom";

export const MAX_STEPS = 20;
export const MAX_STEP_LABEL = 60;
export const MAX_JOB_NAME = 120;
export const MAX_ASSIGNEES = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ล้างรายชื่อผู้รับผิดชอบที่ส่งมา: เฉพาะ id ที่เป็น uuid · ไม่ซ้ำ · ชื่อไม่เกิน 120 ตัว · ไม่เกิน MAX_ASSIGNEES คน */
export function cleanAssignees(raw: unknown): JobAssignee[] {
  if (!Array.isArray(raw)) return [];
  const out: JobAssignee[] = [];
  for (const r of raw) {
    const id = String((r as { id?: unknown })?.id ?? "").trim();
    if (!UUID_RE.test(id) || out.some((x) => x.id === id)) continue;
    out.push({ id, name: String((r as { name?: unknown })?.name ?? "").trim().slice(0, 120) });
    if (out.length >= MAX_ASSIGNEES) break;
  }
  return out;
}

/** อ่านผู้รับผิดชอบจากแถวในฐานข้อมูล — งานเก่า (ก่อนมีหลายคน) ใช้ assignee_id/assignee_name เดิม */
export function assigneesOf(r: { assignees?: unknown; assignee_id?: unknown; assignee_name?: unknown }): JobAssignee[] {
  const list = cleanAssignees(r.assignees);
  if (list.length) return list;
  const id = typeof r.assignee_id === "string" ? r.assignee_id : "";
  return UUID_RE.test(id) ? [{ id, name: String(r.assignee_name ?? "").trim() }] : [];
}

/** ชื่อผู้รับผิดชอบสำหรับโชว์ เช่น "Mint, Toey" */
export const assigneeNames = (list: JobAssignee[]) => list.map((a) => a.name || "?").join(", ");
const STEP_KEY = /^[a-z0-9_-]{1,24}$/i;

/** คีย์ขั้นตอนถัดไป (s1, s2, …) — คีย์ไม่เปลี่ยนตอนแก้ชื่อ/ย้ายลำดับ → ที่ติ๊กไว้ไม่หาย */
export function nextStepKey(steps: WorkStep[]): string {
  let n = 0;
  for (const s of steps) { const m = /^s(\d+)$/.exec(s.key); if (m) n = Math.max(n, Number(m[1])); }
  return `s${n + 1}`;
}

/** สร้างชุดขั้นตอนจากชื่อ (ใช้ตอนสร้างงานจากแบบงาน) */
export function stepsFromLabels(labels: string[]): WorkStep[] {
  const out: WorkStep[] = [];
  for (const l of labels) {
    const label = l.trim().slice(0, MAX_STEP_LABEL);
    if (label && out.length < MAX_STEPS) out.push({ key: nextStepKey(out), label });
  }
  return out;
}

/** ตรวจ/ทำความสะอาดขั้นตอนที่ส่งมาจากหน้าจอ: ชื่อว่างทิ้ง · คีย์ซ้ำ/ผิดรูปแบบ = ออกคีย์ใหม่ · จำกัดจำนวน */
export function cleanSteps(raw: unknown): WorkStep[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkStep[] = [];
  const used = new Set<string>();
  for (const r of raw) {
    const label = String((typeof r === "string" ? r : (r as { label?: unknown })?.label) ?? "").trim().slice(0, MAX_STEP_LABEL);
    if (!label || out.length >= MAX_STEPS) continue;
    let key = typeof r === "object" && r ? String((r as { key?: unknown }).key ?? "") : "";
    if (!STEP_KEY.test(key) || used.has(key)) key = nextStepKey([...out, ...[...used].map((k) => ({ key: k, label: "" }))]);
    used.add(key);
    out.push({ key, label });
  }
  return out;
}

/** เงินไทย: ปัดสตางค์ 2 ตำแหน่ง (กันเลขทศนิยมเพี้ยน) */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** ราคาหลังลด · ไม่มีราคาเต็ม = null · ไม่ใส่ส่วนลด = ราคาเดิม */
export function discountedPrice(base: number | null, value: number | null, unit: DiscountUnit): number | null {
  if (base == null || !Number.isFinite(base)) return null;
  const v = value == null || !Number.isFinite(value) ? 0 : value;
  return round2(unit === "percent" ? base * (1 - v / 100) : base - v);
}

/** ส่วนลดใช้ได้ไหม: % ต้อง 0–100 · ฿ ต้องไม่เกินราคาเต็ม (ราคาเต็มสูงสุด ถ้ามีช่วง ใช้ตัวต่ำสุดตรวจ) · ติดลบไม่ได้ */
export function discountProblem(baseMin: number | null, value: number | null, unit: DiscountUnit): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) return "ส่วนลดต้องไม่ติดลบ";
  if (unit === "percent" && value > 100) return "ลดได้ไม่เกิน 100%";
  if (unit === "baht" && baseMin != null && value > baseMin) return "ลดเกินราคาเต็ม";
  return null;
}

/** ราคาใหม่เป็นช่วง (สีราคาต่างกัน) — คืน null ถ้ายังไม่มีราคาเต็ม */
export function newPriceRange(item: Pick<WorkJobItem, "base_price_min" | "base_price_max" | "discount_value" | "discount_unit">): { from: number; to: number } | null {
  const lo = item.base_price_min ?? item.base_price_max;
  const hi = item.base_price_max ?? item.base_price_min;
  const a = discountedPrice(lo, item.discount_value, item.discount_unit);
  const b = discountedPrice(hi, item.discount_value, item.discount_unit);
  if (a == null || b == null) return null;
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** ราคาเต็มตอนใส่เข้างาน: ราคาขายของสีที่ยังเปิด (ต่ำสุด–สูงสุด) → ไม่มีใช้ราคาระดับรุ่น → ไม่มีเลย = null */
export function snapshotBasePrice(childPrices: (number | null | undefined)[], parentPrice: number | null | undefined): { min: number | null; max: number | null } {
  const ps = childPrices.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ps.length) return { min: round2(Math.min(...ps)), max: round2(Math.max(...ps)) };
  const p = Number(parentPrice);
  if (Number.isFinite(p) && p > 0) return { min: round2(p), max: round2(p) };
  return { min: null, max: null };
}

/** ความคืบหน้าของรุ่น (นับเฉพาะขั้นตอนที่ยังอยู่ในงาน และ "ต้องทำ" สำหรับรุ่นนี้ — ลบขั้นตอน/ตั้งไม่ต้องทำ = ไม่นับ)
 *  ทุกขั้นตอนถูกตั้ง "ไม่ต้องทำ" = รุ่นนี้ไม่มีอะไรต้องทำ → นับว่าเสร็จ */
export function itemProgress(stepDone: StepDone, steps: WorkStep[], stepSkip?: StepSkip | null): { done: number; total: number; skipped: number; complete: boolean } {
  const need = steps.filter((s) => !stepSkip?.[s.key]);
  const done = need.filter((s) => !!stepDone?.[s.key]).length;
  return { done, total: need.length, skipped: steps.length - need.length, complete: steps.length > 0 && done === need.length };
}

/** ความคืบหน้าทั้งงาน (ขั้นตอนที่ "ไม่ต้องทำ" ไม่นับเป็นงาน) */
export function jobProgress(items: { step_done: StepDone; step_skip?: StepSkip | null }[], steps: WorkStep[]): { models: number; modelsDone: number; stepsDone: number; stepsTotal: number; pct: number } {
  let modelsDone = 0, stepsDone = 0, stepsTotal = 0;
  for (const it of items) {
    const p = itemProgress(it.step_done, steps, it.step_skip);
    stepsDone += p.done;
    stepsTotal += p.total;
    if (p.complete) modelsDone++;
  }
  return { models: items.length, modelsDone, stepsDone, stepsTotal, pct: stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : 0 };
}

/** วันที่วันนี้ตามเวลาเครื่อง (YYYY-MM-DD) — ไม่ใช้ toISOString (เวลาไทย UTC+7 ร่นวัน) */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** สถานะกำหนดส่ง: เลยกำหนด / วันนี้ / ใกล้ (≤3 วัน) / ปกติ */
export function dueState(due: string | null, today: string = localDateKey()): "overdue" | "today" | "soon" | "ok" | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  if (due < today) return "overdue";
  if (due === today) return "today";
  const diff = (Date.UTC(+due.slice(0, 4), +due.slice(5, 7) - 1, +due.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000;
  return diff <= 3 ? "soon" : "ok";
}

/** วันที่ไทยสั้น ๆ เช่น 31 ต.ค. */
export function shortThaiDate(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${Number(iso.slice(8, 10))} ${m[Number(iso.slice(5, 7)) - 1]}`;
}

export const fmtBaht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
