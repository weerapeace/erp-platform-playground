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

/** แถวจ่ายงาน 1 แถว = ใบจ่ายงาน 1 ใบ (จ่ายหลายช่าง/หลายโต๊ะ = หลายแถว) */
export type CuDispLine = { key: string; deptId: string; qty: number; date: string | null };
/** แถวส่งคืน 1 แถว = ส่งงาน 1 ครั้ง · ref = "auto" (ไล่ใบเก่าก่อน) | id ใบจ่ายเดิม | "new:<key แถวจ่าย>" */
export type CuRetLine = { key: string; ref: string; qty: number; date: string | null };
/** วันที่จริงของแต่ละขั้น (null = จำไม่ได้/ข้าม) */
export type CuDates = { have: string | null; ready: string | null; qc: string | null; ship: string | null; close: string | null; cancel: string | null };
export const CU_NO_DATES: CuDates = { have: null, ready: null, qc: null, ship: null, close: null, cancel: null };
/** missing = รหัสวัตถุดิบที่ "ยังขาด" (ใช้เมื่อติ๊ก short) */
export type CuInputs = {
  disp: CuDispLine[]; ret: CuRetLine[];
  qcGood: number; qcBad: number; shelfId: string; cancelReason: string; missing?: string[]; dates: CuDates;
};
export type CuStep =
  | { kind: "skip_buy"; date: string | null }
  | { kind: "mark_ready"; parts: ("prep" | "cut")[]; except?: string[]; date: string | null }
  | { kind: "dispatch"; line: string; qty: number; date: string | null }
  | { kind: "return"; ref: string; qty: number; date: string | null }
  | { kind: "qc_in"; good: number; bad: number; date: string | null }
  | { kind: "ship"; qty: number; date: string | null }
  | { kind: "close"; date: string | null }
  | { kind: "cancel"; reason: string; date: string | null };

/** "2026-10-12" → "12 ต.ค. 69" · null → "ไม่ระบุวัน" */
export const cuDateText = (d: string | null) => d ? new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "ไม่ระบุวัน";

/** ข้อความสรุปของขั้น · who = ชื่อโต๊ะ/คน ของแถวจ่าย หรือใบที่ส่งคืน (หน้าจอส่งมา) */
export function cuStepLabel(s: CuStep, who?: (s: CuStep) => string): string {
  const w = who?.(s) ?? "";
  const d = "date" in s ? ` · ${cuDateText(s.date)}` : "";
  switch (s.kind) {
    case "skip_buy": return `ติดป้าย "ของครบ (อัปเดตย้อนหลัง)" ที่ขั้นซื้อของ${d}`;
    case "mark_ready": return `ติ๊ก${s.parts.includes("prep") ? " เตรียม" : ""}${s.parts.length === 2 ? " +" : ""}${s.parts.includes("cut") ? " ตัด" : ""} ${s.except?.length ? `ยกเว้นของที่ยังขาด ${s.except.length} รายการ` : "ครบทั้งใบ"}${d}`;
    case "dispatch": return `สร้างใบจ่ายงาน ${fmt(s.qty)} ชิ้น${w ? ` → ${w}` : ""}${d}`;
    case "return": return `บันทึกช่างส่งคืน ${fmt(s.qty)} ชิ้น${w ? ` (${w})` : ""}${d} · ยังไม่ลงค่าแรง`;
    case "qc_in": return `รับเข้าชั้น QC · ของดี ${fmt(s.good)}${s.bad > 0 ? ` · ของเสีย ${fmt(s.bad)}` : ""} ชิ้น${d}`;
    case "ship": return `ส่งออกจากชั้น QC ${fmt(s.qty)} ชิ้น${d}`;
    case "close": return `ปิดใบสั่งผลิต${d}`;
    case "cancel": return `ยกเลิกใบ (เหตุผล: ${s.reason})${d}`;
  }
}

/** แปลงสิ่งที่เลือก → ขั้นที่จะบันทึกจริง (เรียงตามลำดับ) + ข้อผิดพลาดภาษาคน (มี error = ห้ามบันทึก) */
export function cuBuildSteps(f: CuFacts, k: CuTargetKey, ticks: CuTicks, inp: CuInputs, wos: CatchUpWo[] = []): { steps: CuStep[]; errors: string[] } {
  const steps: CuStep[] = [], errors: string[] = [];
  const D = inp.dates;
  const blocked = cuTargetBlocked(f, k);
  if (blocked) return { steps, errors: [blocked] };
  if (k === "cancel") {
    if (!inp.cancelReason.trim()) errors.push("ใส่เหตุผลที่ยกเลิกก่อน");
    else steps.push({ kind: "cancel", reason: inp.cancelReason.trim(), date: D.cancel });
    return { steps, errors };
  }
  const rows = cuRows(f, k, ticks);
  const on = (st: CuStage) => rows.some((r) => r.stage === st && (r.state === "need" || (r.state === "opt" && !!ticks[st])));

  const short = rows.some((r) => r.stage === "have" && r.state === "short");
  const missing = short ? [...new Set(inp.missing ?? [])] : [];
  if (short && f.materials > 0 && missing.length === 0) errors.push("เลือกของที่ยังขาดอย่างน้อย 1 รายการ (หรือเอาติ๊ก \"ยังขาดของอยู่\" ออก)");
  if (on("have") && !on("prep")) steps.push({ kind: "skip_buy", date: D.have });
  const parts = (["prep", "cut"] as const).filter((p) => on(p));
  if (parts.length) steps.push(missing.length ? { kind: "mark_ready", parts: [...parts], except: missing, date: D.ready } : { kind: "mark_ready", parts: [...parts], date: D.ready });

  // ── จ่ายงาน: หลายแถว (หลายช่าง/หลายโต๊ะ) · เคยจ่ายไปบางส่วนแล้ว = จ่ายเพิ่ม 0 ได้
  const remain = r2(f.qty - f.dispatched);
  const cap = new Map<string, number>();   // ใบที่ส่งคืนได้: id ใบเดิม / "new:key" → ชิ้นที่ยังค้างช่าง
  for (const w of wos) if (w.status !== "done") cap.set(w.id, r2(w.qty - w.received_qty));
  if (on("dispatch")) {
    const lines = inp.disp.filter((l) => l.qty > 0);
    const total = r2(lines.reduce((a, l) => a + l.qty, 0));
    if (inp.disp.some((l) => l.qty < 0)) errors.push("จำนวนที่จ่ายติดลบไม่ได้");
    if (total <= EPS && f.dispatched <= EPS) errors.push("ใส่จำนวนที่จ่ายก่อน");
    if (total > remain + EPS) errors.push(`จ่ายรวม ${fmt(total)} ชิ้น เกินที่เหลือ ${fmt(remain)} ชิ้น`);
    lines.forEach((l) => { if (!l.deptId) errors.push(`แถวจ่าย ${inp.disp.indexOf(l) + 1}: เลือกโต๊ะก่อน`); });
    if (total <= remain + EPS) for (const l of lines) {
      steps.push({ kind: "dispatch", line: l.key, qty: r2(l.qty), date: l.date });
      cap.set(`new:${l.key}`, r2(l.qty));
    }
  }
  const dispatched = r2(f.dispatched + steps.reduce((a, s) => a + (s.kind === "dispatch" ? s.qty : 0), 0));

  // ── ช่างส่งคืน: หลายรอบ (ส่งไม่พร้อมกัน) แต่ละรอบมีวันที่ · เลือกได้ว่ามาจากใบไหน
  let received = f.received;
  if (on("return")) {
    const out = r2(dispatched - received);
    const lines = inp.ret.filter((l) => l.qty > 0);
    const total = r2(lines.reduce((a, l) => a + l.qty, 0));
    if (inp.ret.some((l) => l.qty < 0)) errors.push("จำนวนส่งคืนติดลบไม่ได้");
    if (out <= EPS) errors.push("ยังไม่มีงานค้างที่ช่างให้ส่งคืน");
    else if (total <= EPS) errors.push("ใส่จำนวนที่ช่างส่งคืนก่อน");
    else if (total > out + EPS) errors.push(`ส่งคืนรวม ${fmt(total)} ชิ้น เกินที่ค้างช่าง ${fmt(out)} ชิ้น`);
    else {
      const left = new Map(cap);
      let bad = false;
      for (const l of lines.filter((x) => x.ref !== "auto")) {
        const c = left.get(l.ref) ?? 0;
        if (l.qty > c + EPS) { errors.push(`รอบส่งคืน ${inp.ret.indexOf(l) + 1}: ใบนั้นค้างช่างแค่ ${fmt(c)} ชิ้น`); bad = true; }
        left.set(l.ref, r2(c - l.qty));
      }
      if (!bad) {
        // ใบที่ระบุชัดก่อน แล้วค่อย "อัตโนมัติ" (กันอัตโนมัติไปกินยอดของใบที่ระบุ)
        for (const l of [...lines.filter((x) => x.ref !== "auto"), ...lines.filter((x) => x.ref === "auto")]) steps.push({ kind: "return", ref: l.ref, qty: r2(l.qty), date: l.date });
        received = r2(received + total);
      }
    }
  }

  let good = 0;
  if (on("qc_in")) {
    const avail = r2(received - f.qcPulled);
    const tot = r2((inp.qcGood || 0) + (inp.qcBad || 0));
    if (avail <= EPS) errors.push("ไม่มีของรอ QC รับเข้า");
    else if (inp.qcGood < 0 || inp.qcBad < 0 || !(tot > 0) || tot > avail + EPS) errors.push(`ของดี + ของเสีย ต้องรวมกัน 1 ถึง ${fmt(avail)} ชิ้น`);
    else if (inp.qcGood > 0 && !inp.shelfId) errors.push("เลือกชั้นที่วางของดีก่อน");
    else { good = r2(inp.qcGood); steps.push({ kind: "qc_in", good, bad: r2(inp.qcBad), date: D.qc }); }
  }

  if (on("ship")) {
    if (good > 0) steps.push({ kind: "ship", qty: good, date: D.ship });
    else if (!on("qc_in") && f.shelfGood > EPS) errors.push(`ของดีบนชั้น QC เดิม ${fmt(f.shelfGood)} ชิ้น — ส่งออกที่หน้าโกดัง QC`);
    else if (on("qc_in")) errors.push("ไม่มีของดีให้ส่งออก");
  }

  if (on("close")) {
    if (received < f.qty - EPS) errors.push(`ปิดใบได้เมื่อช่างส่งคืนครบ ${fmt(f.qty)} ชิ้น (ตอนนี้ ${fmt(received)})`);
    else steps.push({ kind: "close", date: D.close });
  }
  if (!errors.length && !steps.length) errors.push("ระบบบันทึกขั้นนี้ไว้ครบแล้ว ไม่มีอะไรต้องอัปเดต");
  return { steps, errors };
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

export type CuApi = (url: string, body: unknown, method?: "POST" | "PATCH") => Promise<Record<string, unknown>>;
export type CuContext = {
  snap: CatchUpSnapshot;
  /** แถวจ่ายงาน key → โต๊ะ + ผลจาก crewFields() (คนรับ / ทั้งโต๊ะ) */
  disp: Record<string, { dept: { id: string; name: string }; who: Record<string, unknown> }>;
  shelfId: string; badReason: string;
};
export type CuResult = { step: CuStep; ok: boolean; msg: string };

/**
 * บันทึกทีละขั้นตามลำดับ ผ่าน API เดิม — ขั้นไหนพัง = หยุด (ขั้นหลังพึ่งขั้นก่อน) แล้วรายงานว่าสำเร็จถึงไหน
 * api ต้องโยน Error ข้อความภาษาคนเมื่อไม่สำเร็จ
 */
export async function cuRun(steps: CuStep[], ctx: CuContext, api: CuApi, onProgress?: (i: number) => void, label: (s: CuStep) => string = (s) => cuStepLabel(s)): Promise<CuResult[]> {
  const { snap } = ctx, mo = snap.mo;
  const wos = snap.wos.map((w) => ({ ...w }));
  const newWo = new Map<string, string>();   // key แถวจ่าย → id ใบจ่ายที่เพิ่งสร้าง
  const goodItems: { id: string; qty: number }[] = [];
  const results: CuResult[] = [];
  const submit = async (woId: string, qty: number, date: string | null) => {
    await api("/api/mo/submissions", { wo_id: woId, qty, wage: null, info_pending: true, quiet: true, ...(date ? { submitted_at: date } : {}) });
    const w = wos.find((x) => x.id === woId); if (w) w.received_qty = r2(w.received_qty + qty);
  };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onProgress?.(i);
    try {
      switch (step.kind) {
        case "skip_buy":
          await api(`/api/mo/${mo.id}/skip-stage`, { stages: ["buy"], skip: true, via: "catch_up",
            reason: `อัปเดตงานย้อนหลัง: ของครบแล้ว${step.date ? ` (ครบเมื่อ ${step.date})` : ""}` }, "PATCH");
          break;
        case "mark_ready":
          await api(`/api/mo/${mo.id}/mark-ready`, { ready: true, parts: step.parts, ...(step.except?.length ? { except: step.except } : {}), ...(step.date ? { done_date: step.date } : {}) }, "PATCH");
          break;
        case "dispatch": {
          const d = ctx.disp[step.line];
          if (!d) throw new Error("ยังไม่ได้เลือกโต๊ะ");
          const j = await api("/api/mo/work-orders", {
            mo_no: mo.mo_no, product_sku: mo.product_sku, product_name: mo.product_name,
            stage: stageOfDept(d.dept.name), department_id: d.dept.id, department_name: d.dept.name,
            ...d.who, qty: step.qty, uom: "ชิ้น", dispatch_date: step.date,
            due_date: mo.internal_due_date || mo.due_date || null, note: `อัปเดตงานย้อนหลัง (ใบสั่งผลิต ${mo.mo_no})`, quiet: true,
          });
          const id = String(j.id);
          newWo.set(step.line, id);
          wos.push({ id, wo_no: String(j.wo_no ?? ""), qty: step.qty, received_qty: 0, qc_pulled_qty: 0, status: "dispatched",
            department_name: d.dept.name, assignee_name: String(d.who.assignee_name ?? ""), dispatch_date: step.date, created_at: new Date().toISOString() });
          break;
        }
        case "return":
          if (step.ref === "auto") {
            for (const a of cuAllocate(wos.filter((w) => w.status !== "done"), step.qty, (w) => w.qty - w.received_qty)) await submit(a.id, a.qty, step.date);
          } else {
            const id = step.ref.startsWith("new:") ? newWo.get(step.ref.slice(4)) : step.ref;
            if (!id) throw new Error("หาใบจ่ายงานของรอบนี้ไม่เจอ");
            await submit(id, step.qty, step.date);
          }
          break;
        case "qc_in": {
          const capQ = new Map(wos.map((w) => [w.id, r2(w.received_qty - w.qc_pulled_qty)]));
          const goodBy = cuAllocate(wos, step.good, (w) => capQ.get(w.id) ?? 0);
          for (const a of goodBy) capQ.set(a.id, r2((capQ.get(a.id) ?? 0) - a.qty));
          const badBy = cuAllocate(wos, step.bad, (w) => capQ.get(w.id) ?? 0);
          for (const w of wos) {
            const g = goodBy.find((a) => a.id === w.id)?.qty ?? 0, b = badBy.find((a) => a.id === w.id)?.qty ?? 0;
            if (g + b <= EPS) continue;
            const j = await api("/api/qc-warehouse/items", { action: "receive", wo_id: w.id, shelf_id: ctx.shelfId, good: g,
              bad: b > 0 ? [{ reason: ctx.badReason.trim() || "ของเสีย (อัปเดตย้อนหลัง)", qty: b }] : [], quiet: true, ...(step.date ? { date: step.date } : {}) });
            for (const it of (j.items as { id: string; status: string; qty: number }[] | undefined) ?? []) if (it.status === "good") goodItems.push({ id: it.id, qty: it.qty });
            w.qc_pulled_qty = r2(w.qc_pulled_qty + g + b);
          }
          break;
        }
        case "ship":
          for (const it of goodItems) await api("/api/qc-warehouse/items", { action: "ship", item_id: it.id, mode: "catch_up", wh: null, ...(step.date ? { date: step.date } : {}) });
          break;
        case "close":
        case "cancel": {
          const j = await api("/api/mo/bulk-status", { ids: [mo.id], action: step.kind, source: "catch_up",
            ...(step.kind === "cancel" ? { reason: step.reason } : {}), ...(step.date ? { date: step.date } : {}) });
          const sk = (j.skipped as { reason: string }[] | undefined) ?? [];
          if (sk.length) throw new Error(sk[0].reason);
          break;
        }
      }
      results.push({ step, ok: true, msg: label(step) });
    } catch (e) {
      results.push({ step, ok: false, msg: e instanceof Error ? e.message : "ไม่สำเร็จ" });
      break;
    }
  }
  return results;
}
