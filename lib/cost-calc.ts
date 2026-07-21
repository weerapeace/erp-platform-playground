/**
 * cost-calc — สูตรคำนวณต้นทุน/กำไร (ของกลาง)
 *
 * ถอดสูตรจากแท็บต้นทุนในเช็กลิสต์ MO (CostTab) มาเป็นฟังก์ชันบริสุทธิ์ →
 * ใช้ได้ทั้ง module "คำนวณต้นทุน" + แท็บต้นทุน MO (แหล่งคำนวณเดียว ไม่ให้เพี้ยนกัน)
 *
 * โหมดค่าแรง: system(ตามระบบ) · piece(งานเหมา/ชิ้น) · table(จ่ายโต๊ะ เงินเดือน)
 * โหมด table 2 ทาง: ใส่จำนวนวัน→ได้ค่าแรง · ใส่ค่าแรงเป้าหมาย(target_pp)→ได้วันสูงสุด
 */
import type { CostScenario, PieceJob, CostSubstitute, MoCostMaterial } from "@/app/api/mo/[id]/cost/route";

const numOf = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

// ค่าตั้งต้นของ scenario (ว่าง = ใช้ค่าแรงตามระบบ)
export const DEFAULT_SCENARIO: CostScenario = {
  labor_mode: "system", piece_rate: 0, piece_jobs: [],
  table: { salary: 0, workdays: 26, capacity: 0, dept_name: "", calc: "days", days: 0, target_pp: 0, pick_mode: "table", worker_ids: [] },
  extras: [], target: null, substitutes: [],
};

// normalize งานเหมา 1 รายการ (กันค่าหาย/ผิดชนิด)
export const normPieceJob = (j: Partial<PieceJob>): PieceJob => ({
  label: String(j.label ?? ""), kind: j.kind === "table" ? "table" : "piece",
  rate: numOf(j.rate), qty_per: numOf(j.qty_per) || 1, salary: numOf(j.salary),
  workdays: numOf(j.workdays) || 26, days: numOf(j.days), dept_name: String(j.dept_name ?? ""),
});

// normalize scenario ทั้งก้อน (จาก DB/ผู้ใช้)
export function normScenario(s: CostScenario | null | undefined): CostScenario {
  if (!s) return { ...DEFAULT_SCENARIO, table: { ...DEFAULT_SCENARIO.table }, piece_jobs: [], extras: [] };
  return {
    labor_mode: s.labor_mode ?? "system",
    piece_rate: numOf(s.piece_rate),
    piece_jobs: Array.isArray(s.piece_jobs) ? s.piece_jobs.map(normPieceJob) : [],
    table: {
      salary: numOf(s.table?.salary), workdays: numOf(s.table?.workdays) || 26, capacity: numOf(s.table?.capacity),
      dept_name: s.table?.dept_name ?? "", calc: s.table?.calc === "target" ? "target" : "days",
      days: numOf(s.table?.days), target_pp: numOf(s.table?.target_pp),
      pick_mode: s.table?.pick_mode === "workers" ? "workers" : "table",
      worker_ids: Array.isArray(s.table?.worker_ids) ? s.table!.worker_ids! : [],
    },
    extras: Array.isArray(s.extras) ? s.extras : [],
    target: s.target && (s.target.type === "margin_pct" || s.target.type === "profit_pp" || s.target.type === "cost_pp")
      ? { type: s.target.type, value: numOf(s.target.value) } : null,
    substitutes: Array.isArray(s.substitutes)
      ? s.substitutes.map((x): CostSubstitute => ({ orig_sku: String(x.orig_sku ?? ""), sub_sku: String(x.sub_sku ?? ""), sub_name: String(x.sub_name ?? ""), unit_cost: numOf(x.unit_cost) })).filter((x) => x.orig_sku && x.sub_sku)
      : [],
  };
}

// งานเหมา "ตามระบบ" (จาก BOM piecework) — ใช้เป็น fallback ของโหมด piece
export type SystemPiece = { job_name: string; rate: number; qty_per: number };

export type CostInputs = {
  qty: number;
  sell_price: number;           // ราคาขาย/ชิ้น (list_price)
  material_cost_pp: number;     // ต้นทุนวัตถุดิบ/ชิ้น (Σ ใช้/ชิ้น × standard_price) — ใช้ถ้าไม่ส่ง materials
  central_rate: number;         // ค่าแรงกลาง/ชิ้น (เพดาน)
  est_labor_pp: number;         // ค่าแรงผลิตจริง/ชิ้น (ตั้งไว้)
  system_piece?: SystemPiece[]; // งานเหมาจาก BOM (โหมด system + fallback piece)
  materials?: MoCostMaterial[]; // รายการวัตถุดิบ (ถ้าส่งมา → คิด matPP ใหม่ + ใช้ substitutes ได้)
};

export type CostDerived = {
  qty: number; sell: number; matPP: number; central: number; estPP: number; estUsed: number;
  overCeiling: boolean;
  sysPiecePP: number; systemLaborPP: number;
  effPieceJobs: PieceJob[]; pieceJobsPP: number;
  dailyPay: number; tableCalc: "days" | "target"; tablePP: number; maxDays: number; daysNeeded: number;
  targetProfitPP: number; targetLaborPP: number;
  laborPP: number; extrasPP: number; costPP: number; profitPP: number; marginPct: number;
  // ยอดรวมทั้งใบ/ล็อต
  salesTotal: number; costTotal: number; profitTotal: number; laborBudgetTotal: number;
};

const pieceJobPP = (j: PieceJob, qty: number) => j.kind === "table"
  ? (qty > 0 && j.workdays > 0 ? ((numOf(j.salary)) / j.workdays) * numOf(j.days) / qty : 0)
  : numOf(j.rate) * (numOf(j.qty_per) || 1);

/** คำนวณต้นทุน/กำไรทั้งหมดจาก inputs + scenario (บริสุทธิ์ ไม่มี side-effect) */
export function deriveCost(inp: CostInputs, scenario: CostScenario): CostDerived {
  const sc = normScenario(scenario);
  const qty = numOf(inp.qty);
  const sell = numOf(inp.sell_price);
  // ต้นทุนวัตถุดิบ: ถ้าส่ง materials มา → คิดใหม่ (ใช้ราคาตัวแทนถ้ามี substitute) ไม่งั้นใช้ค่าที่ส่งมา
  let matPP = numOf(inp.material_cost_pp);
  const subs = sc.substitutes ?? [];
  if (inp.materials && inp.materials.length) {
    const subMap = new Map(subs.map((x) => [x.orig_sku, x]));
    matPP = Math.round(inp.materials.reduce((a, m) => {
      const sub = m.sku ? subMap.get(m.sku) : undefined;
      const unit = sub ? numOf(sub.unit_cost) : numOf(m.unit_cost);
      return a + unit * numOf(m.qty_per);
    }, 0) * 10000) / 10000;
  }
  const central = numOf(inp.central_rate);
  const estPP = numOf(inp.est_labor_pp);
  const overCeiling = central > 0 && estPP > central + 0.0001;
  const estUsed = estPP > 0 ? estPP : central;

  const sysList = inp.system_piece ?? [];
  const sysPiecePP = sysList.reduce((a, r) => a + numOf(r.rate) * numOf(r.qty_per), 0);
  const systemLaborPP = estUsed + sysPiecePP;

  const effPieceJobs: PieceJob[] = (sc.piece_jobs && sc.piece_jobs.length)
    ? sc.piece_jobs
    : sysList.map((r) => ({ label: r.job_name, kind: "piece" as const, rate: numOf(r.rate), qty_per: numOf(r.qty_per) || 1, salary: 0, workdays: 26, days: 0, dept_name: "" }));
  const pieceJobsPP = effPieceJobs.reduce((a, j) => a + pieceJobPP(j, qty), 0);

  const t = sc.table;
  const dailyPay = t.workdays > 0 ? numOf(t.salary) / t.workdays : 0;
  const tableCalc = t.calc ?? "days";
  const tablePP = tableCalc === "target" ? numOf(t.target_pp) : (qty > 0 ? dailyPay * numOf(t.days) / qty : 0);
  const maxDays = tableCalc === "target" && dailyPay > 0 ? Math.floor((tablePP * qty) / dailyPay) : 0;
  const daysNeeded = tableCalc === "days" ? numOf(t.days) : maxDays;

  const extrasPP = sc.extras.reduce((a, e) => a + (e.per === "mo" ? (qty > 0 ? numOf(e.amount) / qty : 0) : numOf(e.amount)), 0);
  // โหมด target: ใส่เป้าหมาย (กำไร%/กำไร฿/ต้นทุน฿) → งบค่าแรงที่จ่ายได้ = ขาย − วัสดุ − ค่าอื่น − กำไรเป้าหมาย
  const tg = sc.target;
  const targetProfitPP = tg
    ? (tg.type === "margin_pct" ? sell * (numOf(tg.value) / 100) : tg.type === "profit_pp" ? numOf(tg.value) : sell - numOf(tg.value))
    : 0;
  const targetLaborPP = Math.round((sell - matPP - extrasPP - targetProfitPP) * 10000) / 10000;
  const laborPP = sc.labor_mode === "piece" ? pieceJobsPP
    : sc.labor_mode === "table" ? tablePP
    : sc.labor_mode === "target" ? targetLaborPP
    : systemLaborPP;
  const costPP = matPP + laborPP + extrasPP;
  const profitPP = sell - costPP;
  const marginPct = sell > 0 ? Math.round((profitPP / sell) * 1000) / 10 : 0;

  return {
    qty, sell, matPP, central, estPP, estUsed, overCeiling,
    sysPiecePP, systemLaborPP, effPieceJobs, pieceJobsPP,
    dailyPay, tableCalc, tablePP, maxDays, daysNeeded,
    targetProfitPP, targetLaborPP,
    laborPP, extrasPP, costPP, profitPP, marginPct,
    salesTotal: sell * qty, costTotal: costPP * qty, profitTotal: profitPP * qty, laborBudgetTotal: laborPP * qty,
  };
}

export const laborModeLabel = (m: CostScenario["labor_mode"]) =>
  m === "piece" ? "ค่าแรงเหมา / ชิ้น" : m === "table" ? "ค่าแรงจ่ายโต๊ะ / ชิ้น" : m === "target" ? "งบค่าแรงที่จ่ายได้ / ชิ้น" : "ค่าแรง (ตามระบบ) / ชิ้น";
