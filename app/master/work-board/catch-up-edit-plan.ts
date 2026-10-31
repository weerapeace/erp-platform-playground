/**
 * ✏️ ป๊อป "แก้ไข" ของโหมดอัปเดตงาน — กติกากลาง (ไม่มี React ทดสอบได้)
 *
 * แก้สิ่งที่บันทึกไปแล้ว รวมขั้นก่อนหน้าที่เคยข้าม: ติ๊กเตรียม/ตัด + วันที่ · ใบจ่าย (โต๊ะ/คน/จำนวน/ค่าแรงต่อชิ้น/วันจ่าย/หมายเหตุ/ยกเลิก)
 * · รอบส่งคืน (จำนวน/ค่าแรง/วันที่/ลบ) · ของบนชั้น QC (ย้อนกลับไปรอรับ) · ลดจำนวน (lib/mo-qty-reduce)
 * เทียบ "ก่อน → หลัง" → รายการแก้ (CeOp) เรียงตามลำดับที่ไม่ขัดกัน แล้วบันทึกทีละรายการผ่าน API เดิม (ติด via=cu_edit + label ลง audit)
 * ลำดับ: QC ย้อนกลับ → ลบรอบส่งคืน → แก้รอบส่งคืน → แก้ใบจ่าย → ยกเลิกใบจ่าย → เตรียม/ตัด → ป้ายของครบ → ลดจำนวน → หมายเหตุ
 * แก้ตามให้ทั้งชุด (ceApplyCascade): ลดใบจ่ายต่ำกว่ายอดที่ช่างคืนแล้ว (ลงผิด/ทำได้จริงแค่นั้น) → ลดรอบส่งคืน (รอบล่าสุดก่อน) + ย้อนของจากชั้น QC
 *   + ที่เหลือที่ไม่ได้ทำ: แยกใบใหม่ / ไม่ทำแล้ว (= ลดจำนวนสั่ง) / ค้างไว้ในใบนี้ (= จดหมายเหตุ) — เจ้าของอนุมัติ 2026-10-31
 * เจ้าของอนุมัติแบบ 2026-10-31 · ดู docs/work-board-catch-up.md
 */
import type { CatchUpSnapshot, CatchUpWo } from "@/app/api/mo/catch-up/route";
import { dateIssues, todayYmd } from "@/lib/work-entry-rules";
import { woRatePerPiece, roundWage } from "@/lib/wo-labor";
import { reduceQtyIssue, increaseQtyIssue, increaseIsBig, isIncreaseMode, shrinkWos, REDUCE_MODE_LABEL, type QtyChangeMode } from "@/lib/mo-qty-reduce";
import { cuDateText, cuQtyDir, cuReduceReason, stageOfDept, type CuApi, type CuIssue, type CuReduce } from "./catch-up";
import { crewFields, crewList, type CrewPerson } from "./crew-pick";

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString("th-TH");
const baht = (n: number | null) => (n == null ? "ยังไม่ลง" : `฿${fmt(n)}`);

/** ใบจ่าย 1 ใบในฟอร์ม · rate = ค่าแรง/ชิ้น (null = ยังไม่มีค่าแรง) */
export type CeWo = { id: string; deptId: string; crewIds: string[]; qty: number; rate: number | null; date: string | null; note: string; cancel: boolean };
/** รอบส่งคืน 1 รอบ · wage = ยอดของรอบ (ไม่ใช่ต่อชิ้น · null = ยังไม่ลงค่าแรง) */
export type CeSub = { id: string; qty: number; wage: number | null; date: string | null; del: boolean };
export type CeStep = { done: boolean; date: string | null };
/** ที่เหลือที่ไม่ได้ทำ ตอนแก้ตามให้ทั้งชุด · keep = ค้างไว้ในใบนี้ (ไม่ลดจำนวนสั่ง กลับไปแท็บรอจ่าย) */
export type CeRest = { mode: "split" | "drop" | "keep"; pick: string; detail: string };
/** แก้ตามให้ของใบจ่าย 1 ใบ (ไว้โชว์ในกล่อง) · rest = ชิ้นที่ใบจ่ายลดลง */
export type CeCascade = {
  woId: string; woNo: string; from: number; to: number; recvFrom: number; rest: number;
  subs: { id: string; date: string | null; from: number; to: number }[];
  qcBack: { id: string; qty: number; shelf: string }[];
};
export type CeForm = {
  prep: CeStep; cut: CeStep; unskipBuy: boolean;
  wos: CeWo[]; subs: CeSub[];
  /** id ของบนชั้น QC ที่จะย้อนกลับไปรอรับ */
  qcBack: string[];
  /** เปลี่ยนค่าแรง/ชิ้นของใบจ่าย → คิดค่าแรงรอบส่งคืนที่ลงแล้วใหม่ตามราคาใหม่ */
  reRateSubs: boolean;
  reduce: CuReduce | null;
  /** ใบจ่ายที่กด "ไม่ใช่ — แก้เฉพาะใบจ่าย" (ไม่แก้ตามให้) */
  noCascade: string[];
  rest: CeRest;
};

export type CeOp =
  | { kind: "qc_back"; itemId: string; label: string }
  | { kind: "sub_del"; id: string; label: string }
  | { kind: "sub"; id: string; patch: { qty?: number; wage?: number | null; submitted_at?: string; info_pending?: boolean }; label: string }
  | { kind: "wo"; id: string; patch: Record<string, unknown>; label: string }
  | { kind: "wo_cancel"; id: string; label: string }
  | { kind: "ready"; part: "prep" | "cut"; ready: boolean; date: string | null; label: string }
  | { kind: "unskip_buy"; label: string }
  | { kind: "reduce"; qty: number; reason: string; mode: QtyChangeMode; label: string }
  | { kind: "note"; note: string; label: string };

/** "2026-10-30T05:00:00+00:00" → "2026-10-30" ตามเวลาไทย */
export const ymdTh = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : new Date(t.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
};

/** คนรับของใบเดิม (หลายคน / ช่างเดี่ยวแบบเก่า) — แบบเดียวกับ crewIdsOf */
const crewOf = (w: CatchUpWo) => {
  const ids = (w.assignees ?? []).map((a) => a.id).filter((x): x is string => !!x);
  if (!ids.length && w.assignee_type === "craftsman" && w.assignee_id) ids.push(w.assignee_id);
  return ids;
};
const prepDoneOf = (s: CatchUpSnapshot) => (s.mo.has_bom ? s.mo.prep_ready >= s.mo.prep_total : s.mo.prep_done);
const cutDoneOf = (s: CatchUpSnapshot) => (s.mo.has_bom ? s.mo.cut_ready >= s.mo.cut_total : s.mo.cut_done);

/** ฟอร์มตั้งต้น = ของที่บันทึกอยู่ตอนนี้ */
export function ceInitial(s: CatchUpSnapshot): CeForm {
  return {
    prep: { done: prepDoneOf(s), date: ymdTh(s.mo.prep_done_at) },
    cut: { done: cutDoneOf(s), date: ymdTh(s.mo.cut_done_at) },
    unskipBuy: false,
    wos: s.wos.map((w) => ({ id: w.id, deptId: w.department_id ?? "", crewIds: crewOf(w), qty: w.qty, rate: woRatePerPiece(w.labor_cost, w.qty), date: w.dispatch_date, note: w.note ?? "", cancel: false })),
    subs: (s.subs ?? []).map((x) => ({ id: x.id, qty: x.qty, wage: x.wage, date: x.submitted_at, del: false })),
    qcBack: [], reRateSubs: true, reduce: null,
    noCascade: [], rest: { mode: "split", pick: "ของไม่พอ", detail: "" },
  };
}

/**
 * แก้ตามให้ทั้งชุด: ใบจ่ายที่ลดต่ำกว่ายอดส่งคืน (หลังแก้ในฟอร์ม) → ลดรอบส่งคืนจากรอบล่าสุด (เหลือ 0 = ลบรอบ)
 * + ของบนชั้น QC ของใบนั้นที่เกินยอดใหม่ → ย้อนกลับไปรอรับ (ทั้งก้อน — ยอดผูกกับใบจ่าย แก้บนชั้นตรง ๆ ไม่ได้)
 * + ชิ้นที่ใบจ่ายลดลง: แยกใบใหม่ / ไม่ทำแล้ว = ลดจำนวนสั่ง (ถ้ายังไม่ได้ใส่ช่องลดจำนวนเอง) · ค้างไว้ = จดหมายเหตุ
 * คืนฟอร์ม "หลังแก้ตาม" (ceBuild ใช้ต่อ) — ไม่แตะฟอร์มที่ผู้ใช้กรอก จึงพิมพ์จำนวนกลับไปกลับมาได้
 */
export function ceApplyCascade(s: CatchUpSnapshot, form: CeForm): { form: CeForm; cascades: CeCascade[]; reduceFromCascade: boolean; keepNote: string | null } {
  const subs = form.subs.map((x) => ({ ...x }));
  const qcBack = [...form.qcBack];
  const cascades: CeCascade[] = [];
  for (const w of s.wos) {
    const f = form.wos.find((y) => y.id === w.id);
    if (!f || f.cancel || !(f.qty > 0) || (form.noCascade ?? []).includes(w.id)) continue;
    const mine = (s.subs ?? []).filter((x) => x.wo_id === w.id);
    const recv = r2(w.received_qty + mine.reduce((a, x) => { const y = subs.find((z) => z.id === x.id); return !y ? a : a + (y.del ? -x.qty : y.qty - x.qty); }, 0));
    if (f.qty >= recv - EPS) continue;
    let need = r2(recv - f.qty);
    const changed: CeCascade["subs"] = [];
    const draft = subs.map((x) => ({ ...x }));
    for (const x of [...mine].reverse()) {
      if (need <= EPS) break;
      const y = draft.find((z) => z.id === x.id);
      if (!y || y.del || !(y.qty > 0)) continue;
      const take = r2(Math.min(y.qty, need)), to = r2(y.qty - take);
      changed.push({ id: x.id, date: x.submitted_at, from: y.qty, to });
      if (to <= EPS) y.del = true; else y.qty = to;
      need = r2(need - take);
    }
    if (need > EPS) continue;   // ยอดคืนไม่มีรอบส่งคืนรองรับ (ข้อมูลเก่า) — ปล่อยให้ขึ้นข้อความห้ามตามเดิม
    for (const y of draft) { const z = subs.find((q) => q.id === y.id); if (z) Object.assign(z, y); }
    let qcAfter = r2(w.qc_pulled_qty - (s.qcItems ?? []).filter((it) => it.wo_id === w.id && qcBack.includes(it.id)).reduce((a, it) => a + it.qty, 0));
    const backs: CeCascade["qcBack"] = [];
    for (const it of [...(s.qcItems ?? [])].filter((i) => i.wo_id === w.id && !qcBack.includes(i.id)).reverse()) {
      if (qcAfter <= f.qty + EPS) break;
      qcBack.push(it.id); backs.push({ id: it.id, qty: it.qty, shelf: it.shelf_name });
      qcAfter = r2(qcAfter - it.qty);
    }
    cascades.push({ woId: w.id, woNo: w.wo_no, from: w.qty, to: f.qty, recvFrom: recv, rest: r2(Math.max(0, w.qty - f.qty)), subs: changed, qcBack: backs });
  }
  if (!cascades.length) return { form, cascades, reduceFromCascade: false, keepNote: null };
  const rest = r2(cascades.reduce((a, c) => a + c.rest, 0));
  let reduce = form.reduce, keepNote: string | null = null, reduceFromCascade = false;
  if (!form.reduce && rest > EPS) {
    const reason = cuReduceReason({ qty: 0, ...form.rest });
    if (form.rest.mode === "keep") {
      const disp = r2(s.wos.reduce((a, w) => { const f = form.wos.find((y) => y.id === w.id); return f?.cancel ? a : a + (f && f.qty > 0 ? f.qty : w.qty); }, 0));
      keepNote = `ทำได้ ${fmt(disp)}/${fmt(s.mo.qty)} ชิ้น${reason ? ` เพราะ ${reason}` : ""} — อีก ${fmt(rest)} ชิ้นค้างไว้ในใบนี้ (กลับไปรอจ่าย)`;
    } else {
      reduce = { qty: r2(s.mo.qty - rest), pick: form.rest.pick, detail: form.rest.detail, mode: form.rest.mode };
      reduceFromCascade = true;
    }
  }
  return { form: { ...form, subs, qcBack, reduce }, cascades, reduceFromCascade, keepNote };
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * เทียบฟอร์มกับของเดิม → รายการแก้ + ปัญหารายช่อง (error = ห้ามบันทึก · warn = เตือน)
 * field ของปัญหา: wo:<id>:qty|rate|date|cancel · sub:<id>:qty|wage|date · prep:date · cut:date · reduce:qty|reason · disp
 */
export function ceBuild(s: CatchUpSnapshot, form0: CeForm, ctx: { departments: { id: string; name: string }[]; people: CrewPerson[]; today?: string }): {
  ops: CeOp[]; issues: CuIssue[]; errors: string[];
  /** แก้ตามให้ทั้งชุด (โชว์กล่องใต้ใบจ่าย) · eff = ฟอร์มหลังแก้ตาม (หน้าจอโชว์ค่ารอบส่งคืน/ของ QC ตามนี้) */
  cascades: CeCascade[]; eff: CeForm; reduceFromCascade: boolean;
} {
  const cas = ceApplyCascade(s, form0);
  const form = cas.form;
  const today = ctx.today ?? todayYmd();
  const issues: CuIssue[] = [];
  const err = (field: string, msg: string, where?: string) => issues.push({ level: "error", field, msg, where });
  const qcBack: CeOp[] = [], subDel: CeOp[] = [], subEd: CeOp[] = [], woEd: CeOp[] = [], woCancel: CeOp[] = [], tail: CeOp[] = [];
  const woNo = (id: string | null) => s.wos.find((w) => w.id === id)?.wo_no || "ใบจ่าย";
  const deptName = (id: string) => ctx.departments.find((d) => d.id === id)?.name ?? "";

  // ── ของบนชั้น QC ที่ย้อนกลับไปรอรับ (ต้องทำก่อน ไม่งั้นลด/ลบรอบส่งคืนไม่ได้)
  const qcBackBy = new Map<string, number>();
  for (const it of s.qcItems ?? []) {
    if (!form.qcBack.includes(it.id)) continue;
    if (it.wo_id) qcBackBy.set(it.wo_id, r2((qcBackBy.get(it.wo_id) ?? 0) + it.qty));
    qcBack.push({ kind: "qc_back", itemId: it.id, label: `ย้อนของ ${fmt(it.qty)} ชิ้น (${it.status === "good" ? "ของดี" : it.status === "defect" ? "ของเสีย" : it.status}) จาก "${it.shelf_name}" กลับไปรอ QC รับ` });
  }

  // ── รอบส่งคืน
  const recvDelta = new Map<string, number>();   // ใบจ่าย → ยอดรับคืนที่เปลี่ยน
  const subFinal = new Map<string, { qty: number; wage: number | null; wageSet: boolean }>();
  for (const x of s.subs ?? []) {
    const f = form.subs.find((y) => y.id === x.id);
    if (!f) continue;
    const where = `ส่งคืน ${x.wo_no ?? ""} ${cuDateText(x.submitted_at)}`;
    const who = x.craftsman_name ? ` · ${x.craftsman_name}` : "";
    if (f.del) {
      if (x.wo_id) recvDelta.set(x.wo_id, r2((recvDelta.get(x.wo_id) ?? 0) - x.qty));
      subDel.push({ kind: "sub_del", id: x.id, label: `ลบรอบส่งคืน ${x.wo_no ?? ""} ${fmt(x.qty)} ชิ้น (${cuDateText(x.submitted_at)}${who})` });
      continue;
    }
    if (!(f.qty > 0)) err(`sub:${x.id}:qty`, "ใส่จำนวน (ถ้าไม่ได้ส่งจริงให้กดลบรอบนี้)", where);
    if (f.wage != null && f.wage < 0) err(`sub:${x.id}:wage`, "ค่าแรงติดลบไม่ได้", where);
    for (const i of dateIssues(f.date, `sub:${x.id}:date`, { today, notBefore: s.wos.find((w) => w.id === x.wo_id)?.dispatch_date ?? null, notBeforeLabel: "วันที่จ่าย" })) issues.push({ ...i, where });
    if (x.wo_id && f.qty > 0) recvDelta.set(x.wo_id, r2((recvDelta.get(x.wo_id) ?? 0) + f.qty - x.qty));
    subFinal.set(x.id, { qty: f.qty, wage: f.wage, wageSet: Math.abs((f.wage ?? -1) - (x.wage ?? -1)) > EPS });
  }

  // ── ใบจ่าย
  let dispatched = 0, received = 0;
  const reRated = new Map<string, number>();   // ใบจ่ายที่เปลี่ยนค่าแรง/ชิ้น → ราคาใหม่
  for (const w of s.wos) {
    const f = form.wos.find((y) => y.id === w.id);
    if (!f) continue;
    const where = w.wo_no || "ใบจ่าย";
    const recv = r2(w.received_qty + (recvDelta.get(w.id) ?? 0));
    const qcAfter = r2(w.qc_pulled_qty - (qcBackBy.get(w.id) ?? 0));
    received = r2(received + recv);
    if (recv < qcAfter - EPS) err(`wo:${w.id}:qc`, `ของใบนี้อยู่ชั้น QC แล้ว ${fmt(qcAfter)} ชิ้น — ยอดส่งคืนต่ำกว่านั้นไม่ได้ (ติ๊ก "ย้อนกลับไปรอรับ" ที่ของบนชั้น QC ก่อน)`, where);
    if (f.cancel) {
      if (recv > EPS) err(`wo:${w.id}:cancel`, "ใบนี้ช่างส่งคืนแล้ว — ลบรอบส่งคืนของใบนี้ก่อนจึงจะยกเลิกได้", where);
      else woCancel.push({ kind: "wo_cancel", id: w.id, label: `ยกเลิกใบจ่าย ${where} (${fmt(w.qty)} ชิ้น · ${w.assignee_name ?? w.department_name ?? ""})` });
      continue;
    }
    dispatched = r2(dispatched + (f.qty > 0 ? f.qty : w.qty));
    if (!(f.qty > 0)) err(`wo:${w.id}:qty`, "ใส่จำนวน (ถ้าไม่ได้จ่ายจริงให้กดยกเลิกใบจ่าย)", where);
    else if (f.qty < recv - EPS) err(`wo:${w.id}:qty`, `ช่างส่งคืนแล้ว ${fmt(recv)} ชิ้น — ลดต่ำกว่านั้นไม่ได้ (แก้รอบส่งคืนก่อน)`, where);
    if (f.rate != null && f.rate < 0) err(`wo:${w.id}:rate`, "ค่าแรงติดลบไม่ได้", where);
    for (const i of dateIssues(f.date, `wo:${w.id}:date`, { today })) issues.push({ ...i, where });
    if (!f.deptId) err(`wo:${w.id}:dept`, "เลือกโต๊ะ", where);

    const patch: Record<string, unknown> = {}, ch: string[] = [];
    const rate0 = woRatePerPiece(w.labor_cost, w.qty);
    const qtyCh = f.qty > 0 && Math.abs(f.qty - w.qty) > EPS;
    const rateCh = Math.abs((f.rate ?? -1) - (rate0 ?? -1)) > EPS;
    if (qtyCh) { patch.qty = f.qty; ch.push(`จำนวน ${fmt(w.qty)} → ${fmt(f.qty)}`); }
    if (rateCh) { ch.push(`ค่าแรง/ชิ้น ${baht(rate0)} → ${baht(f.rate)}`); if (f.rate != null) reRated.set(w.id, f.rate); }
    if ((qtyCh || rateCh) && f.rate != null && f.qty > 0) patch.labor_cost = roundWage(f.rate, f.qty);
    if ((f.date ?? null) !== (w.dispatch_date ?? null)) { patch.dispatch_date = f.date ?? null; ch.push(`วันจ่าย ${cuDateText(w.dispatch_date)} → ${cuDateText(f.date)}`); }
    if (f.note.trim() !== (w.note ?? "").trim()) { patch.note = f.note.trim() || null; ch.push(`หมายเหตุ "${(w.note ?? "").trim() || "—"}" → "${f.note.trim() || "—"}"`); }
    const deptCh = !!f.deptId && f.deptId !== (w.department_id ?? "");
    const crewCh = !sameIds(f.crewIds, crewOf(w));
    if (deptCh || crewCh) {
      const desk = deptName(f.deptId) || w.department_name || "";
      const who = crewFields(crewList(f.crewIds, ctx.people), desk);
      if (deptCh) { Object.assign(patch, { department_id: f.deptId, department_name: desk, stage: stageOfDept(desk) }); ch.push(`โต๊ะ ${w.department_name ?? "—"} → ${desk}`); }
      Object.assign(patch, who, { sync_subs_worker: true });
      if (crewCh) ch.push(`คนรับ ${w.assignee_name ?? "—"} → ${String(who.assignee_name ?? "—")}`);
    }
    if (ch.length) woEd.push({ kind: "wo", id: w.id, patch, label: `ใบจ่าย ${where}: ${ch.join(" · ")}` });
  }

  // แก้รอบส่งคืน (รวมค่าแรงที่คิดใหม่ตามราคาใหม่ของใบจ่าย — เฉพาะรอบที่ลงค่าแรงแล้ว และผู้ใช้ไม่ได้พิมพ์ค่าแรงเอง)
  for (const x of s.subs ?? []) {
    const fin = subFinal.get(x.id);
    const f = form.subs.find((y) => y.id === x.id);
    if (!fin || !f) continue;
    const patch: { qty?: number; wage?: number | null; submitted_at?: string; info_pending?: boolean } = {}, ch: string[] = [];
    if (f.qty > 0 && Math.abs(f.qty - x.qty) > EPS) { patch.qty = f.qty; ch.push(`จำนวน ${fmt(x.qty)} → ${fmt(f.qty)}`); }
    // ค่าแรงที่ผู้ใช้ไม่ได้พิมพ์เอง: เปลี่ยนราคาใบจ่าย (ติ๊กคิดใหม่) = ราคาใหม่ × จำนวน · แก้แค่จำนวน = ราคาต่อชิ้นเดิมของรอบ × จำนวนใหม่
    let wage = fin.wage;
    const nr = x.wo_id ? reRated.get(x.wo_id) : undefined;
    if (!fin.wageSet && x.wage != null && fin.qty > 0) {
      if (form.reRateSubs && nr != null) wage = roundWage(nr, fin.qty);
      else if (Math.abs(fin.qty - x.qty) > EPS && x.qty > 0) wage = roundWage(x.wage / x.qty, fin.qty);
    }
    if (Math.abs((wage ?? -1) - (x.wage ?? -1)) > EPS) { patch.wage = wage; if (wage == null) patch.info_pending = true; ch.push(`ค่าแรงรอบนี้ ${baht(x.wage)} → ${baht(wage)}`); }
    if (f.date && f.date !== x.submitted_at) { patch.submitted_at = f.date; ch.push(`วันที่ ${cuDateText(x.submitted_at)} → ${cuDateText(f.date)}`); }
    if (ch.length) subEd.push({ kind: "sub", id: x.id, patch, label: `รอบส่งคืน ${woNo(x.wo_id)}${x.craftsman_name ? ` (${x.craftsman_name})` : ""}: ${ch.join(" · ")}` });
  }
  if (!form.reRateSubs && [...reRated.keys()].some((id) => (s.subs ?? []).some((x) => x.wo_id === id && x.wage != null && !form.subs.find((y) => y.id === x.id)?.del)))
    issues.push({ level: "warn", field: "rerate", msg: "รอบส่งคืนที่ลงค่าแรงแล้วยังคิดราคาเดิม (ติ๊ก \"คิดค่าแรงรอบส่งคืนใหม่\" ถ้าต้องการให้ตาม)" });

  // ── เตรียม / ตัด / ป้ายของครบ
  const steps: { key: "prep" | "cut"; label: string; done0: boolean; date0: string | null; skipped: boolean }[] = [
    { key: "prep", label: "เตรียมของ", done0: prepDoneOf(s), date0: ymdTh(s.mo.prep_done_at), skipped: !!s.mo.skipped.prep },
    { key: "cut", label: "ตัด", done0: cutDoneOf(s), date0: ymdTh(s.mo.cut_done_at), skipped: !!s.mo.skipped.cut },
  ];
  for (const st of steps) {
    const f = form[st.key];
    if (st.skipped) continue;   // ข้ามขั้นโดยแอดมิน — แก้ที่หน้าใบสั่งผลิต
    for (const i of dateIssues(f.date, `${st.key}:date`, { today })) issues.push({ ...i, where: st.label });
    if (f.done && !st.done0) tail.push({ kind: "ready", part: st.key, ready: true, date: f.date, label: `ติ๊ก${st.label}ครบ${f.date ? ` · ${cuDateText(f.date)}` : ""}` });
    else if (!f.done && st.done0) tail.push({ kind: "ready", part: st.key, ready: false, date: null, label: `เอาติ๊ก${st.label}ออก` });
    else if (f.done && st.done0 && f.date && f.date !== st.date0) tail.push({ kind: "ready", part: st.key, ready: true, date: f.date, label: `วันที่${st.label} ${cuDateText(st.date0)} → ${cuDateText(f.date)}` });
  }
  if (form.unskipBuy && s.mo.skipped.buy) tail.push({ kind: "unskip_buy", label: "เอาป้าย \"ของครบ (อัปเดตย้อนหลัง)\" ที่ขั้นซื้อของออก" });

  // ── ยอดรวม + เปลี่ยนจำนวน (ว่าง/เท่าเดิม = ไม่เปลี่ยน)
  let moQty = s.mo.qty, reducing = false;
  const red = form.reduce;
  const dir = cuQtyDir(s.mo.qty, red);
  if (red && dir === "up") {
    const reason = cuReduceReason(red);
    if (!isIncreaseMode(red.mode)) err("reduce:mode", "เลือกว่าจะเพิ่มในใบนี้ หรือแยกส่วนเกินเป็นใบใหม่", "เพิ่มจำนวน");
    else {
      const why = increaseQtyIssue({ qty: s.mo.qty, newQty: red.qty, sized: s.mo.sized, status: s.mo.status });
      if (why) err("reduce:qty", why, "เพิ่มจำนวน");
      if (!reason) err("reduce:reason", "ใส่เหตุผลที่เพิ่มจำนวน", "เพิ่มจำนวน");
      if (!why && increaseIsBig(s.mo.qty, red.qty)) issues.push({ level: "warn", field: "reduce:qty", msg: `เพิ่มเกิน 50% (${fmt(s.mo.qty)} → ${fmt(red.qty)}) — ตรวจตัวเลขอีกครั้ง`, where: "เพิ่มจำนวน" });
      if (!why && reason) {
        tail.push({ kind: "reduce", qty: r2(red.qty), reason, mode: red.mode, label: red.mode === "add"
          ? `เพิ่มจำนวนสั่งผลิต ${fmt(s.mo.qty)} → ${fmt(red.qty)} ชิ้น (${reason}) · เพิ่มในใบนี้ (วัตถุดิบ/ยอดขอซื้อคิดใหม่)`
          : `ทำเพิ่ม ${fmt(red.qty - s.mo.qty)} ชิ้น เป็นใบสั่งผลิตใหม่ (${reason}) · ใบนี้คง ${fmt(s.mo.qty)}` });
        if (red.mode === "add") moQty = r2(red.qty);
      }
    }
  } else if (red && dir === "down" && red.mode !== "keep") {
    const reason = cuReduceReason(red);
    reducing = true;
    if (isIncreaseMode(red.mode)) err("reduce:mode", "เลือกว่าที่เหลือจะแยกเป็นใบใหม่ หรือไม่ทำแล้ว", "ลดจำนวน");
    const why = reduceQtyIssue({ qty: s.mo.qty, newQty: red.qty, received, sized: s.mo.sized, status: s.mo.status });
    if (why) err("reduce:qty", why, "ลดจำนวน");
    if (!reason) err("reduce:reason", "ใส่เหตุผลที่ลดจำนวน", "ลดจำนวน");
    if (!why && reason) {
      const after = s.wos.filter((w) => !form.wos.find((y) => y.id === w.id)?.cancel).map((w) => {
        const f = form.wos.find((y) => y.id === w.id);
        return { ...w, qty: f && f.qty > 0 ? f.qty : w.qty, received_qty: r2(w.received_qty + (recvDelta.get(w.id) ?? 0)) };
      });
      const shr = shrinkWos(after, red.qty);
      const extra = shr.map((x) => (x.cancel ? ` · ยกเลิกใบจ่าย ${x.wo_no}` : ` · ลดใบจ่าย ${x.wo_no} ${fmt(x.from)} → ${fmt(x.to)}`)).join("");
      tail.push({ kind: "reduce", qty: r2(red.qty), reason, mode: red.mode as QtyChangeMode, label: `ลดจำนวนสั่งผลิต ${fmt(s.mo.qty)} → ${fmt(red.qty)} ชิ้น (${reason}) · ${red.mode === "split" ? `แยกที่เหลือ ${fmt(s.mo.qty - red.qty)} ชิ้นเป็นใบใหม่ รอของ` : `ที่เหลือ ${fmt(s.mo.qty - red.qty)} ชิ้น ${REDUCE_MODE_LABEL.drop}`}${extra}` });
      moQty = r2(red.qty);
    }
  }
  // จ่ายรวมเกินจำนวนสั่งผลิต (ลดจำนวนอยู่ด้วย = เซิร์ฟเวอร์ลดยอดค้างให้เอง · เพิ่มในใบนี้ = เทียบจำนวนใหม่)
  if (!reducing && dispatched > moQty + EPS) err("disp", `จ่ายรวม ${fmt(dispatched)} ชิ้น เกินจำนวนสั่งผลิต ${fmt(moQty)}`);

  if (cas.keepNote) {
    const line = `[แก้ไขใบงาน ${cuDateText(today)}] ${cas.keepNote}`;
    tail.push({ kind: "note", note: s.mo.note ? `${s.mo.note}\n${line}` : line, label: `จดต่อท้ายหมายเหตุใบสั่งผลิต: ${cas.keepNote}` });
  }
  const ops = [...qcBack, ...subDel, ...subEd, ...woEd, ...woCancel, ...tail];
  if (!issues.some((x) => x.level === "error") && !ops.length) err("none", "ยังไม่ได้แก้อะไร");
  return { ops, issues, errors: issues.filter((x) => x.level === "error").map((x) => (x.where ? `${x.where}: ${x.msg}` : x.msg)),
    cascades: cas.cascades, eff: form, reduceFromCascade: cas.reduceFromCascade };
}

const VIA = "cu_edit";
const q = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

/** บันทึกทีละรายการตามลำดับ — พัง = หยุด (รายการหลังอาจพึ่งรายการก่อน) แล้วรายงานว่าสำเร็จถึงไหน */
export async function ceRun(ops: CeOp[], moId: string, api: CuApi, onProgress?: (i: number) => void): Promise<{ op: CeOp; ok: boolean; msg: string }[]> {
  const out: { op: CeOp; ok: boolean; msg: string }[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    onProgress?.(i);
    const tag = { via: VIA, label: op.label };
    try {
      switch (op.kind) {
        case "qc_back": await api("/api/qc-warehouse/items", { action: "return_queue", item_id: op.itemId, ...tag }); break;
        case "sub_del": await api(`/api/mo/submissions?${q({ id: op.id, ...tag })}`, null, "DELETE"); break;
        case "sub": await api("/api/mo/submissions", { id: op.id, ...op.patch, ...tag }, "PATCH"); break;
        case "wo": await api(`/api/mo/work-orders/${op.id}`, { ...op.patch, ...tag }, "PATCH"); break;
        case "wo_cancel": await api(`/api/mo/work-orders/${op.id}?${q(tag)}`, null, "DELETE"); break;
        case "ready": await api(`/api/mo/${moId}/mark-ready`, { ready: op.ready, parts: [op.part], ...(op.date ? { done_date: op.date } : {}), ...tag }, "PATCH"); break;
        case "unskip_buy": await api(`/api/mo/${moId}/skip-stage`, { stages: ["buy"], skip: false, via: "catch_up" }, "PATCH"); break;
        case "reduce": await api(`/api/mo/${moId}/reduce-qty`, { qty: op.qty, reason: op.reason, mode: op.mode, source: "edit" }); break;
        case "note": await api(`/api/mo/${moId}`, { note: op.note }, "PATCH"); break;
      }
      out.push({ op, ok: true, msg: op.label });
    } catch (e) {
      out.push({ op, ok: false, msg: `${op.label} — ${e instanceof Error ? e.message : "ไม่สำเร็จ"}` });
      break;
    }
  }
  return out;
}
