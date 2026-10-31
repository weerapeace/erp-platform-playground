/**
 * 🔄 โหมด "อัปเดตงาน" (บอร์ดจ่ายงาน) — กติกากลาง ไม่มี React ทดสอบได้
 *
 * ใช้ตอนใบงานในระบบไม่ตรงของจริง (เช่น ระบบบอกรอจ่าย แต่จริงๆ ของถึง QC แล้ว):
 *   เลือก "ตอนนี้อยู่ขั้นไหน" → ติ๊กขั้นก่อนหน้าให้อัตโนมัติ (ของครบ/เตรียม/ตัด เอาออกได้ เพราะบางทีจ่ายไปก่อน)
 *   → ถามเฉพาะข้อมูลที่ยังไม่มี → บันทึกทีละขั้นผ่าน API เดิมของแต่ละขั้น (ไม่มีระบบซ้อน · audit ครบตาม API นั้นๆ)
 * ทุกขั้นส่ง quiet → ไม่แจ้ง LINE/DM เรื่องงานเก่า · ส่งงานย้อนหลัง = "ยังไม่ลงค่าแรง" เสมอ (เงินเดือนยังไม่นับจนกว่าจะใส่)
 * เจ้าของอนุมัติชุดสถานะ 2026-10-28 · ดู docs/work-board-catch-up.md
 */
import type { CatchUpSnapshot, CatchUpWo } from "@/app/api/mo/catch-up/route";
import { dispatchRowIssues, notReadyIssue, wageIssues, returnRowIssues, qcReceiveIssues, dateIssues, todayYmd, type EntryIssue } from "@/lib/work-entry-rules";
import { reduceQtyIssue, increaseQtyIssue, increaseIsBig, isIncreaseMode, shrinkWos, type QtyChangeMode, type ReduceMode, type IncreaseMode, type WoShrink } from "@/lib/mo-qty-reduce";

export type CuStage = "have" | "prep" | "cut" | "dispatch" | "return" | "qc_in" | "ship" | "close";
/** ลำดับขั้นจริงของใบสั่งผลิต (ซื้อ → เตรียม → ตัด → จ่าย → ช่างส่งคืน → QC รับเข้าชั้น → ส่งออก → ปิดใบ) */
export const CU_CHAIN: CuStage[] = ["have", "prep", "cut", "dispatch", "return", "qc_in", "ship", "close"];
export const CU_STAGE_LABEL: Record<CuStage, string> = {
  have: "ของครบ", prep: "เตรียมของแล้ว", cut: "ตัดแล้ว", dispatch: "จ่ายงาน", return: "ช่างส่งคืน",
  qc_in: "QC รับเข้าชั้น", ship: "ส่งออกจาก QC", close: "ปิดใบ",
};
/** ขั้นที่เอาติ๊กออกได้ (ทำข้ามไปก่อนได้จริง เช่น จ่ายงานก่อนตัดครบ) — ขั้นตั้งแต่จ่ายงานไปต้องมีถ้าจะไปขั้นหลังจากนั้น */
export const CU_OPTIONAL: readonly CuStage[] = ["have", "prep", "cut"];
/** ขั้นนี้เอาติ๊กออกได้ไหม เมื่อเลือกไปถึงขั้น upto · ปิดใบ = ไม่ผ่านชั้น QC ก็ได้ (ของส่งตรงไม่ขึ้นชั้น) */
const isOptional = (stage: CuStage, upto: CuStage) =>
  stage !== upto && (CU_OPTIONAL.includes(stage) || (upto === "close" && (stage === "qc_in" || stage === "ship")));

export type CuTargetKey = "have" | "prep" | "cut" | "dispatch" | "return_part" | "return" | "qc_in" | "ship" | "close" | "cancel";
export type CuTarget = { key: CuTargetKey; label: string; hint: string; icon: string; group: string; upto: CuStage | null };
/** สถานะที่ "เลือกได้" ในโหมดอัปเดต (สถานะที่ระบบคิดเองจากเอกสาร เช่น ขอซื้อ/รอของ ตั้งตรงนี้ไม่ได้) */
export const CU_TARGETS: CuTarget[] = [
  { key: "have", label: "ของครบแล้ว", hint: "รอเตรียม", icon: "📦", group: "วัตถุดิบ", upto: "have" },
  { key: "prep", label: "เตรียมของแล้ว", hint: "รอตัด", icon: "🧺", group: "เตรียมผลิต", upto: "prep" },
  { key: "cut", label: "ตัดแล้ว", hint: "พร้อมจ่าย", icon: "✂️", group: "เตรียมผลิต", upto: "cut" },
  { key: "dispatch", label: "จ่ายงานแล้ว", hint: "อยู่กับช่าง", icon: "🚚", group: "อยู่กับช่าง", upto: "dispatch" },
  { key: "return_part", label: "ช่างส่งคืนบางส่วน", hint: "ที่เหลือยังอยู่กับช่าง", icon: "↩️", group: "อยู่กับช่าง", upto: "return" },
  { key: "return", label: "ส่งคืนครบ", hint: "รอ QC รับเข้า", icon: "📥", group: "QC", upto: "return" },
  { key: "qc_in", label: "QC รับเข้าชั้นแล้ว", hint: "ของดี / ของเสีย", icon: "🗄️", group: "QC", upto: "qc_in" },
  { key: "ship", label: "ส่งออกจาก QC แล้ว", hint: "ออกจากชั้นแล้ว", icon: "📤", group: "QC", upto: "ship" },
  { key: "close", label: "ปิดใบแล้ว", hint: "จบงาน", icon: "🏁", group: "จบใบ", upto: "close" },
  { key: "cancel", label: "ยกเลิกใบ", hint: "เฉพาะใบที่ยังไม่จ่าย", icon: "✖️", group: "จบใบ", upto: null },
];
export const cuTarget = (k: CuTargetKey) => CU_TARGETS.find((t) => t.key === k)!;

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString("th-TH");

/** ข้อเท็จจริงที่ใช้ตัดสินว่าแต่ละขั้น "ระบบบันทึกครบแล้ว" หรือยัง */
export type CuFacts = {
  qty: number; status: string;
  buyDone: boolean; prepDone: boolean; cutDone: boolean;
  /** จำนวนรายการวัตถุดิบที่เลือกเป็น "ยังขาด" ได้ (0 = ใบไม่มีสูตร) */
  materials: number;
  dispatched: number; received: number; qcPulled: number; shelfGood: number;
  /** ใบแบ่งจำนวนตามไซส์ (ลดจำนวนจากโหมดนี้ไม่ได้) */
  sized?: boolean;
};
export function cuFacts(s: CatchUpSnapshot): CuFacts {
  const m = s.mo, p = s.progress;
  const prepDone = m.has_bom ? m.prep_ready >= m.prep_total : m.prep_done;
  const cutDone = m.has_bom ? m.cut_ready >= m.cut_total : m.cut_done;
  // ติ๊กเตรียมแล้ว = ของอยู่หน้างาน (กติกา lib/mo-material-status) → นับของครบด้วย
  const buyDone = !!m.skipped.buy || prepDone || (!!p && p.buy + p.requested + p.ordered === 0);
  const sum = (f: (w: CatchUpWo) => number) => r2(s.wos.reduce((a, w) => a + f(w), 0));
  return {
    qty: m.qty, status: m.status, buyDone, prepDone, cutDone, materials: s.materials.length,
    dispatched: sum((w) => w.qty), received: sum((w) => w.received_qty), qcPulled: sum((w) => w.qc_pulled_qty), shelfGood: s.shelf.good,
    sized: !!m.sized,
  };
}

/** ขั้นนี้ระบบบันทึกครบแล้ว (ไม่ต้องทำซ้ำ) */
export function cuStageDone(f: CuFacts, st: CuStage): boolean {
  const full = (n: number) => f.qty > 0 && n >= f.qty - EPS;
  switch (st) {
    case "have": return f.buyDone;
    case "prep": return f.prepDone;
    case "cut": return f.cutDone;
    case "dispatch": return full(f.dispatched);
    case "return": return full(f.received);
    case "qc_in": return full(f.qcPulled);
    case "ship": return full(f.qcPulled) && f.shelfGood <= EPS;
    case "close": return f.status === "done";
  }
}

/** เลือกสถานะนี้ไม่ได้เพราะอะไร (null = เลือกได้) */
export function cuTargetBlocked(f: CuFacts, k: CuTargetKey): string | null {
  if (f.status === "done") return "ใบนี้ปิดงานไปแล้ว";
  if (f.status === "cancelled") return "ใบนี้ถูกยกเลิกไปแล้ว";
  if (k === "cancel") return f.dispatched > EPS ? `จ่ายงานไปแล้ว ${fmt(f.dispatched)} ชิ้น — ยกเลิกไม่ได้` : null;
  if (!(f.qty > 0)) return "จำนวนสั่งผลิตเป็น 0";
  return null;
}

/** short = ติ๊ก "ยังขาดของอยู่" (แทนของครบ) → ของที่ขาดไม่ถูกติ๊กเตรียม/ตัด และไม่ติดป้ายของครบ */
export type CuTicks = Partial<Record<CuStage, boolean>> & { short?: boolean };
export type CuRowState = "done" | "need" | "opt" | "implied" | "short";
/** เลือก "ยังขาดของอยู่" ได้ไหม — ต้องมีแถวของครบที่ยังไม่ครบ และไม่ได้เลือกขั้น "ของครบแล้ว" เอง */
export const cuCanShort = (f: CuFacts, k: CuTargetKey) => !f.buyDone && !!cuTarget(k).upto && k !== "have";
/** แถวเช็กลิสต์ในป๊อปขั้นที่ 1: done = มีในระบบแล้ว · need = ต้องทำ (ติ๊กล็อก) · opt = ติ๊ก/เอาออกได้ · implied = รวมอยู่ในขั้นอื่น · short = ยังขาดของ */
export function cuRows(f: CuFacts, k: CuTargetKey, ticks: CuTicks): { stage: CuStage; state: CuRowState }[] {
  const t = cuTarget(k);
  if (!t.upto) return [];
  const upto = CU_CHAIN.indexOf(t.upto);
  return CU_CHAIN.slice(0, upto + 1).map((stage) => {
    if (cuStageDone(f, stage)) return { stage, state: "done" as const };
    if (stage === "have" && ticks.short && k !== "have") return { stage, state: "short" as const };
    if (stage === "have" && ticks.prep) return { stage, state: "implied" as const };   // ติ๊กเตรียม = ของครบในตัว
    if (isOptional(stage, t.upto!)) return { stage, state: "opt" as const };
    return { stage, state: "need" as const };
  });
}

/** ติ๊กเริ่มต้นเมื่อเลือกสถานะ = ทุกขั้นที่ยังไม่ครบจนถึงขั้นที่เลือก */
export function cuDefaultTicks(f: CuFacts, k: CuTargetKey): CuTicks {
  const out: CuTicks = {};
  for (const r of cuRows(f, k, {})) if (r.state !== "done") out[r.stage] = true;
  return out;
}

/** ค่าตั้งต้นของช่องจำนวนในขั้นที่ 2 (แถวแรกของจ่าย/ส่งคืน) */
export function cuDefaultQty(f: CuFacts, k: CuTargetKey) {
  const dispatchQty = r2(Math.max(0, f.qty - f.dispatched));
  const outstanding = r2(f.dispatched + dispatchQty - f.received);
  return { dispatchQty, returnQty: k === "return_part" ? 0 : outstanding, qcGood: r2(f.received + outstanding - f.qcPulled), qcBad: 0 };
}

/** แถวจ่ายงาน 1 แถว = ใบจ่ายงาน 1 ใบ · deskName/crewCount = หน้าจอส่งมาให้ตรวจกฎโต๊ะเหมา · rate = ค่าแรง/ชิ้น (ว่าง = ให้เซิร์ฟเวอร์เติมราคากลาง) */
export type CuDispLine = { key: string; deptId: string; qty: number; date: string | null; deskName?: string | null; crewCount?: number; rate?: number | null; note?: string };
/**
 * เปลี่ยนจำนวน = จำนวนที่ทำจริง (qty) — น้อยกว่าสั่ง (ของไม่พอ / ช่างคืนไม่ครบ) หรือมากกว่าสั่ง (ของพอทำเพิ่ม / ลูกค้าสั่งเพิ่ม)
 * ลด: split = ที่เหลือแยกเป็นใบใหม่ (รอของ) · drop = ไม่ทำแล้ว · keep = ค้างไว้ในใบนี้ (ไม่ลด แค่จดต่อท้ายหมายเหตุ)
 * เพิ่ม: add = เพิ่มในใบนี้ · extra = แยกส่วนเกินเป็นใบใหม่ (ใบนี้คงเดิม)
 * เหตุผล = pick (REDUCE_REASONS / INCREASE_REASONS) + detail (พิมพ์เพิ่ม) · กติกาอยู่ที่ lib/mo-qty-reduce (ใช้ร่วมกับ API)
 * ว่าง / เท่าจำนวนสั่ง = ไม่เปลี่ยน (ไม่ถือเป็นจุดต้องแก้)
 */
export type CuReduce = { qty: number; pick: string; detail: string; mode: QtyChangeMode | "keep" };
/** ทิศของการเปลี่ยนจำนวน — null = ยังไม่ได้ใส่ / เท่าเดิม */
export const cuQtyDir = (orderQty: number, red: CuReduce | null | undefined): "up" | "down" | null =>
  !red || !(red.qty > 0) || Math.abs(red.qty - orderQty) < EPS ? null : red.qty > orderQty ? "up" : "down";
export const cuReduceReason = (r: CuReduce) => {
  const d = r.detail.trim();
  return r.pick === "อื่น ๆ" || !r.pick ? d : d ? `${r.pick}: ${d}` : r.pick;
};
/** ใบจ่ายหลังลดจำนวน (ใบที่ยังไม่ส่งคืนเลยแล้วต้องลดจนหมด = หายไป) */
export function cuShrinkWos(wos: CatchUpWo[], newQty: number): CatchUpWo[] {
  const plan = new Map(shrinkWos(wos, newQty).map((x) => [x.id, x]));
  return wos.flatMap((w) => {
    const p = plan.get(w.id);
    if (!p) return [w];
    return p.cancel ? [] : [{ ...w, qty: p.to, status: p.status_to, labor_cost: p.labor_to ?? w.labor_cost }];
  });
}
/** ภาพใบงาน "หลังลดจำนวน" ไว้ให้หน้าจอคิดขั้นที่เหลือ (ติ๊ก/ยอดจ่าย/ส่งคืน) จากจำนวนใหม่ · ลดไม่ได้ = คืนของเดิม */
export function cuReduceSnap(snap: CatchUpSnapshot, red: CuReduce | null | undefined): CatchUpSnapshot {
  const dir = cuQtyDir(snap.mo.qty, red);
  if (!red || !dir || snap.mo.sized) return snap;
  // เพิ่มในใบนี้ = จำนวนสั่งใหม่ · แยกส่วนเกิน = ใบนี้คงเดิม (จ่ายส่วนเกินที่ใบใหม่)
  if (dir === "up") return red.mode === "add" ? { ...snap, mo: { ...snap.mo, qty: r2(red.qty) } } : snap;
  if (red.mode !== "split" && red.mode !== "drop") return snap;
  if (red.qty < snap.wos.reduce((a, w) => a + w.received_qty, 0) - EPS) return snap;
  return { ...snap, mo: { ...snap.mo, qty: r2(red.qty) }, wos: cuShrinkWos(snap.wos, red.qty) };
}
/** ปัญหาที่เจอ 1 รายการ → กล่อง "ปัญหา" ของใบงาน (/api/mo/issues) · model = จำเป็นปัญหาของรุ่น (ทุกสี) เตือนตอนจ่ายครั้งหน้า */
export type CuProblem = { key: string; text: string; severity: "low" | "medium" | "high"; qty: number | null; model: boolean };
export const CU_SEVERITY: Record<CuProblem["severity"], string> = { low: "เล็กน้อย", medium: "ปานกลาง", high: "รุนแรง" };
/** แถวส่งคืน 1 แถว = ส่งงาน 1 ครั้ง · ref = "auto" (ไล่ใบเก่าก่อน) | id ใบจ่ายเดิม | "new:<key แถวจ่าย>" · wage = ค่าแรง/ชิ้น (ว่าง = ยังไม่ลงค่าแรง) */
export type CuRetLine = { key: string; ref: string; qty: number; date: string | null; wage?: number | null };
/** วันที่จริงของแต่ละขั้น (null = จำไม่ได้/ข้าม) */
export type CuDates = { have: string | null; ready: string | null; qc: string | null; ship: string | null; close: string | null; cancel: string | null };
export const CU_NO_DATES: CuDates = { have: null, ready: null, qc: null, ship: null, close: null, cancel: null };
/** missing = รหัสวัตถุดิบที่ "ยังขาด" · badReason = สาเหตุของเสีย (จากรายการ) · centralRate = ค่าแรงกลาง/ชิ้น (ไว้เตือนค่าแรงผิดปกติ) */
export type CuInputs = {
  disp: CuDispLine[]; ret: CuRetLine[];
  qcGood: number; qcBad: number; shelfId: string; cancelReason: string; missing?: string[]; dates: CuDates;
  badReason?: string; centralRate?: number | null; today?: string;
  /** ข้อมูลเพิ่มเติม (ไม่บังคับ): ปัญหาที่เจอ · บันทึกต่อท้ายหมายเหตุใบสั่งผลิต · ค่าแรง/ชิ้นที่จะบันทึกกลับเข้าสูตร (BOM) */
  problems?: CuProblem[]; teamNote?: string; bomRate?: number | null;
  /** ส่งออกจาก QC ไปที่ไหน (เหมือนหน้าโกดัง QC): sales_wh = เข้าคลังขาย (shipWh) · sell = ขายออก */
  shipMode?: "sales_wh" | "sell"; shipWh?: string | null;
  /** ทำได้ไม่ครบ (ลดจำนวน) — null = ทำครบตามสั่ง */
  reduce?: CuReduce | null;
};
export type CuStep =
  | { kind: "reduce"; from: number; to: number; reason: string; mode: QtyChangeMode }
  | { kind: "skip_buy"; date: string | null }
  | { kind: "mark_ready"; parts: ("prep" | "cut")[]; except?: string[]; date: string | null }
  | { kind: "dispatch"; line: string; qty: number; date: string | null; rate?: number | null; note?: string }
  | { kind: "return"; ref: string; qty: number; date: string | null; wage?: number | null }
  | { kind: "qc_in"; good: number; bad: number; date: string | null }
  | { kind: "ship"; qty: number; date: string | null; mode?: "sales_wh" | "sell"; wh?: string | null }
  | { kind: "close"; date: string | null }
  | { kind: "cancel"; reason: string; date: string | null }
  | { kind: "problem"; text: string; severity: CuProblem["severity"]; qty: number | null; model: boolean }
  | { kind: "note"; text: string }
  | { kind: "bom_rate"; rate: number };
/** ปัญหาที่ช่อง (กฎกลาง lib/work-entry-rules) + where = บอกว่าแถวไหน (ไว้โชว์ในสรุป) */
export type CuIssue = EntryIssue & { where?: string };

/** "2026-10-12" → "12 ต.ค. 69" · null → "ไม่ระบุวัน" */
export const cuDateText = (d: string | null) => d ? new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "ไม่ระบุวัน";

/** ข้อความสรุปของขั้น · who = ชื่อโต๊ะ/คน ของแถวจ่าย หรือใบที่ส่งคืน (หน้าจอส่งมา) */
export function cuStepLabel(s: CuStep, who?: (s: CuStep) => string): string {
  const w = who?.(s) ?? "";
  const d = "date" in s ? ` · ${cuDateText(s.date)}` : "";
  switch (s.kind) {
    case "reduce":
      if (s.mode === "add") return `เพิ่มจำนวน ${fmt(s.from)} → ${fmt(s.to)} ชิ้น (${s.reason}) · เพิ่มในใบนี้`;
      if (s.mode === "extra") return `ทำเพิ่ม ${fmt(s.to - s.from)} ชิ้น เป็นใบใหม่ (${s.reason}) · ใบนี้คง ${fmt(s.from)}`;
      return `ลดจำนวน ${fmt(s.from)} → ${fmt(s.to)} ชิ้น (${s.reason}) · ${s.mode === "split" ? `แยกที่เหลือ ${fmt(s.from - s.to)} ชิ้นเป็นใบใหม่ รอของ` : `ที่เหลือ ${fmt(s.from - s.to)} ชิ้น ไม่ทำแล้ว`}`;
    case "skip_buy": return `ติดป้าย "ของครบ (อัปเดตย้อนหลัง)" ที่ขั้นซื้อของ${d}`;
    case "mark_ready": return `ติ๊ก${s.parts.includes("prep") ? " เตรียม" : ""}${s.parts.length === 2 ? " +" : ""}${s.parts.includes("cut") ? " ตัด" : ""} ${s.except?.length ? `ยกเว้นของที่ยังขาด ${s.except.length} รายการ` : "ครบทั้งใบ"}${d}`;
    case "dispatch": return `สร้างใบจ่ายงาน ${fmt(s.qty)} ชิ้น${w ? ` → ${w}` : ""}${s.rate ? ` · ค่าแรง ฿${fmt(s.rate)}/ชิ้น` : ""}${d}${s.note ? ` · หมายเหตุ: ${s.note}` : ""}`;
    case "return": return `บันทึกช่างส่งคืน ${fmt(s.qty)} ชิ้น${w ? ` (${w})` : ""}${d} · ${s.wage != null ? `ค่าแรง ฿${fmt(s.wage)}/ชิ้น` : "ยังไม่ลงค่าแรง"}`;
    case "qc_in": return `รับเข้าชั้น QC · ของดี ${fmt(s.good)}${s.bad > 0 ? ` · ของเสีย ${fmt(s.bad)}` : ""} ชิ้น${d}`;
    case "ship": return `ส่งออกจากชั้น QC ${fmt(s.qty)} ชิ้น → ${s.mode === "sell" ? "ขายออก" : `เข้าคลัง ${s.wh ?? "ขาย"}`}${d}`;
    case "close": return `ปิดใบสั่งผลิต${d}`;
    case "cancel": return `ยกเลิกใบ (เหตุผล: ${s.reason})${d}`;
    case "problem": return `แจ้งปัญหา: ${s.text} (${CU_SEVERITY[s.severity]}${s.qty ? ` · ${fmt(s.qty)} ชิ้น` : ""})${s.model ? " + จำเป็นปัญหาของรุ่นนี้" : ""}`;
    case "note": return `บันทึกต่อท้ายหมายเหตุใบสั่งผลิต: ${s.text}`;
    case "bom_rate": return `บันทึกค่าแรง ฿${fmt(s.rate)}/ชิ้น กลับเข้าสูตร (BOM · ราคากลาง)`;
  }
}

/**
 * ชิ้นส่วนข้อความของ 1 ขั้น สำหรับแสดงแบบอ่านง่าย (แบบ A ตารางย่อ — เจ้าของเลือก 2026-10-31) → ของกลาง CuStepList (catch-up-step-line.tsx)
 * b = ตัวหนา (ตัวเลขหลัก) · old = ขีดฆ่า (ค่าเดิม) · who = ขีดเส้นใต้จุด (คน/โต๊ะ/ปลายทาง) · it = เอียง (เหตุผล/หมายเหตุ) · dim = จาง
 */
export type CuSeg = { t: string; b?: boolean; old?: boolean; who?: boolean; it?: boolean; dim?: boolean };
export type CuChip = { t: string; tone: "warn" | "bad" | "acc" | "ok" | "muted" };
export type CuTone = "qty" | "ready" | "disp" | "ret" | "qc" | "ship" | "close" | "cancel" | "info";
export type CuStepParts = { tone: CuTone; title: string; main: CuSeg[]; date: { t: string; none: boolean } | null; chips: CuChip[] };

export function cuStepParts(s: CuStep, who?: (s: CuStep) => string): CuStepParts {
  const w = who?.(s) ?? "";
  const date = "date" in s ? { t: cuDateText(s.date), none: !s.date } : null;
  const T = (t: string, o: Omit<CuSeg, "t"> = {}): CuSeg => ({ t, ...o });
  const by = (pre: string): CuSeg[] => (w ? [T(pre), T(w, { who: true })] : []);
  // ค่าแรง/ชิ้น × จำนวน = ยอดรวม (เจ้าของขอ 2026-10-31) — ยอดรวมตัวหนา
  const pay = (rate: number, qty: number): CuSeg[] => [T(` · ฿${fmt(rate)}/ชิ้น × ${fmt(qty)} = `, { dim: true }), T(`฿${fmt(rate * qty)}`, { b: true })];
  switch (s.kind) {
    case "reduce": {
      const d = r2(Math.abs(s.to - s.from));
      if (s.mode === "extra") return { tone: "qty", title: "ทำเพิ่ม", main: [T("ใบใหม่ "), T(fmt(d), { b: true }), T(" ชิ้น · เพราะ "), T(s.reason, { it: true })], date: null, chips: [{ t: `ใบนี้คง ${fmt(s.from)}`, tone: "acc" }] };
      return {
        tone: "qty", title: s.mode === "add" ? "เพิ่มจำนวน" : "ลดจำนวน",
        main: [T(fmt(s.from), { old: true }), T(" → "), T(fmt(s.to), { b: true }), T(" ชิ้น · เพราะ "), T(s.reason, { it: true })], date: null,
        chips: [s.mode === "add" ? { t: `เพิ่ม ${fmt(d)}`, tone: "acc" } : s.mode === "split" ? { t: `ใบใหม่ ${fmt(d)} (รอของ)`, tone: "acc" } : { t: `ไม่ทำแล้ว ${fmt(d)}`, tone: "bad" }],
      };
    }
    case "skip_buy": return { tone: "ready", title: "ของครบ", main: [T("ติดป้ายของครบ (อัปเดตย้อนหลัง)")], date, chips: [] };
    case "mark_ready": return {
      tone: "ready", title: s.parts.length === 2 ? "เตรียม + ตัด" : s.parts[0] === "prep" ? "เตรียมของ" : "ตัด",
      main: [T(s.except?.length ? "ครบ ยกเว้นของที่ขาด" : "ครบทั้งใบ")], date, chips: s.except?.length ? [{ t: `ขาด ${s.except.length} รายการ`, tone: "warn" }] : [],
    };
    case "dispatch": return {
      tone: "disp", title: "จ่ายงาน",
      main: [T(fmt(s.qty), { b: true }), T(" ชิ้น"), ...by(" → "), ...(s.rate ? pay(s.rate, s.qty) : []), ...(s.note ? [T(` · ${s.note}`, { it: true, dim: true })] : [])],
      date, chips: s.rate ? [] : [{ t: "ไม่มีค่าแรง", tone: "warn" }],
    };
    case "return": return {
      tone: "ret", title: "ช่างส่งคืน",
      main: [T(fmt(s.qty), { b: true }), T(" ชิ้น"), ...by(" จาก "), ...(s.wage != null ? pay(s.wage, s.qty) : [])],
      date, chips: s.wage == null ? [{ t: "ยังไม่ลงค่าแรง", tone: "warn" }] : [],
    };
    case "qc_in": return {
      tone: "qc", title: "QC รับเข้า", main: [T("ของดี "), T(fmt(s.good), { b: true }), ...(s.bad > 0 ? [T(" · ของเสีย "), T(fmt(s.bad), { b: true })] : []), T(" ชิ้น")],
      date, chips: s.bad > 0 ? [{ t: `เสีย ${fmt(s.bad)}`, tone: "bad" }] : [],
    };
    case "ship": return { tone: "ship", title: "ส่งออก", main: [T(fmt(s.qty), { b: true }), T(" ชิ้น → "), T(s.mode === "sell" ? "ขายออก" : `คลัง ${s.wh ?? "ขาย"}`, { who: true })], date, chips: [] };
    case "close": return { tone: "close", title: "ปิดใบ", main: [T("ปิดใบสั่งผลิต")], date, chips: [] };
    case "cancel": return { tone: "cancel", title: "ยกเลิกใบ", main: [T("เพราะ "), T(s.reason, { it: true })], date, chips: [] };
    case "problem": return {
      tone: "info", title: "แจ้งปัญหา", main: [T(s.text), ...(s.qty ? [T(` · ${fmt(s.qty)} ชิ้น`, { dim: true })] : [])], date: null,
      chips: [{ t: CU_SEVERITY[s.severity], tone: s.severity === "high" ? "bad" : "warn" }, ...(s.model ? [{ t: "ปัญหาของรุ่น", tone: "muted" as const }] : [])],
    };
    case "note": return { tone: "info", title: "บันทึกถึงทีม", main: [T(s.text, { it: true })], date: null, chips: [] };
    case "bom_rate": return { tone: "info", title: "ค่าแรงเข้า BOM", main: [T("฿"), T(fmt(s.rate), { b: true }), T("/ชิ้น (ราคากลาง)")], date: null, chips: [] };
  }
}

/**
 * แปลงสิ่งที่เลือก → ขั้นที่จะบันทึกจริง (เรียงตามลำดับ) + ปัญหารายช่อง
 * issues: error = ต้องแก้ (ห้ามบันทึก) · warn = เตือนสีเหลือง บันทึกได้ — กฎแต่ละช่องมาจาก lib/work-entry-rules (ตัวเดียวกับป๊อปจ่ายงานปกติ)
 * errors = ข้อความ error ทั้งหมด (มีชื่อแถวนำหน้า) ไว้โชว์สรุป/ทดสอบ
 */
export function cuBuildSteps(f0: CuFacts, k: CuTargetKey, ticks: CuTicks, inp: CuInputs, wos0: CatchUpWo[] = []): { steps: CuStep[]; errors: string[]; issues: CuIssue[]; received: number } {
  // ลดจำนวน (ถ้ามี) ทำก่อนทุกขั้น → ขั้นที่เหลือตรวจด้วยจำนวนใหม่ + ใบจ่ายหลังลดยอดค้าง · received = ยอดส่งคืนรวมหลังบันทึก (ไว้เสนอ "ปิดยอดขาด")
  let f = f0, wos = wos0, keepLine = "";
  const meta = { received: f0.received };
  const steps: CuStep[] = [], issues: CuIssue[] = [];
  const D = inp.dates, today = inp.today ?? todayYmd();
  const add = (list: EntryIssue[], where?: string) => { for (const x of list) issues.push(where ? { ...x, where } : x); };
  const done = () => {
    // ข้อมูลเพิ่มเติม (ไม่บังคับ) ต่อท้ายเสมอ — ขั้นสถานะสำเร็จก่อน ปัญหา/หมายเหตุพังทีหลังก็ไม่กระทบสถานะ
    (inp.problems ?? []).forEach((p, i) => {
      if (!p.text.trim()) return;
      if (p.qty != null && p.qty < 0) { issues.push({ level: "error", field: `prob:${p.key}:qty`, msg: "จำนวนติดลบไม่ได้", where: `ปัญหา ${i + 1}` }); return; }
      steps.push({ kind: "problem", text: p.text.trim(), severity: p.severity, qty: p.qty != null && p.qty > 0 ? r2(p.qty) : null, model: p.model });
    });
    const noteText = [keepLine, inp.teamNote?.trim() ?? ""].filter(Boolean).join(" · ");   // รวมเป็นขั้นเดียว (2 ขั้นจะเขียนหมายเหตุทับกัน)
    if (noteText) steps.push({ kind: "note", text: noteText });
    if (inp.bomRate != null && inp.bomRate > 0) steps.push({ kind: "bom_rate", rate: r2(inp.bomRate) });
    if (!issues.some((x) => x.level === "error") && !steps.length) issues.push({ level: "error", field: "target", msg: "ระบบบันทึกขั้นนี้ไว้ครบแล้ว ไม่มีอะไรต้องอัปเดต" });
    return { steps, issues, errors: issues.filter((x) => x.level === "error").map((x) => (x.where ? `${x.where}: ${x.msg}` : x.msg)), received: meta.received };
  };
  const blocked = cuTargetBlocked(f, k);
  if (blocked) { issues.push({ level: "error", field: "target", msg: blocked }); return done(); }
  if (k === "cancel") {
    if (!inp.cancelReason.trim()) issues.push({ level: "error", field: "cancel:reason", msg: "ใส่เหตุผลที่ยกเลิกก่อน" });
    else steps.push({ kind: "cancel", reason: inp.cancelReason.trim(), date: D.cancel });
    add(dateIssues(D.cancel, "cancel:date", { today }));
    return done();
  }
  const red = inp.reduce;
  const dir = cuQtyDir(f.qty, red);
  if (red && dir === "up") {
    const where = "เปลี่ยนจำนวน", reason = cuReduceReason(red);
    if (!isIncreaseMode(red.mode)) issues.push({ level: "error", field: "reduce:mode", msg: "เลือกว่าจะเพิ่มในใบนี้ หรือแยกส่วนเกินเป็นใบใหม่", where });
    else {
      const why = increaseQtyIssue({ qty: f.qty, newQty: red.qty, sized: f.sized, status: f.status });
      if (why) issues.push({ level: "error", field: "reduce:qty", msg: why, where });
      if (!reason) issues.push({ level: "error", field: "reduce:reason", msg: "ใส่เหตุผลที่เพิ่มจำนวน", where });
      if (!why && increaseIsBig(f.qty, red.qty)) issues.push({ level: "warn", field: "reduce:qty", msg: `เพิ่มเกิน 50% (${fmt(f.qty)} → ${fmt(red.qty)}) — ตรวจตัวเลขอีกครั้ง`, where });
      if (!why && reason) {
        steps.push({ kind: "reduce", from: f.qty, to: r2(red.qty), reason, mode: red.mode as IncreaseMode });
        if (red.mode === "add") f = { ...f, qty: r2(red.qty) };
      }
    }
  } else if (red && dir === "down") {
    const where = "ทำได้ไม่ครบ", reason = cuReduceReason(red);
    if (isIncreaseMode(red.mode)) issues.push({ level: "error", field: "reduce:mode", msg: "เลือกว่าที่เหลือจะแยกเป็นใบใหม่ / ไม่ทำแล้ว / ค้างไว้", where });
    else if (red.mode === "keep") {
      if (!(red.qty > 0) || red.qty >= f.qty - EPS) issues.push({ level: "error", field: "reduce:qty", msg: `ใส่จำนวนที่ทำได้ก่อน (น้อยกว่า ${fmt(f.qty)})`, where });
      else keepLine = `ทำได้ก่อน ${fmt(red.qty)}/${fmt(f.qty)} ชิ้น${reason ? ` เพราะ ${reason}` : ""} — ที่เหลือค้างไว้ในใบนี้`;
    } else {
      const why = reduceQtyIssue({ qty: f.qty, newQty: red.qty, received: f.received, sized: f.sized, status: f.status });
      if (why) issues.push({ level: "error", field: "reduce:qty", msg: why, where });
      if (!reason) issues.push({ level: "error", field: "reduce:reason", msg: "ใส่เหตุผลที่ลดจำนวน", where });
      if (!why && reason) {
        steps.push({ kind: "reduce", from: f.qty, to: r2(red.qty), reason, mode: red.mode as ReduceMode });
        wos = cuShrinkWos(wos, red.qty);
        f = { ...f, qty: r2(red.qty), dispatched: r2(Math.min(f.dispatched, red.qty)) };
      }
    }
  }

  const rows = cuRows(f, k, ticks);
  const on = (st: CuStage) => rows.some((r) => r.stage === st && (r.state === "need" || (r.state === "opt" && !!ticks[st])));

  // ── ของครบ / ยังขาดของ / เตรียม / ตัด
  const short = rows.some((r) => r.stage === "have" && r.state === "short");
  const missing = short ? [...new Set(inp.missing ?? [])] : [];
  if (short && f.materials > 0 && missing.length === 0) issues.push({ level: "error", field: "short", msg: "เลือกของที่ยังขาดอย่างน้อย 1 รายการ (หรือเอาติ๊ก \"ยังขาดของอยู่\" ออก)" });
  if (on("have") && !on("prep")) { steps.push({ kind: "skip_buy", date: D.have }); add(dateIssues(D.have, "have:date", { today })); }
  const parts = (["prep", "cut"] as const).filter((p) => on(p));
  if (parts.length) {
    steps.push(missing.length ? { kind: "mark_ready", parts: [...parts], except: missing, date: D.ready } : { kind: "mark_ready", parts: [...parts], date: D.ready });
    add(dateIssues(D.ready, "ready:date", { today }));
  }

  // ── จ่ายงาน: หลายแถว (หลายช่าง/หลายโต๊ะ) · เคยจ่ายไปบางส่วนแล้ว = แถวเดียวที่จำนวน 0 คือไม่จ่ายเพิ่ม
  const remain = r2(f.qty - f.dispatched);
  const cap = new Map<string, number>();   // ใบที่ส่งคืนได้: id ใบเดิม / "new:key" → ชิ้นที่ยังค้างช่าง
  const dateOfRef = new Map<string, string | null>();
  for (const w of wos) if (w.status !== "done") { cap.set(w.id, r2(w.qty - w.received_qty)); dateOfRef.set(w.id, w.dispatch_date); }
  let dispatched = f.dispatched;
  if (on("dispatch")) {
    const skipAll = f.dispatched > EPS && inp.disp.length === 1 && !(inp.disp[0].qty > 0);
    if (!skipAll) {
      const total = r2(inp.disp.reduce((a, l) => a + (l.qty > 0 ? l.qty : 0), 0));
      // จ่ายเกินไม่ได้: ไล่รวมทีละแถว แถวที่ทำให้ยอดรวมเกิน = กรอบแดงที่ช่องจำนวนของแถวนั้น (บอกว่าใส่ได้อีกเท่าไร)
      let before = 0;
      inp.disp.forEach((l, i) => {
        const where = inp.disp.length > 1 ? `แถวจ่าย ${i + 1}` : "จ่ายงาน";
        const rowCap = r2(Math.max(0, remain - before));
        add(dispatchRowIssues({ qty: l.qty, remaining: rowCap, deskName: l.deptId ? (l.deskName ?? "โต๊ะ") : null, crewCount: l.crewCount ?? 1 }, `disp:${l.key}`)
          .map((x) => !x.field.endsWith(":qty") || inp.disp.length < 2 ? x
            : !(l.qty > 0) ? { ...x, msg: "ใส่จำนวน หรือกด ✕ ลบแถวนี้" }
            : { ...x, msg: `เกิน ${fmt(l.qty - rowCap)} ชิ้น — ใส่ได้ ${fmt(rowCap)}` }), where);
        add(wageIssues(l.rate ?? null, inp.centralRate, `disp:${l.key}:rate`), where);
        add(dateIssues(l.date, `disp:${l.key}:date`, { today }), where);
        if (l.qty > 0) before = r2(before + l.qty);
      });
      const rowErr = issues.some((x) => x.level === "error" && x.field.startsWith("disp"));
      for (const l of inp.disp) {
        // นับยอดของแถวจ่ายใหม่ไว้ให้ "ส่งคืน" ตรวจต่อได้เสมอ (แม้แถวจ่ายยังมีจุดต้องแก้ — กันเตือนซ้อนผิด ๆ ว่า "ค้างช่าง 0")
        cap.set(`new:${l.key}`, r2(Math.max(0, l.qty))); dateOfRef.set(`new:${l.key}`, l.date);
        if (!rowErr && l.qty > 0) steps.push({ kind: "dispatch", line: l.key, qty: r2(l.qty), date: l.date, ...(l.rate != null && l.rate > 0 ? { rate: l.rate } : {}), ...(l.note?.trim() ? { note: l.note.trim() } : {}) });
      }
      dispatched = r2(dispatched + total);
      // กติกาเดียวกับลากการ์ด: เตรียม/ตัดไม่ครบ = เตือน (จ่ายต่อได้)
      const nr = notReadyIssue(f.prepDone || on("prep"), f.cutDone || on("cut"));
      if (nr) issues.push(nr);
      if (total > 0 && dispatched < f.qty - EPS) issues.push({ level: "warn", field: "disp", msg: `ยังเหลือ ${fmt(f.qty - dispatched)} ชิ้นที่ยังไม่จ่าย — ใบยังอยู่แท็บรอจ่าย` });
    }
  }

  // ── ช่างส่งคืน: หลายรอบ (ส่งไม่พร้อมกัน) แต่ละรอบมีวันที่ · เลือกได้ว่ามาจากใบไหน
  let received = f.received;
  let lastRetDate: string | null = null;
  if (on("return")) {
    const out = r2(dispatched - received);
    const total = r2(inp.ret.reduce((a, l) => a + (l.qty > 0 ? l.qty : 0), 0));
    if (out <= EPS) issues.push({ level: "error", field: "ret", msg: "ยังไม่มีงานค้างที่ช่างให้ส่งคืน" });
    else {
      const left = new Map(cap);
      let before = 0;   // ไล่รวมทีละรอบ — รอบที่ทำให้เกินที่ค้างช่าง = กรอบแดงที่ช่องจำนวนของรอบนั้น
      inp.ret.forEach((l, i) => {
        const where = inp.ret.length > 1 ? `รอบส่งคืน ${i + 1}` : "ส่งคืน";
        const rowCap = r2(Math.max(0, out - before));
        const base = returnRowIssues({ qty: l.qty, outstanding: rowCap }, `ret:${l.key}`);
        add(base.map((x) => inp.ret.length < 2 ? x
          : !(l.qty > 0) ? { ...x, msg: "ใส่จำนวน หรือกด ✕ ลบรอบนี้" }
          : { ...x, msg: `เกิน ${fmt(l.qty - rowCap)} ชิ้น — ใส่ได้ ${fmt(rowCap)}` }), where);
        if (l.qty > 0) before = r2(before + l.qty);
        if (!base.length && l.ref !== "auto") {
          const c = left.get(l.ref) ?? 0;
          if (l.qty > c + EPS) issues.push({ level: "error", field: `ret:${l.key}:qty`, msg: `ใบนั้นค้างช่างแค่ ${fmt(c)} ชิ้น`, where });
          left.set(l.ref, r2(c - l.qty));
        }
        add(wageIssues(l.wage ?? null, inp.centralRate, `ret:${l.key}:wage`), where);
        add(dateIssues(l.date, `ret:${l.key}:date`, { today, notBefore: l.ref !== "auto" ? dateOfRef.get(l.ref) : null, notBeforeLabel: "วันที่จ่าย" }), where);
        if (l.date && (!lastRetDate || l.date > lastRetDate)) lastRetDate = l.date;
      });
      received = r2(received + Math.min(total, out));   // ตรวจขั้นถัดไปต่อได้แม้รอบส่งคืนยังมีจุดต้องแก้
      meta.received = received;
      if (!issues.some((x) => x.level === "error" && x.field.startsWith("ret"))) {
        // ใบที่ระบุชัดก่อน แล้วค่อย "อัตโนมัติ" (กันอัตโนมัติไปกินยอดของใบที่ระบุ)
        for (const l of [...inp.ret.filter((x) => x.ref !== "auto"), ...inp.ret.filter((x) => x.ref === "auto")])
          steps.push({ kind: "return", ref: l.ref, qty: r2(l.qty), date: l.date, ...(l.wage != null ? { wage: l.wage } : {}) });
        if (k !== "return_part" && received < dispatched - EPS) issues.push({ level: "warn", field: "ret", msg: `ยังอยู่กับช่าง ${fmt(dispatched - received)} ชิ้น` });
      }
    }
  }

  let good = 0;
  if (on("qc_in")) {
    const avail = r2(received - f.qcPulled);
    const qi = qcReceiveIssues({ good: inp.qcGood, bad: inp.qcBad, available: avail, shelfChosen: !!inp.shelfId, reasonChosen: !!inp.badReason?.trim() });
    add(qi, "QC");
    add(dateIssues(D.qc, "qc:date", { today, notBefore: lastRetDate, notBeforeLabel: "วันที่ส่งคืน" }), "QC");
    if (!qi.length) {
      good = r2(inp.qcGood); steps.push({ kind: "qc_in", good, bad: r2(inp.qcBad), date: D.qc });
      const left = r2(avail - (inp.qcGood || 0) - (inp.qcBad || 0));
      if (left > EPS) issues.push({ level: "warn", field: "qc:good", msg: `ยังเหลือรอ QC ${fmt(left)} ชิ้น (ค้างในคิว "รอ QC รับเข้า")`, where: "QC" });
    }
  }

  if (on("ship")) {
    if (good > 0) { steps.push({ kind: "ship", qty: good, date: D.ship, mode: inp.shipMode ?? "sales_wh", wh: inp.shipMode === "sell" ? null : inp.shipWh ?? null }); add(dateIssues(D.ship, "ship:date", { today, notBefore: D.qc, notBeforeLabel: "วันที่ QC รับเข้า" })); }
    else if (!on("qc_in") && f.shelfGood > EPS) issues.push({ level: "error", field: "ship", msg: `ของดีบนชั้น QC เดิม ${fmt(f.shelfGood)} ชิ้น — ส่งออกที่หน้าโกดัง QC` });
    else if (on("qc_in") && !issues.some((x) => x.field.startsWith("qc"))) issues.push({ level: "error", field: "qc:good", msg: "ไม่มีของดีให้ส่งออก" });
  }

  if (on("close")) {
    if (received < f.qty - EPS) issues.push({ level: "error", field: "close", msg: `ปิดใบได้เมื่อช่างส่งคืนครบ ${fmt(f.qty)} ชิ้น (ตอนนี้ ${fmt(received)}) — ทำได้แค่นี้จริง กด "ปิดยอดขาด" ลดจำนวนเหลือ ${fmt(received)}` });
    else { steps.push({ kind: "close", date: D.close }); add(dateIssues(D.close, "close:date", { today, notBefore: D.ship ?? D.qc ?? lastRetDate, notBeforeLabel: "ขั้นก่อนหน้า" })); }
  }
  return done();
}

/** แบ่งจำนวนลงหลายแถวตามลำดับ (เก่าก่อน) ไม่เกินเพดานของแต่ละแถว */
export function cuAllocate<T extends { id: string }>(rows: T[], qty: number, cap: (r: T) => number): { id: string; qty: number }[] {
  const out: { id: string; qty: number }[] = [];
  let left = r2(qty);
  for (const r of rows) {
    if (left <= EPS) break;
    const c = r2(Math.max(0, cap(r)));
    if (c <= EPS) continue;
    const take = r2(Math.min(c, left));
    out.push({ id: r.id, qty: take });
    left = r2(left - take);
  }
  return out;
}

/** โต๊ะตัด/เตรียม = stage "cut" · โต๊ะอื่น = ประกอบ (กติกาเดียวกับป๊อปจ่ายงาน) */
export const stageOfDept = (name: string) => (name.includes("ตัด") || name.includes("เตรียม") ? "cut" : "assemble");

export type CuApi = (url: string, body: unknown, method?: "POST" | "PATCH" | "DELETE") => Promise<Record<string, unknown>>;
export type CuContext = {
  snap: CatchUpSnapshot;
  /** แถวจ่ายงาน key → โต๊ะ + ผลจาก crewFields() (คนรับ / ทั้งโต๊ะ) */
  disp: Record<string, { dept: { id: string; name: string }; who: Record<string, unknown> }>;
  shelfId: string; badReason: string;
};
/** สิ่งที่ต้องทำเพื่อ "ย้อนการอัปเดต" ของขั้นนั้น (เก็บ id ที่เพิ่งสร้าง) · none = ย้อนไม่ได้ + เหตุผล */
export type CuUndo =
  | { kind: "skip_buy" }
  | { kind: "mark_ready"; prepOnly?: string[]; cut?: boolean; flags?: ("prep" | "cut")[]; except?: string[]; impossible?: string }
  | { kind: "dispatch"; woId: string }
  | { kind: "return"; subIds: string[] }
  | { kind: "qc_in"; itemIds: string[] }
  | { kind: "problem"; issueId?: string; parentIssueId?: string }
  | { kind: "note"; prevNote: string | null }
  | { kind: "bom_rate"; newId?: string; prevRate: number | null }
  | { kind: "reduce"; changeId: string; newMo: string | null }
  | { kind: "none"; why: string };
export type CuResult = { step: CuStep; ok: boolean; msg: string; undo?: CuUndo };

/** ขั้นที่ทำแล้วย้อนจากป๊อปนี้ไม่ได้ (ของออกจากชั้น / ปิด-ยกเลิกใบ) → ถ้าสำเร็จแล้ว ปุ่มย้อนจะไม่ให้กด */
export const cuIrreversible = (results: CuResult[]) => results.find((r) => r.ok && r.undo?.kind === "none")?.undo as { kind: "none"; why: string } | undefined;

/**
 * บันทึกทีละขั้นตามลำดับ ผ่าน API เดิม — ขั้นไหนพัง = หยุด (ขั้นหลังพึ่งขั้นก่อน) แล้วรายงานว่าสำเร็จถึงไหน
 * แต่ละขั้นที่สำเร็จเก็บ undo (id ที่สร้าง) ไว้ให้ cuUndo ย้อนได้ · api ต้องโยน Error ข้อความภาษาคนเมื่อไม่สำเร็จ
 */
export async function cuRun(steps: CuStep[], ctx: CuContext, api: CuApi, onProgress?: (i: number) => void, label: (s: CuStep) => string = (s) => cuStepLabel(s)): Promise<CuResult[]> {
  const { snap } = ctx, mo = snap.mo;
  const wos = snap.wos.map((w) => ({ ...w }));
  const newWo = new Map<string, string>();   // key แถวจ่าย → id ใบจ่ายที่เพิ่งสร้าง
  const goodItems: { id: string; qty: number }[] = [];
  const results: CuResult[] = [];
  // ค่าแรง: หน้าจอใส่ "ต่อชิ้น" → ส่งเป็นยอดรวม (เหมือนป๊อปส่งงานหน้า QC) · ไม่ใส่ค่าแรงหรือไม่ใส่วัน = ติดป้าย "ยังไม่ลงวันที่/ค่าแรง"
  const submit = async (woId: string, qty: number, date: string | null, wage?: number | null) => {
    const j = await api("/api/mo/submissions", { wo_id: woId, qty, wage: wage != null ? r2(wage * qty) : null, info_pending: wage == null || !date, quiet: true, ...(date ? { submitted_at: date } : {}) });
    const w = wos.find((x) => x.id === woId); if (w) w.received_qty = r2(w.received_qty + qty);
    return j.id ? String(j.id) : null;
  };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onProgress?.(i);
    let undo: CuUndo | undefined;
    try {
      switch (step.kind) {
        case "reduce": {
          const j = await api(`/api/mo/${mo.id}/reduce-qty`, { qty: step.to, reason: step.reason, mode: step.mode, source: "catch_up" });
          const d = (j.data ?? {}) as { change_id?: string | null; new_mo_no?: string | null; wo_changes?: WoShrink[] };
          // ใบจ่ายที่เซิร์ฟเวอร์ลดยอดค้างให้ → ตามในสำเนา (ขั้นส่งคืนอัตโนมัติจะไม่ไปลงใบที่ลดแล้ว)
          for (const c of d.wo_changes ?? []) {
            const i = wos.findIndex((w) => w.id === c.id);
            if (i < 0) continue;
            if (c.cancel) wos.splice(i, 1); else wos[i] = { ...wos[i], qty: c.to, status: c.status_to };
          }
          if (d.change_id) undo = { kind: "reduce", changeId: String(d.change_id), newMo: d.new_mo_no ?? null };
          break;
        }
        case "skip_buy":
          await api(`/api/mo/${mo.id}/skip-stage`, { stages: ["buy"], skip: true, via: "catch_up",
            reason: `อัปเดตงานย้อนหลัง: ของครบแล้ว${step.date ? ` (ครบเมื่อ ${step.date})` : ""}` }, "PATCH");
          undo = { kind: "skip_buy" };
          break;
        case "mark_ready": {
          await api(`/api/mo/${mo.id}/mark-ready`, { ready: true, parts: step.parts, ...(step.except?.length ? { except: step.except } : {}), ...(step.date ? { done_date: step.date } : {}) }, "PATCH");
          // ย้อนได้แม่น = คืนเฉพาะตัวที่ "เพิ่งติ๊ก" · ตัดไว้บางส่วนก่อนหน้า = ไม่รู้ว่าบล็อกไหนเดิม → ให้ย้อนเองที่หน้าใบสั่งผลิต
          const ex = new Set(step.except ?? []);
          if (!mo.has_bom) undo = { kind: "mark_ready", flags: step.parts.filter((p) => (p === "prep" ? !mo.prep_done : !mo.cut_done)) };
          else undo = {
            kind: "mark_ready", except: step.except,
            prepOnly: step.parts.includes("prep") ? snap.materials.filter((x) => !x.ready && !ex.has(x.sku)).map((x) => x.sku) : undefined,
            cut: step.parts.includes("cut") && mo.cut_ready === 0,
            impossible: step.parts.includes("cut") && mo.cut_ready > 0 ? "เดิมตัดไว้บางส่วน — ย้อนติ๊ก \"ตัด\" เองที่หน้าใบสั่งผลิต" : undefined,
          };
          break;
        }
        case "dispatch": {
          const d = ctx.disp[step.line];
          if (!d) throw new Error("ยังไม่ได้เลือกโต๊ะ");
          const j = await api("/api/mo/work-orders", {
            mo_no: mo.mo_no, product_sku: mo.product_sku, product_name: mo.product_name,
            stage: stageOfDept(d.dept.name), department_id: d.dept.id, department_name: d.dept.name,
            ...d.who, qty: step.qty, uom: "ชิ้น", dispatch_date: step.date,
            // ค่าแรง/ชิ้น × จำนวน (ไม่ใส่ = เซิร์ฟเวอร์เติมจากราคากลางในสูตรให้เอง — เหมือนจ่ายงานหลายใบ)
            ...(step.rate ? { labor_cost: r2(step.rate * step.qty) } : {}),
            due_date: mo.internal_due_date || mo.due_date || null, quiet: true,
            note: step.note ? `${step.note} · อัปเดตย้อนหลัง` : `อัปเดตงานย้อนหลัง (ใบสั่งผลิต ${mo.mo_no})`,
          });
          const id = String(j.id);
          newWo.set(step.line, id);
          wos.push({ id, wo_no: String(j.wo_no ?? ""), qty: step.qty, received_qty: 0, qc_pulled_qty: 0, status: "dispatched",
            department_name: d.dept.name, assignee_name: String(d.who.assignee_name ?? ""), dispatch_date: step.date, created_at: new Date().toISOString(), labor_cost: step.rate ? r2(step.rate * step.qty) : 0 });
          undo = { kind: "dispatch", woId: id };
          break;
        }
        case "return": {
          const subIds: string[] = [];
          if (step.ref === "auto") {
            for (const a of cuAllocate(wos.filter((w) => w.status !== "done"), step.qty, (w) => w.qty - w.received_qty)) {
              const sid = await submit(a.id, a.qty, step.date, step.wage); if (sid) subIds.push(sid);
            }
          } else {
            const id = step.ref.startsWith("new:") ? newWo.get(step.ref.slice(4)) : step.ref;
            if (!id) throw new Error("หาใบจ่ายงานของรอบนี้ไม่เจอ");
            const sid = await submit(id, step.qty, step.date, step.wage); if (sid) subIds.push(sid);
          }
          undo = { kind: "return", subIds };
          break;
        }
        case "qc_in": {
          const capQ = new Map(wos.map((w) => [w.id, r2(w.received_qty - w.qc_pulled_qty)]));
          const goodBy = cuAllocate(wos, step.good, (w) => capQ.get(w.id) ?? 0);
          for (const a of goodBy) capQ.set(a.id, r2((capQ.get(a.id) ?? 0) - a.qty));
          const badBy = cuAllocate(wos, step.bad, (w) => capQ.get(w.id) ?? 0);
          const itemIds: string[] = [];
          for (const w of wos) {
            const g = goodBy.find((a) => a.id === w.id)?.qty ?? 0, b = badBy.find((a) => a.id === w.id)?.qty ?? 0;
            if (g + b <= EPS) continue;
            const j = await api("/api/qc-warehouse/items", { action: "receive", wo_id: w.id, shelf_id: ctx.shelfId, good: g,
              bad: b > 0 ? [{ reason: ctx.badReason.trim() || "ของเสีย (อัปเดตย้อนหลัง)", qty: b }] : [], quiet: true, ...(step.date ? { date: step.date } : {}) });
            for (const it of (j.items as { id: string; status: string; qty: number }[] | undefined) ?? []) {
              itemIds.push(it.id);
              if (it.status === "good") goodItems.push({ id: it.id, qty: it.qty });
            }
            w.qc_pulled_qty = r2(w.qc_pulled_qty + g + b);
          }
          undo = { kind: "qc_in", itemIds };
          break;
        }
        case "ship":
          // ปลายทางเหมือนป๊อปส่งออกหน้าโกดัง QC: เข้าคลังขาย (เลือกคลัง) / ขายออก
          for (const it of goodItems) await api("/api/qc-warehouse/items", { action: "ship", item_id: it.id, mode: step.mode ?? "sales_wh", wh: step.mode === "sell" ? null : step.wh ?? null, ...(step.date ? { date: step.date } : {}) });
          undo = { kind: "none", why: "ส่งออกจากชั้น QC แล้ว — ของออกจากชั้นไปแล้ว ย้อนจากที่นี่ไม่ได้" };
          break;
        case "problem": {
          // กล่อง "ปัญหา" ของใบงาน (ตัวเดียวกับที่แจ้งบนบอร์ด) + ถ้าติ๊ก = ปัญหาของรุ่น (เตือนตอนจ่ายรุ่นนี้ครั้งหน้า)
          const j = await api("/api/mo/issues", { mo_no: mo.mo_no, defect_type: step.text, severity: step.severity, qty: step.qty });
          undo = { kind: "problem", issueId: j.id ? String(j.id) : undefined };
          if (step.model) {
            try {
              const p = await api("/api/parent-sku-issues", { sku: mo.product_sku, problem_text: step.text });
              if (p.id && !p.duplicated) undo = { ...undo, parentIssueId: String(p.id) };   // มีอยู่แล้ว = ไม่ใช่ของเรา ไม่ลบตอนย้อน
            } catch (e) {
              // ปัญหาของใบงานลงแล้ว → แนบ undo ไปกับขั้นที่พัง ให้ย้อนลบได้
              throw Object.assign(new Error(`ลงปัญหาของใบงานแล้ว แต่จำเป็นปัญหาของรุ่นไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`), { undo });
            }
          }
          break;
        }
        case "note": {
          const line = `[อัปเดตงาน ${cuDateText(todayYmd())}] ${step.text}`;
          await api(`/api/mo/${mo.id}`, { note: mo.note ? `${mo.note}\n${line}` : line }, "PATCH");
          undo = { kind: "note", prevNote: mo.note };
          break;
        }
        case "bom_rate": {
          const j = await api("/api/bom/labor-rates", { bom_code: mo.bom_code ?? undefined, product_sku: mo.product_sku, craftsman_id: null, craftsman_name: "ราคากลาง", rate: step.rate });
          undo = { kind: "bom_rate", newId: j.id ? String(j.id) : undefined, prevRate: snap.rates.find((x) => !x.craftsman_id)?.rate ?? null };
          break;
        }
        case "close":
        case "cancel": {
          const j = await api("/api/mo/bulk-status", { ids: [mo.id], action: step.kind, source: "catch_up",
            ...(step.kind === "cancel" ? { reason: step.reason } : {}), ...(step.date ? { date: step.date } : {}) });
          const sk = (j.skipped as { reason: string }[] | undefined) ?? [];
          if (sk.length) throw new Error(sk[0].reason);
          undo = { kind: "none", why: step.kind === "close" ? "ปิดใบแล้ว — ย้อนจากที่นี่ไม่ได้" : "ยกเลิกใบแล้ว — ย้อนจากที่นี่ไม่ได้" };
          break;
        }
      }
      results.push({ step, ok: true, msg: label(step), undo });
    } catch (e) {
      results.push({ step, ok: false, msg: e instanceof Error ? e.message : "ไม่สำเร็จ", undo: (e as { undo?: CuUndo }).undo });
      break;
    }
  }
  return results;
}

/**
 * ย้อนการอัปเดต: ไล่ขั้นที่สำเร็จ "จากหลังไปหน้า" แล้วทำกลับทีละขั้นผ่าน API เดิม (QC → ส่งคืน → ใบจ่าย …)
 * มีขั้นที่ย้อนไม่ได้สำเร็จอยู่ (ส่งออก/ปิด/ยกเลิก) = ไม่ทำอะไรเลย · ขั้นไหนย้อนไม่สำเร็จ = ทำขั้นอื่นต่อ แล้วรายงานรายขั้น
 */
export async function cuUndo(results: CuResult[], ctx: CuContext, api: CuApi, label: (s: CuStep) => string = (s) => cuStepLabel(s)): Promise<{ msg: string; ok: boolean }[]> {
  const block = cuIrreversible(results);
  if (block) return [{ ok: false, msg: block.why }];
  const mo = ctx.snap.mo, out: { msg: string; ok: boolean }[] = [];
  for (const r of [...results].reverse()) {
    if (!r.undo) continue;   // ขั้นที่พังปกติไม่มี undo (ยกเว้นทำไปได้ครึ่งขั้น เช่น ปัญหาของใบงานลงแล้ว)
    const u = r.undo, name = `ย้อน: ${label(r.step)}`;
    try {
      switch (u.kind) {
        case "skip_buy": await api(`/api/mo/${mo.id}/skip-stage`, { stages: ["buy"], skip: false, via: "catch_up" }, "PATCH"); break;
        case "reduce": await api(`/api/mo/${mo.id}/reduce-qty`, { revert: u.changeId }); break;
        case "mark_ready":
          if (u.prepOnly?.length) await api(`/api/mo/${mo.id}/mark-ready`, { ready: false, parts: ["prep"], only: u.prepOnly }, "PATCH");
          if (u.cut) await api(`/api/mo/${mo.id}/mark-ready`, { ready: false, parts: ["cut"], ...(u.except?.length ? { except: u.except } : {}) }, "PATCH");
          if (u.flags?.length) await api(`/api/mo/${mo.id}/mark-ready`, { ready: false, parts: u.flags }, "PATCH");
          if (u.impossible) { out.push({ ok: false, msg: `${name} — ${u.impossible}` }); continue; }
          break;
        case "qc_in": for (const id of u.itemIds) await api("/api/qc-warehouse/items", { action: "return_queue", item_id: id }); break;
        case "return": for (const id of u.subIds) await api(`/api/mo/submissions?id=${encodeURIComponent(id)}`, null, "DELETE"); break;
        case "dispatch": await api(`/api/mo/work-orders/${u.woId}`, null, "DELETE"); break;
        case "problem":
          if (u.parentIssueId) await api(`/api/parent-sku-issues?id=${encodeURIComponent(u.parentIssueId)}`, null, "DELETE");
          if (u.issueId) await api(`/api/mo/issues?id=${encodeURIComponent(u.issueId)}`, null, "DELETE");
          break;
        case "note": await api(`/api/mo/${mo.id}`, { note: u.prevNote }, "PATCH"); break;
        case "bom_rate":
          if (u.newId) await api(`/api/bom/labor-rates?id=${encodeURIComponent(u.newId)}`, null, "DELETE");
          if (u.prevRate) await api("/api/bom/labor-rates", { bom_code: mo.bom_code ?? undefined, product_sku: mo.product_sku, craftsman_id: null, craftsman_name: "ราคากลาง", rate: u.prevRate, note: "คืนค่าเดิม (ย้อนการอัปเดตงาน)" });
          break;
        case "none": continue;
      }
      out.push({ ok: true, msg: name });
    } catch (e) {
      out.push({ ok: false, msg: `${name} — ${e instanceof Error ? e.message : "ไม่สำเร็จ"}` });
    }
  }
  return out;
}

// ── คำขออัปเดตงาน (พนักงานส่ง → หัวหน้ายืนยัน) — เก็บที่ตาราง work_catch_up_requests ผ่าน /api/mo/catch-up/requests

/** สิ่งที่พนักงานกรอกในป๊อป (ครบพอให้หัวหน้าเปิดมาเห็นเหมือนกัน แล้วแก้ต่อได้) + facts ตอนส่ง (ไว้เทียบว่ามีคนแก้ใบหลังส่งไหม) */
export type CuDraft = {
  v: 1;
  target: CuTargetKey; ticks: CuTicks;
  disp: (CuDispLine & { crewIds: string[]; rateSet?: boolean })[];
  ret: CuRetLine[]; retSet: boolean;
  qc: { good: number; bad: number }; qcSet: boolean;
  dates: CuDates; shelfId: string; badReason: string; cancelReason: string; missing: string[];
  problems: CuProblem[]; teamNote: string; saveBom: boolean;
  shipMode: "sales_wh" | "sell"; shipWh: string;
  facts: CuFacts;
  /** ทำได้ไม่ครบ (คำขอรุ่นใหม่ — ของเก่าไม่มีช่องนี้) */
  reduce?: CuReduce | null;
};

/** สิทธิ์ของโหมดอัปเดตงาน (ตั้งตามตำแหน่ง/รายคน) */
export const CU_PERM = {
  use: "work_board.catch_up",            // ใช้โหมดได้ (ส่งให้หัวหน้ายืนยัน) — คนจ่ายงานได้ใช้ได้อยู่แล้ว
  direct: "work_board.catch_up_direct",  // บันทึกได้เลย ไม่ต้องรอ
  approve: "work_board.catch_up_approve", // ยืนยัน/แก้/ตีกลับ คำขอของคนอื่น
} as const;

/** ใบงานเปลี่ยนอะไรไปบ้างตั้งแต่พนักงานส่งคำขอ — ว่าง = เหมือนเดิม (ยืนยันได้สบายใจ) */
export function cuFactsDiff(before: CuFacts, now: CuFacts): string[] {
  const out: string[] = [];
  const num = (label: string, a: number, b: number) => { if (Math.abs(a - b) > EPS) out.push(`${label} ${fmt(a)} → ${fmt(b)} ชิ้น`); };
  const flag = (label: string, a: boolean, b: boolean) => { if (a !== b) out.push(`${label} ${a ? "ครบ" : "ยังไม่ครบ"} → ${b ? "ครบ" : "ยังไม่ครบ"}`); };
  if (before.status !== now.status) out.push(`สถานะใบ ${before.status} → ${now.status}`);
  num("จำนวนสั่งผลิต", before.qty, now.qty);
  flag("ซื้อของ", before.buyDone, now.buyDone);
  flag("เตรียม", before.prepDone, now.prepDone);
  flag("ตัด", before.cutDone, now.cutDone);
  num("จ่ายงาน", before.dispatched, now.dispatched);
  num("ช่างส่งคืน", before.received, now.received);
  num("QC รับเข้า", before.qcPulled, now.qcPulled);
  num("ของบนชั้น QC", before.shelfGood, now.shelfGood);
  return out;
}

/** เวลาส่งคำขอแบบอ่านง่าย: "เมื่อสักครู่" · "15 นาทีที่แล้ว" · "3 ชม.ที่แล้ว" · "เมื่อวาน 14:05" · "27 ต.ค. 09:30" (เวลาไทย) */
export function cuWhen(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const min = Math.floor((now.getTime() - t.getTime()) / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  if (min < 6 * 60) return `${Math.floor(min / 60)} ชม.ที่แล้ว`;
  const th = (d: Date) => new Date(d.getTime() + 7 * 3600000);   // เวลาไทย (UTC+7) ไม่ขึ้นกับเครื่อง
  const a = th(t), b = th(now);
  const hm = `${String(a.getUTCHours()).padStart(2, "0")}:${String(a.getUTCMinutes()).padStart(2, "0")}`;
  const dayDiff = Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86400000);
  if (dayDiff === 0) return `วันนี้ ${hm}`;
  if (dayDiff === 1) return `เมื่อวาน ${hm}`;
  const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${a.getUTCDate()} ${MON[a.getUTCMonth()]} ${hm}`;
}

// ── ตอนนี้ของอยู่ไหน (แท็บ "ทั้งหมด" ของโหมดอัปเดตงาน + หน้าผลลัพธ์หลังบันทึก) — กติกาเดียวกับแท็บบนบอร์ด

/** ขั้นที่ของอยู่ · pend/wip/qc = แท็บบนบอร์ด · shelf/close_wait/closed/cancelled = ไม่อยู่บนบอร์ดแล้ว (หาในแท็บ "ทั้งหมด") */
export type CuWhereKey = "pend" | "wip" | "qc" | "shelf" | "defect" | "close_wait" | "closed" | "cancelled";
export type CuWherePart = { key: CuWhereKey; label: string; qty: number | null };
export type CuWhere = { key: CuWhereKey; label: string; parts: CuWherePart[]; onBoard: boolean };
export type CuWhereInput = {
  qty: number; status: string; dispatched: number; received: number; qcPulled: number;
  shelfAt: { name: string; qty: number; status: string }[];
};
export const CU_WHERE_LABEL: Record<CuWhereKey, string> = {
  pend: "รอจ่าย", wip: "อยู่กับช่าง", qc: "รอ QC รับเข้า", shelf: "อยู่โกดัง QC", defect: "ของเสียในโกดัง QC",
  close_wait: "ครบแล้ว รอปิดใบ", closed: "ปิดใบแล้ว", cancelled: "ยกเลิกแล้ว",
};
/** ลำดับขั้น (เรียงแท็บ "ทั้งหมด") */
export const CU_WHERE_ORDER: CuWhereKey[] = ["pend", "wip", "qc", "shelf", "defect", "close_wait", "closed", "cancelled"];

/** ใบนี้มีของอยู่ขั้นไหนบ้าง (ใบเดียวอยู่หลายขั้นพร้อมกันได้ เช่น จ่ายไปครึ่ง อีกครึ่งรอจ่าย) — ขั้นแรก = ขั้นหลัก */
export function cuLocate(x: CuWhereInput): CuWhere {
  const parts: CuWherePart[] = [];
  const add = (key: CuWhereKey, qty: number | null, label = CU_WHERE_LABEL[key]) => parts.push({ key, label, qty });
  if (x.status === "cancelled") add("cancelled", null);
  else if (x.status === "done") add("closed", null);
  else {
    if (x.qty - x.dispatched > EPS) add("pend", r2(x.qty - x.dispatched));
    if (x.dispatched - x.received > EPS) add("wip", r2(x.dispatched - x.received));
    if (x.received - x.qcPulled > EPS) add("qc", r2(x.received - x.qcPulled));
  }
  for (const s of x.shelfAt) {
    if (!(s.qty > EPS)) continue;
    if (s.status === "good") add("shelf", r2(s.qty), `โกดัง QC · ${s.name}`);
    else add("defect", r2(s.qty), `${s.status === "repairing" ? "ส่งซ่อม" : "ของเสีย"} · ${s.name}`);
  }
  if (!parts.length) add("close_wait", null);
  const key = parts[0].key;
  return { key, label: CU_WHERE_LABEL[key], parts, onBoard: key === "pend" || key === "wip" || key === "qc" };
}

/** ตำแหน่งจากข้อมูลตั้งต้นของป๊อป (GET /api/mo/catch-up) */
export function cuLocateSnap(s: CatchUpSnapshot): CuWhere {
  const f = cuFacts(s);
  return cuLocate({ qty: f.qty, status: f.status, dispatched: f.dispatched, received: f.received, qcPulled: f.qcPulled, shelfAt: s.shelfAt ?? [] });
}
