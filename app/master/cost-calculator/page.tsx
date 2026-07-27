"use client";

/**
 * 🧮 คำนวณต้นทุนสินค้า — module กลาง
 * เลือกสินค้า (SKU ลูก เพื่อดึง BOM/ราคา) → คิดต้นทุน/กำไร + ลอง scenario ค่าแรง
 * → บันทึกเป็น "ต้นทุนมาตรฐาน" ที่ Parent (ทุกสี) หรือ SKU นี้ (override)
 * สูตรคิด = ของกลาง lib/cost-calc (ตัวเดียวกับแท็บต้นทุนใน MO)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ComponentPicker } from "@/components/material-picker";
import { ERPModal } from "@/components/modal";
import { deriveCost, normScenario, DEFAULT_SCENARIO, laborModeLabel } from "@/lib/cost-calc";
import type { CostScenario, PieceJob, MoCostMaterial } from "@/app/api/mo/[id]/cost/route";
import type { BomComponent } from "@/app/api/bom/components/route";
import { TrialBomEditor, trialLineCalc, emptyTrialLine, type TrialLine } from "@/components/trial-bom";


type Inputs = {
  product_sku: string; product_name: string; parent_code: string | null; bom_code: string | null;
  sell_price: number; material_cost_pp: number; materials: MoCostMaterial[]; missing_price: number;
  central_rate: number; est_labor_pp: number; system_piece: { job_name: string; rate: number; qty_per: number }[];
};
type Saved = { qty_basis: number; scenario: CostScenario; summary: unknown; created_by_name: string | null; created_at: string } | null;

const fmt = (n: number) => (Math.round((n || 0) * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default function CostCalculatorPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  const { user } = useAuth();
  const toast = useToast();

  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [inputs, setInputs] = useState<Inputs | null>(null);
  const [savedParent, setSavedParent] = useState<Saved>(null);
  const [savedSku, setSavedSku] = useState<Saved>(null);
  const [loading, setLoading] = useState(false);
  const [qty, setQty] = useState(1);
  const [sc, setSc] = useState<CostScenario>(DEFAULT_SCENARIO);
  const [target, setTarget] = useState<"parent" | "sku">("parent");
  const [saving, setSaving] = useState(false);
  const [showMat, setShowMat] = useState(true);
  const [centralOverride, setCentralOverride] = useState<number | null>(null);   // แก้ค่าแรงกลางในหน้า (ก่อนบันทึกกลับ BOM)
  const [savingCentral, setSavingCentral] = useState(false);
  const [subFor, setSubFor] = useState<MoCostMaterial | null>(null);             // วัตถุดิบที่กำลังเลือกตัวแทน (เปิด picker)
  const [openMat, setOpenMat] = useState<Record<string, boolean>>({});           // แถววัสดุที่กางดูรายย่อย
  const [easyMode, setEasyMode] = useState(false);                               // 📱 โหมดง่าย (ตัวใหญ่ กดง่าย) — จำต่อเครื่อง
  useEffect(() => { try { setEasyMode(localStorage.getItem("cost-easy") === "1"); } catch { /* ignore */ } }, []);
  const toggleEasy = () => setEasyMode((v) => { const n = !v; try { localStorage.setItem("cost-easy", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [craftsmen, setCraftsmen] = useState<{ id: string; name: string; department_id?: string | null }[]>([]);
  const [jobNames, setJobNames] = useState<string[]>([]);                        // ชื่องานเหมา distinct (dropdown)
  const [pullSku, setPullSku] = useState<SkuPickerValue | null>(null);           // เลือกรุ่นอื่นดึงงานเหมา

  // โหลดตัวเลือกจ่ายโต๊ะ (แผนก/ช่าง) + รายชื่องานเหมา — ครั้งเดียว
  useEffect(() => {
    apiFetch("/api/mo/departments").then((r) => r.json()).then((j) => setDepartments((j.data ?? j.departments ?? []) as { id: string; name: string }[])).catch(() => {});
    apiFetch("/api/mo/assignees").then((r) => r.json()).then((j) => setCraftsmen((j.data ?? j.assignees ?? []) as { id: string; name: string; department_id?: string | null }[])).catch(() => {});
    apiFetch("/api/bom/piecework?names=1").then((r) => r.json()).then((j) => setJobNames((j.names ?? []) as string[])).catch(() => {});
  }, []);

  const load = useCallback(async (code: string) => {
    setLoading(true); setInputs(null); setCentralOverride(null);
    try {
      const j = await apiFetch(`/api/product-costings?sku=${encodeURIComponent(code)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setInputs(j.inputs as Inputs);
      setSavedParent((j.saved?.parent ?? null) as Saved);
      setSavedSku((j.saved?.sku ?? null) as Saved);
      // ค่าตั้งต้น scenario: override SKU > default Parent > ว่าง · qty จากที่บันทึกไว้
      const eff = (j.saved?.sku ?? j.saved?.parent) as Saved;
      const loadedSc = normScenario(eff?.scenario ?? null);
      if (loadedSc.labor_mode === "target") loadedSc.labor_mode = "system";   // target = งบบนสุดแล้ว ไม่ใช่โหมดจ่าย
      setSc(loadedSc);
      setQty(eff?.qty_basis && eff.qty_basis > 0 ? Number(eff.qty_basis) : 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { if (sku?.code) void load(sku.code); }, [sku, load]);

  // --- BOM 2 ระบบ: "จริง" (จากสูตร) กับ "ทดลอง" (เก็บในใบคิดต้นทุนนี้ ไม่แตะสูตรจริง) ---
  const matMode: "real" | "trial" = sc.mat_mode === "trial" ? "trial" : "real";
  const trialLines = useMemo(() => (sc.trial_lines ?? []) as TrialLine[], [sc.trial_lines]);
  const setTrialLines = useCallback((next: TrialLine[]) => setSc((s) => ({ ...s, trial_lines: next })), []);
  // บรรทัดทดลอง → รูปแบบวัตถุดิบมาตรฐาน เพื่อให้ deriveCost คิดต้นทุนได้เหมือนกัน
  const trialMaterials: MoCostMaterial[] = useMemo(() => trialLines.map((l) => {
    const c = trialLineCalc(l, qty);
    return { sku: l.sku, name: l.name || l.sku, material_type: "ทดลอง", uom: l.uom,
      qty_per: c.qtyPer, unit_cost: l.unit_cost, line_pp: c.amount, has_price: l.unit_cost > 0 };
  }), [trialLines, qty]);

  // ค่าตัด/พิมพ์ ที่ตั้งไว้รายบรรทัดใน BOM ทดลอง (เป็น "ค่าแรง" ไม่ใช่ค่าวัตถุดิบ)
  const trialJobPP = useMemo(
    () => (matMode === "trial" ? trialLines.reduce((a, l) => a + trialLineCalc(l, qty).jobPP, 0) : 0),
    [matMode, trialLines, qty]);

  // effInputs: ใส่ qty + ค่าแรงกลางที่แก้ในหน้า (centralOverride) → deriveCost คิด substitutes จาก materials ให้เอง
  const eff = useMemo(() => {
    if (!inputs) return null;
    const base = { ...inputs, qty, central_rate: centralOverride ?? inputs.central_rate };
    return matMode === "trial" ? { ...base, materials: trialMaterials } : base;
  }, [inputs, qty, centralOverride, matMode, trialMaterials]);
  // ค่าตัด/พิมพ์ → ใส่เป็น "ค่าอื่นๆ" ตอนคิดเท่านั้น (ไม่เขียนกลับเข้า sc — ค่าจริงเก็บในบรรทัดทดลองแล้ว กันบวกซ้ำตอนบันทึก)
  const scEff = useMemo<CostScenario>(() => trialJobPP > 0
    ? { ...sc, extras: [...(sc.extras ?? []), { label: "ค่าตัด/พิมพ์ (BOM ทดลอง)", amount: trialJobPP, per: "piece" as const }] }
    : sc, [sc, trialJobPP]);
  const d = useMemo(() => eff ? deriveCost(eff, scEff) : null, [eff, scEff]);

  // แก้ค่าแรงกลาง + บันทึกกลับเข้า BOM (bom_labor_rates craftsman กลาง) → มีผลทุกใบที่ใช้สูตรนี้
  const saveCentral = async () => {
    if (!inputs?.bom_code) { toast.error("สินค้านี้ยังไม่มี BOM"); return; }
    const rate = centralOverride ?? inputs.central_rate;
    setSavingCentral(true);
    try {
      const r = await apiFetch("/api/bom/labor-rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bom_code: inputs.bom_code, craftsman_id: null, craftsman_name: "ราคากลาง", rate }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setInputs((p) => p ? { ...p, central_rate: rate } : p); setCentralOverride(null);
      toast.success(`บันทึกค่าแรงกลางเข้า BOM แล้ว (฿${fmt(rate)}/ชิ้น)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSavingCentral(false); }
  };

  // วัตถุดิบทดแทน: เลือกตัวแทนให้วัสดุ (เก็บใน scenario) / คืนค่าเดิม
  const setSub = (c: BomComponent) => {
    if (!subFor?.sku) { setSubFor(null); return; }
    const orig = subFor.sku;
    setSc((s) => {
      const rest = (s.substitutes ?? []).filter((x) => x.orig_sku !== orig);
      return { ...s, substitutes: [...rest, { orig_sku: orig, sub_sku: c.code, sub_name: c.name, unit_cost: c.standard_price ?? 0 }] };
    });
    setSubFor(null);
  };
  const clearSub = (origSku: string) => setSc((s) => ({ ...s, substitutes: (s.substitutes ?? []).filter((x) => x.orig_sku !== origSku) }));
  const subMap = useMemo(() => new Map((sc.substitutes ?? []).map((x) => [x.orig_sku, x])), [sc.substitutes]);

  // จับกลุ่ม "ตามวัตถุดิบ" — รวมบรรทัดวัสดุตัวเดียวกันเป็นแถวเดียว (บวกจำนวน) + เก็บรายย่อยไว้กดขยาย
  const matRows = useMemo(() => {
    if (!inputs) return [] as { key: string; main: MoCostMaterial; lines: MoCostMaterial[] }[];
    const g = new Map<string, { key: string; main: MoCostMaterial; lines: MoCostMaterial[] }>();
    for (const m of inputs.materials) {
      const key = m.sku || m.name || "?";
      const ex = g.get(key);
      if (ex) { ex.main.qty_per = Math.round((ex.main.qty_per + m.qty_per) * 10000) / 10000; ex.lines.push(m); }
      else g.set(key, { key, main: { ...m }, lines: [m] });
    }
    return [...g.values()];
  }, [inputs]);

  const save = async () => {
    if (!inputs || !d) return;
    const targetCode = target === "parent" ? inputs.parent_code : inputs.product_sku;
    if (!targetCode) { toast.error(target === "parent" ? "สินค้านี้ไม่มี Parent SKU" : "ไม่มีรหัส SKU"); return; }
    setSaving(true);
    try {
      const summary = { material_pp: d.matPP, labor_pp: d.laborPP, extras_pp: d.extrasPP, cost_pp: d.costPP, sell: d.sell, profit_pp: d.profitPP, margin_pct: d.marginPct };
      const j = await apiFetch("/api/product-costings", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: target, target_code: targetCode, qty_basis: qty, scenario: sc, summary }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(target === "parent" ? `บันทึกต้นทุนมาตรฐาน (ทุกสี ${inputs.parent_code}) แล้ว` : `บันทึกต้นทุน SKU ${inputs.product_sku} แล้ว`);
      if (sku?.code) void load(sku.code);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const setTable = (p: Partial<CostScenario["table"]>) => setSc((s) => ({ ...s, table: { ...s.table, ...p } }));
  const setTgt = (p: Partial<NonNullable<CostScenario["target"]>>) => setSc((s) => ({ ...s, target: { type: s.target?.type ?? "margin_pct", value: s.target?.value ?? 0, ...p } }));
  const effJobs: PieceJob[] = (sc.piece_jobs && sc.piece_jobs.length) ? sc.piece_jobs : (inputs?.system_piece ?? []).map((r) => ({ label: r.job_name, kind: "piece" as const, rate: r.rate, qty_per: r.qty_per, salary: 0, workdays: 26, days: 0, dept_name: "" }));
  const setJob = (i: number, p: Partial<PieceJob>) => setSc((s) => ({ ...s, piece_jobs: effJobs.map((j, idx) => idx === i ? { ...j, ...p } : j) }));
  const addJob = () => setSc((s) => ({ ...s, piece_jobs: [...effJobs, { label: "", kind: "piece", rate: 0, qty_per: 1, salary: 0, workdays: 26, days: 0, dept_name: "" }] }));
  const delJob = (i: number) => setSc((s) => ({ ...s, piece_jobs: effJobs.filter((_, idx) => idx !== i) }));
  // ดึงงานเหมาจากสูตรของรุ่นอื่น (reuse /api/product-costings → system_piece)
  const pullPiecework = async (code: string) => {
    try {
      const j = await apiFetch(`/api/product-costings?sku=${encodeURIComponent(code)}`).then((r) => r.json());
      const sp = (j.inputs?.system_piece ?? []) as { job_name: string; rate: number; qty_per: number }[];
      if (!sp.length) { toast.info(`${code} ไม่มีงานเหมาในสูตร`); return; }
      setSc((s) => ({ ...s, piece_jobs: sp.map((r) => ({ label: r.job_name, kind: "piece" as const, rate: r.rate, qty_per: r.qty_per || 1, salary: 0, workdays: 26, days: 0, dept_name: "" })) }));
      toast.success(`ดึงงานเหมาจาก ${code} แล้ว (${sp.length} งาน)`);
    } catch { toast.error("ดึงงานเหมาไม่สำเร็จ"); }
  };
  // เลือกพนักงานรายคน (จ่ายโต๊ะ) → ให้ server รวมเงินเดือน แล้วตั้งเป็นเงินเดือนรวม
  const toggleWorker = (id: string) => {
    const cur = sc.table.worker_ids ?? [];
    const ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setSc((s) => ({ ...s, table: { ...s.table, worker_ids: ids } }));
    void apiFetch(`/api/mo/worker-wage?ids=${encodeURIComponent(ids.join(","))}`).then((r) => r.json())
      .then((j) => { if (!j.error) setSc((s) => ({ ...s, table: { ...s.table, salary: Number(j.total) || 0 } })); }).catch(() => {});
  };

  const numIn = "w-24 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50";
  const modeBtn = (id: CostScenario["labor_mode"], label: string) => (
    <button type="button" onClick={() => setSc((s) => ({ ...s, labor_mode: id }))} disabled={!canEdit}
      className={`h-7 px-2.5 text-xs rounded-lg border ${sc.labor_mode === id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
  );
  const Row = ({ label, amount, neg, strong, cls = "text-slate-700", sub }: { label: string; amount: number; neg?: boolean; strong?: boolean; cls?: string; sub?: string }) => (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <div className="min-w-0"><span className={strong ? "font-semibold text-slate-700" : "text-slate-600"}>{label}</span>{sub && <span className="ml-2 text-[10px] text-slate-400">{sub}</span>}</div>
      <span className={`tabular-nums shrink-0 ${strong ? "font-bold text-base" : ""} ${cls}`}>{neg ? "− " : ""}฿{fmt(Math.abs(amount))}</span>
    </div>
  );

  if (!canView) return <AccessDenied />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🧮 คำนวณต้นทุนสินค้า</h1>
            {!easyMode && <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">เลือกสินค้า → คิดต้นทุน/กำไร + ลองว่า “จ่ายงานกี่บาท / ทำกี่วัน” → บันทึกเป็นต้นทุนมาตรฐาน</p>}
          </div>
          <button onClick={toggleEasy} title="สลับโหมดหน้าจอ" className={`shrink-0 h-10 px-4 text-sm font-medium rounded-xl border-2 ${easyMode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{easyMode ? "🖥 โหมดปกติ" : "📱 โหมดง่าย"}</button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-[11px] text-slate-500">สินค้า (เลือก SKU เพื่อดึงสูตร/ราคา)</div>
          <SkuPicker value={sku} onChange={setSku} placeholder="เลือกสินค้า…" />
          {inputs && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
              {inputs.parent_code && <span>รุ่น (Parent): <b className="text-slate-700">{inputs.parent_code}</b></span>}
              <span>สูตร: {inputs.bom_code ? <b className="text-slate-700">{inputs.bom_code}</b> : <span className="text-amber-600">— ยังไม่มี BOM —</span>}</span>
              {!easyMode && <label className="flex items-center gap-1">จำนวน (ต่อล็อต): <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-20 h-7 px-2 text-right border border-slate-200 rounded-lg" /></label>}
            </div>
          )}
        </div>

        {loading && <div className="text-center text-slate-400 py-8 text-sm">กำลังคิดต้นทุน…</div>}

        {inputs && d && (easyMode ? (
          /* ===== 📱 โหมดง่าย (ตัวใหญ่ กดง่าย เลื่อนยาว) ===== */
          <div className="space-y-3">
            {/* จำนวน */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <div className="text-base font-semibold text-slate-600 mb-2">จำนวนที่ทำ</div>
              <div className="flex items-center gap-3">
                <button onClick={() => setQty((q) => Math.max(1, q - 10))} className="w-14 h-14 rounded-2xl bg-slate-100 text-3xl font-bold text-slate-600 active:bg-slate-200">−</button>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-28 h-14 text-center text-2xl font-bold border-2 border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <button onClick={() => setQty((q) => q + 10)} className="w-14 h-14 rounded-2xl bg-slate-100 text-3xl font-bold text-slate-600 active:bg-slate-200">+</button>
                <span className="text-lg text-slate-400">ชิ้น</span>
              </div>
            </div>

            {/* ผลลัพธ์ */}
            <div className="grid grid-cols-3 gap-3">
              {([["💵 ราคาขาย", d.sell, "text-slate-800"], ["📦 ต้นทุน", d.costPP, "text-slate-800"], ["💰 กำไร", d.profitPP, d.profitPP >= 0 ? "text-emerald-700" : "text-rose-600"]] as const).map(([l, v, c]) => (
                <div key={l} className="rounded-2xl border-2 border-slate-200 bg-white p-3 text-center">
                  <div className="text-sm text-slate-500">{l}/ชิ้น</div>
                  <div className={`text-2xl font-bold tabular-nums ${c}`}>฿{fmt(v)}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-4 text-center">
              <div className="text-base text-emerald-700">กำไรรวม {fmt(qty)} ชิ้น</div>
              <div className={`text-4xl font-extrabold tabular-nums ${d.profitTotal >= 0 ? "text-emerald-700" : "text-rose-600"}`}>฿{fmt(d.profitTotal)}</div>
              <div className="text-sm text-slate-500 mt-0.5">กำไร {d.marginPct}% · ยอดขายรวม ฿{fmt(d.salesTotal)}</div>
            </div>

            {/* อยากได้กำไร (preset) */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3">
              <div className="text-base font-semibold text-slate-600">อยากได้กำไรเท่าไร? <span className="text-sm font-normal text-slate-400">(ไม่บังคับ)</span></div>
              <div className="flex gap-2 flex-wrap">
                {[30, 40, 50, 60].map((p) => {
                  const on = sc.target?.type === "margin_pct" && sc.target?.value === p;
                  return <button key={p} disabled={!canEdit} onClick={() => setSc((s) => ({ ...s, target: { type: "margin_pct", value: p } }))} className={`h-14 px-5 rounded-2xl text-lg font-bold border-2 ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600"}`}>{p}%</button>;
                })}
                {sc.target && <button disabled={!canEdit} onClick={() => setSc((s) => ({ ...s, target: null }))} className="h-14 px-4 rounded-2xl text-base border-2 border-slate-200 text-slate-400">ไม่ตั้ง</button>}
              </div>
              {sc.target && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <div className="text-sm text-slate-600">💰 จ่ายค่าแรงได้ไม่เกิน</div>
                  <div className={`text-3xl font-extrabold ${d.targetLaborPP >= 0 ? "text-emerald-700" : "text-rose-600"}`}>฿{fmt(d.targetLaborPP)}<span className="text-base font-normal text-slate-400">/ชิ้น</span></div>
                </div>
              )}
            </div>

            {/* จ่ายค่าแรงจริง */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3">
              <div className="text-base font-semibold text-slate-600">จ่ายค่าแรงแบบไหน</div>
              <div className="grid grid-cols-3 gap-2">
                {([["system", "🏭 ตามระบบ"], ["piece", "✂️ เหมา/ชิ้น"], ["table", "🪑 จ่ายโต๊ะ"]] as const).map(([m, l]) => (
                  <button key={m} disabled={!canEdit} onClick={() => setSc((s) => ({ ...s, labor_mode: m }))} className={`h-16 rounded-2xl text-base font-bold border-2 ${sc.labor_mode === m ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-600"}`}>{l}</button>
                ))}
              </div>
              {sc.labor_mode === "system" && (
                <div className="flex items-center gap-2 flex-wrap text-lg">
                  <span className="text-slate-600">ค่าแรงกลาง</span>
                  <input type="number" step="any" disabled={!canEdit} value={centralOverride ?? inputs.central_rate ?? ""} onChange={(e) => setCentralOverride(Number(e.target.value) || 0)} className="w-28 h-12 px-3 text-right border-2 border-slate-200 rounded-xl" />
                  <span className="text-slate-400 text-base">฿/ชิ้น</span>
                  {canEdit && inputs.bom_code && <button onClick={() => void saveCentral()} disabled={savingCentral} className="h-12 px-4 text-base border-2 border-emerald-300 text-emerald-700 rounded-xl">💾 บันทึกเข้าสูตร</button>}
                </div>
              )}
              {sc.labor_mode === "piece" && (
                <div className="space-y-2">
                  <datalist id="pw-jobs-e">{jobNames.map((n) => <option key={n} value={n} />)}</datalist>
                  {effJobs.map((j, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <input list="pw-jobs-e" value={j.label} disabled={!canEdit} onChange={(e) => setJob(i, { label: e.target.value })} placeholder="ชื่องาน" className="flex-1 min-w-[120px] h-12 px-3 text-base border-2 border-slate-200 rounded-xl" />
                      <input type="number" step="any" value={j.rate || ""} disabled={!canEdit} onChange={(e) => setJob(i, { rate: Number(e.target.value) || 0 })} placeholder="฿/ชิ้น" className="w-24 h-12 px-3 text-base text-right border-2 border-slate-200 rounded-xl" />
                      <span className="text-slate-400">×</span>
                      <input type="number" step="any" value={j.qty_per || ""} disabled={!canEdit} onChange={(e) => setJob(i, { qty_per: Number(e.target.value) || 1 })} className="w-16 h-12 px-2 text-base text-right border-2 border-slate-200 rounded-xl" />
                      {canEdit && <button onClick={() => delJob(i)} className="w-10 h-12 text-rose-400 text-lg">✕</button>}
                    </div>
                  ))}
                  {canEdit && <button onClick={addJob} className="h-11 px-4 text-base text-indigo-600 border-2 border-indigo-200 rounded-xl">＋ เพิ่มงาน</button>}
                </div>
              )}
              {sc.labor_mode === "table" && (
                <div className="flex items-center gap-2 flex-wrap text-base">
                  <span className="text-slate-600">เงินเดือนโต๊ะ</span>
                  <input type="number" step="any" disabled={!canEdit} value={sc.table.salary || ""} onChange={(e) => setTable({ salary: Number(e.target.value) || 0 })} className="w-28 h-12 px-3 text-right border-2 border-slate-200 rounded-xl" />
                  <span className="text-slate-600">ทำงาน</span>
                  <input type="number" disabled={!canEdit} value={sc.table.workdays || ""} onChange={(e) => setTable({ workdays: Number(e.target.value) || 0 })} className="w-20 h-12 px-3 text-right border-2 border-slate-200 rounded-xl" />
                  <span className="text-slate-600">วัน · ใช้ทำงานนี้</span>
                  <input type="number" step="any" disabled={!canEdit} value={sc.table.days || ""} onChange={(e) => setTable({ days: Number(e.target.value) || 0, calc: "days" })} className="w-20 h-12 px-3 text-right border-2 border-slate-200 rounded-xl" />
                  <span className="text-slate-600">วัน</span>
                </div>
              )}
              {sc.target && (
                <div className={`rounded-xl px-3 py-2 text-base font-medium ${d.laborPP <= d.targetLaborPP + 0.001 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  ใช้ค่าแรง ฿{fmt(d.laborPP)}/ชิ้น · {d.laborPP <= d.targetLaborPP + 0.001 ? `✓ ไม่เกินงบ` : `⚠️ เกินงบ ฿${fmt(d.laborPP - d.targetLaborPP)}`}
                </div>
              )}
            </div>

            {/* บันทึก */}
            {canEdit && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setTarget("parent")} disabled={!inputs.parent_code} className={`h-14 rounded-2xl text-base font-medium border-2 ${target === "parent" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-600"} disabled:opacity-40`}>ทั้งรุ่น (ทุกสี)</button>
                  <button onClick={() => setTarget("sku")} className={`h-14 rounded-2xl text-base font-medium border-2 ${target === "sku" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-600"}`}>เฉพาะสีนี้</button>
                </div>
                <button onClick={() => void save()} disabled={saving} className="w-full h-16 rounded-2xl text-xl font-bold bg-emerald-600 text-white active:bg-emerald-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึกต้นทุน"}</button>
              </div>
            )}

            <button onClick={toggleEasy} className="w-full text-slate-400 text-sm py-3">ดูแบบละเอียด (โหมดปกติ) →</button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            {/* ซ้าย: ตัวคำนวณ (เป้าหมาย/ค่าแรง/วัตถุดิบ) */}
            <div className="space-y-4 min-w-0">

            {/* 🧮 ค่าแรง — งบเป้าหมาย (บนสุด) + โหมดจ่ายจริงเทียบงบ */}
            <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3 space-y-2.5">
              {/* 🎯 งบเป้าหมาย: ตั้งกำไร/ต้นทุนที่อยากได้ → งบค่าแรงที่จ่ายได้ */}
              <div className="rounded-lg bg-white border border-emerald-200 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap text-sm">
                  <span className="text-[11px] font-medium text-emerald-700">🎯 อยากได้:</span>
                  {([["margin_pct", "กำไร %"], ["profit_pp", "กำไร ฿/ชิ้น"], ["cost_pp", "ต้นทุน ฿/ชิ้น"]] as const).map(([t, l]) => (
                    <button key={t} type="button" disabled={!canEdit} onClick={() => setTgt({ type: t })} className={`h-7 px-2 text-xs rounded-lg border ${(sc.target?.type ?? "margin_pct") === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200"}`}>{l}</button>
                  ))}
                  <input type="number" step="any" disabled={!canEdit} value={sc.target?.value ?? ""} onChange={(e) => setTgt({ value: Number(e.target.value) || 0 })} placeholder={(sc.target?.type ?? "margin_pct") === "margin_pct" ? "%" : "฿"} className={numIn} />
                  {sc.target && <button onClick={() => setSc((s) => ({ ...s, target: null }))} className="text-[11px] text-slate-400 hover:text-rose-500">ล้าง</button>}
                </div>
                {sc.target && (
                  <div className="flex items-center justify-between text-sm border-t border-emerald-100 pt-1.5">
                    <span className="text-slate-600">💰 จ่ายค่าแรงได้ไม่เกิน</span>
                    <span className="text-right"><b className={d.targetLaborPP >= 0 ? "text-emerald-700" : "text-rose-600"}>฿{fmt(d.targetLaborPP)}</b><span className="text-[11px] text-slate-400">/ชิ้น · รวม ฿{fmt(Math.max(0, d.targetLaborPP) * qty)}</span></span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500">จ่ายจริงแบบ:</span>
                {modeBtn("system", "ตามระบบ")}{modeBtn("piece", "งานเหมา/ชิ้น")}{modeBtn("table", "จ่ายโต๊ะ (เงินเดือน)")}
              </div>

              {/* เทียบงบ: โหมดจ่ายจริง ใช้เท่าไร เทียบกับงบเป้าหมาย */}
              {sc.target && (
                <div className={`text-[11px] px-2 py-1 rounded-md ${d.laborPP <= d.targetLaborPP + 0.001 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  โหมดนี้ใช้ค่าแรง <b>฿{fmt(d.laborPP)}</b>/ชิ้น · {d.laborPP <= d.targetLaborPP + 0.001 ? `✓ เหลืองบ ฿${fmt(d.targetLaborPP - d.laborPP)}` : `⚠️ เกินงบ ฿${fmt(d.laborPP - d.targetLaborPP)} → กำไรจะไม่ถึงเป้า`}
                </div>
              )}

              {/* ตามระบบ: แก้ค่าแรงกลาง + บันทึกกลับ BOM */}
              {sc.labor_mode === "system" && (
                <div className="flex items-center gap-1.5 flex-wrap text-sm">
                  <label className="flex items-center gap-1">ค่าแรงกลาง <input type="number" step="any" disabled={!canEdit} value={centralOverride ?? inputs.central_rate ?? ""} onChange={(e) => setCentralOverride(Number(e.target.value) || 0)} className={numIn} /> ฿/ชิ้น</label>
                  {canEdit && inputs.bom_code && <button onClick={() => void saveCentral()} disabled={savingCentral} className="h-8 px-3 text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50">{savingCentral ? "…" : "💾 บันทึกเข้า BOM"}</button>}
                  {d.sysPiecePP > 0 && <span className="text-[11px] text-slate-400">+ งานเหมา ฿{fmt(d.sysPiecePP)}/ชิ้น</span>}
                </div>
              )}

              {sc.labor_mode === "piece" && (
                <div className="space-y-1.5">
                  <datalist id="pw-jobs">{jobNames.map((n) => <option key={n} value={n} />)}</datalist>
                  {effJobs.map((j, i) => {
                    const smIn = "w-16 h-8 px-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50";
                    const jobPP = j.kind === "table"
                      ? (qty > 0 && (Number(j.workdays) || 0) > 0 ? ((Number(j.salary) || 0) / (Number(j.workdays) || 1)) * (Number(j.days) || 0) / qty : 0)
                      : (Number(j.rate) || 0) * (Number(j.qty_per) || 1);
                    return (
                      <div key={i} className="border border-slate-100 rounded-lg p-1.5 space-y-1 bg-white">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input list="pw-jobs" value={j.label} disabled={!canEdit} onChange={(e) => setJob(i, { label: e.target.value })} placeholder="เลือก/พิมพ์ชื่องาน เช่น เย็บ" className="flex-1 min-w-[90px] h-8 px-2 text-sm border border-slate-200 rounded-lg" />
                          <button type="button" disabled={!canEdit} onClick={() => setJob(i, { kind: j.kind === "table" ? "piece" : "table" })} title="สลับชนิดงาน" className="h-8 px-2 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">{j.kind === "table" ? "🪑 โต๊ะ" : "✂️ ชิ้น"}</button>
                          <span className="text-[11px] text-slate-500 tabular-nums w-20 text-right">= ฿{fmt(jobPP)}/ชิ้น</span>
                          {canEdit && <button onClick={() => delJob(i)} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>}
                        </div>
                        {j.kind === "piece" ? (
                          <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-slate-500 pl-1">
                            <input type="number" step="any" value={j.rate || ""} disabled={!canEdit} onChange={(e) => setJob(i, { rate: Number(e.target.value) || 0 })} placeholder="฿/ชิ้น" className={smIn} /> ฿/ชิ้น ×
                            <input type="number" step="any" value={j.qty_per || ""} disabled={!canEdit} onChange={(e) => setJob(i, { qty_per: Number(e.target.value) || 1 })} placeholder="จำนวน" title="จำนวนครั้ง/ชิ้น" className={smIn} /> ครั้ง
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-slate-500 pl-1">
                            เงินเดือน <input type="number" step="any" value={j.salary || ""} disabled={!canEdit} onChange={(e) => setJob(i, { salary: Number(e.target.value) || 0 })} className={smIn} /> ÷ ทำงาน
                            <input type="number" value={j.workdays || ""} disabled={!canEdit} onChange={(e) => setJob(i, { workdays: Number(e.target.value) || 0 })} className={smIn} /> วัน/เดือน × ใช้
                            <input type="number" step="any" value={j.days || ""} disabled={!canEdit} onChange={(e) => setJob(i, { days: Number(e.target.value) || 0 })} className={smIn} /> วัน
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between border-t border-indigo-100 pt-1.5 text-sm">
                    <span className="text-slate-500 text-[12px]">รวมค่าแรง ({effJobs.length} งาน · เหมา+โต๊ะ)</span>
                    <span className="tabular-nums font-semibold text-slate-700">฿{fmt(d.pieceJobsPP)}/ชิ้น · รวม ฿{fmt(d.pieceJobsPP * qty)}</span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <button onClick={addJob} className="text-[11px] text-indigo-600 hover:text-indigo-700">＋ เพิ่มงานเหมา</button>
                      <span className="text-slate-300">·</span>
                      <div className="min-w-[190px]"><SkuPicker value={pullSku} onChange={(v) => { if (v?.code) void pullPiecework(v.code); setPullSku(null); }} placeholder="📋 ดึงงานเหมาจากรุ่นอื่น…" /></div>
                    </div>
                  )}
                </div>
              )}

              {sc.labor_mode === "table" && (() => {
                const pickMode = sc.table.pick_mode ?? "table";
                const workerIds = sc.table.worker_ids ?? [];
                const pill = (on: boolean) => `h-7 px-2 text-xs rounded-lg border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200"}`;
                return (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm">
                    <span className="text-[11px] text-slate-500">เลือก:</span>
                    <button type="button" disabled={!canEdit} onClick={() => setTable({ pick_mode: "table" })} className={pill(pickMode === "table")}>โต๊ะทั้งตัว</button>
                    <button type="button" disabled={!canEdit} onClick={() => setTable({ pick_mode: "workers" })} className={pill(pickMode === "workers")}>เลือกพนักงาน</button>
                    {pickMode === "table" && (
                      <select value={sc.table.dept_name ?? ""} disabled={!canEdit} onChange={(e) => setTable({ dept_name: e.target.value })} className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                        <option value="">— เลือกโต๊ะ —</option>
                        {departments.map((dp) => <option key={dp.id} value={dp.name}>{dp.name}</option>)}
                      </select>
                    )}
                  </div>
                  {pickMode === "workers" && (
                    <div className="border border-slate-200 rounded-lg max-h-36 overflow-auto p-1.5">
                      {craftsmen.length === 0 && <div className="text-[11px] text-slate-400 px-1 py-2 text-center">— ไม่มีรายชื่อพนักงาน —</div>}
                      {craftsmen.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-[12px] px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                          <input type="checkbox" checked={workerIds.includes(c.id)} disabled={!canEdit} onChange={() => toggleWorker(c.id)} className="accent-indigo-600" />
                          <span className="truncate">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap text-sm">
                    <label className="flex items-center gap-1">เงินเดือน{pickMode === "workers" ? "รวม" : "โต๊ะ"} <input type="number" step="any" value={sc.table.salary || ""} disabled={!canEdit || pickMode === "workers"} onChange={(e) => setTable({ salary: Number(e.target.value) || 0 })} className={numIn} /></label>
                    <label className="flex items-center gap-1">วันทำงาน/เดือน <input type="number" value={sc.table.workdays || ""} disabled={!canEdit} onChange={(e) => setTable({ workdays: Number(e.target.value) || 0 })} className={numIn} /></label>
                    {pickMode === "workers" && <span className="text-[11px] text-slate-400">เลือก {workerIds.length} คน (รวมเงินเดือนอัตโนมัติ)</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-sm">
                    <span className="text-[11px] text-slate-500">คิดจาก:</span>
                    <button type="button" onClick={() => setTable({ calc: "days" })} disabled={!canEdit} className={`h-7 px-2 text-xs rounded-lg border ${(sc.table.calc ?? "days") === "days" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200"}`}>ใส่จำนวนวัน</button>
                    <button type="button" onClick={() => setTable({ calc: "target" })} disabled={!canEdit} className={`h-7 px-2 text-xs rounded-lg border ${sc.table.calc === "target" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200"}`}>ใส่ค่าแรงเป้าหมาย</button>
                    {(sc.table.calc ?? "days") === "days"
                      ? <label className="flex items-center gap-1">ทำ <input type="number" step="any" value={sc.table.days || ""} disabled={!canEdit} onChange={(e) => setTable({ days: Number(e.target.value) || 0 })} className={numIn} /> วัน</label>
                      : <label className="flex items-center gap-1">฿/ชิ้น <input type="number" step="any" value={sc.table.target_pp || ""} disabled={!canEdit} onChange={(e) => setTable({ target_pp: Number(e.target.value) || 0 })} className={numIn} /></label>}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ค่าแรง/วัน ≈ ฿{fmt(d.dailyPay)} · {d.tableCalc === "target" ? `งบนี้ทำได้ ≤ ${fmt(d.maxDays)} วัน` : `รวม ${fmt(d.daysNeeded)} วัน = จ่ายค่าแรง ฿${fmt(d.laborBudgetTotal)}`}
                  </div>
                </div>
                );
              })()}
            </div>

            {/* วัตถุดิบ — จับกลุ่มตามชนิด + ราคารวมต่อกลุ่ม (เหมือน BOM) + ตัวแทน */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <button onClick={() => setShowMat((v) => !v)} className="w-full px-3 py-2 flex items-center justify-between text-sm text-slate-600">
                <span>📦 วัตถุดิบ ({matMode === "trial" ? `${trialLines.length} ทดลอง` : `${matRows.length} ชนิด`}) · รวม <b className="text-slate-700">฿{fmt(d.matPP)}</b>/ชิ้น</span><span className="text-slate-400">{showMat ? "▲" : "▼"}</span>
              </button>

              {/* สลับ BOM จริง / BOM ทดลอง */}
              {showMat && (
                <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap text-[11px] border-t border-slate-100 pt-2">
                  <span className="text-slate-400">ใช้วัตถุดิบจาก:</span>
                  {([["real", "📋 BOM จริง"], ["trial", "🧪 BOM ทดลอง"]] as const).map(([v, lb]) => (
                    <button key={v} type="button" onClick={() => setSc((s) => ({ ...s, mat_mode: v }))}
                      className={`px-2 py-0.5 rounded-full border ${matMode === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{lb}</button>
                  ))}
                  {matMode === "trial" && inputs.materials.length > 0 && trialLines.length === 0 && (
                    <button type="button"
                      onClick={() => setTrialLines(inputs.materials.map((m, i) => ({
                        ...emptyTrialLine(i), sku: m.sku, name: m.name ?? "", uom: m.uom, unit_cost: m.unit_cost,
                        mode: "manual" as const, qty_per: m.qty_per,
                      })))}
                      className="px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50">⧉ คัดลอกจาก BOM จริง</button>
                  )}
                  {matMode === "trial" && <span className="text-amber-600">· ไม่แตะสูตรจริง</span>}
                  {matMode === "real" && !inputs.bom_code && <span className="text-amber-600">· สินค้านี้ยังไม่มี BOM — ลองใช้โหมดทดลองได้</span>}
                </div>
              )}

              {showMat && matMode === "trial" && (
                <div className="border-t border-slate-100 p-2">
                  <TrialBomEditor lines={trialLines} onChange={setTrialLines} lotQty={qty}
                    realBomCode={inputs.bom_code ?? null} productSku={sku?.code ?? null}
                    productName={inputs.product_name} canEdit={canEdit} craftsmen={craftsmen}
                    onPushed={() => { if (sku?.code) void load(sku.code); }} />
                </div>
              )}

              {showMat && matMode === "real" && (
                <div className="border-t border-slate-100 divide-y divide-slate-50 text-[12px]">
                  {matRows.map((row) => {
                      const m = row.main; const sub = m.sku ? subMap.get(m.sku) : undefined;
                      const unit = sub ? sub.unit_cost : m.unit_cost;
                      return { row, m, sub, unit, linePP: Math.round(unit * m.qty_per * 100) / 100 };
                    })
                    .sort((a, b) => b.linePP - a.linePP)
                    .map(({ row, m, sub, unit, linePP }) => {
                      const open = !!openMat[row.key]; const multi = row.lines.length > 1;
                      return (
                        <div key={row.key}>
                          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                            <button type="button" onClick={() => multi && setOpenMat((s) => ({ ...s, [row.key]: !s[row.key] }))} className={`min-w-0 truncate text-left flex items-center gap-1 ${multi ? "cursor-pointer" : "cursor-default"}`}>
                              {multi && <span className="text-slate-300 text-[9px] shrink-0">{open ? "▼" : "▶"}</span>}
                              {sub ? <span className="text-indigo-700 truncate">🔁 {sub.sub_name} <span className="text-[10px] text-indigo-400">(แทน {m.name})</span></span> : <span className="text-slate-600 truncate">{m.name || m.sku}</span>}
                              <span className="text-slate-300 shrink-0"> ×{fmt(m.qty_per)}{multi ? ` · ${row.lines.length} จุด` : ""}</span>
                            </button>
                            <span className="flex items-center gap-2 shrink-0">
                              <span className="text-right leading-tight">
                                <span className={`tabular-nums block ${unit > 0 ? "text-slate-600" : "text-amber-600"}`}>{unit > 0 ? `฿${fmt(linePP)}` : "ยังไม่มีราคา"}</span>
                                {unit > 0 && <span className="text-[10px] text-slate-400 block">฿{fmt(unit)}/{m.uom || "หน่วย"}</span>}
                              </span>
                              {canEdit && m.sku && (sub
                                ? <button onClick={() => clearSub(m.sku!)} title="คืนวัสดุเดิม" className="text-[10px] text-slate-400 hover:text-rose-500">คืนเดิม</button>
                                : <button onClick={() => setSubFor(m)} title="ใช้วัตถุดิบทดแทน" className="text-[13px] text-indigo-400 hover:text-indigo-700">🔁</button>)}
                            </span>
                          </div>
                          {open && multi && (
                            <div className="bg-slate-50/70 px-3 py-1 space-y-0.5">
                              {row.lines.map((ln, li) => (
                                <div key={li} className="flex items-center justify-between text-[11px] text-slate-500">
                                  <span>• จุดที่ {li + 1} · ×{fmt(ln.qty_per)}</span>
                                  <span className="tabular-nums">฿{fmt(Math.round(unit * ln.qty_per * 100) / 100)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {inputs.materials.length === 0 && <div className="px-3 py-4 text-center text-slate-400 text-[12px]">— ไม่มีวัตถุดิบใน BOM —</div>}
                </div>
              )}
            </div>
            </div>{/* ปิดคอลัมน์ซ้าย */}

            {/* ขวา: สรุป (ติดหนึบเลื่อนตาม) */}
            <div className="space-y-3 lg:sticky lg:top-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 flex justify-between"><span>สรุปต่อชิ้น</span><span>จำนวน {fmt(qty)} ชิ้น</span></div>
              <div className="divide-y divide-slate-50 text-sm">
                <Row label="💵 ราคาขาย / ชิ้น" amount={d.sell} strong cls="text-slate-800" />
                <Row label="วัตถุดิบ / ชิ้น" amount={d.matPP} neg sub={inputs.missing_price > 0 ? `⚠️ ${inputs.missing_price} รายการยังไม่มีราคา` : undefined} />
                <Row label={laborModeLabel(sc.labor_mode)} amount={d.laborPP} neg
                  sub={sc.labor_mode === "system" ? `ค่าแรงกลาง ฿${fmt(d.central)}` : sc.labor_mode === "table" ? (d.tableCalc === "target" ? `เสร็จใน ≤ ${fmt(d.maxDays)} วัน` : d.daysNeeded > 0 ? `ทำ ${fmt(Math.ceil(d.daysNeeded))} วัน` : undefined) : `${d.effPieceJobs.length} งานเหมา`} />
                {d.extrasPP > 0 && <Row label="ค่าอื่นๆ / ชิ้น" amount={d.extrasPP} neg />}
                <Row label="= กำไร / ชิ้น" amount={d.profitPP} neg={d.profitPP < 0} strong cls={d.profitPP >= 0 ? "text-emerald-700" : "text-rose-600"} sub={`${d.marginPct}% ของราคาขาย`} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["ยอดขายรวม", d.salesTotal, "text-slate-800"], ["ต้นทุนรวม", d.costTotal, "text-slate-800"], ["กำไรรวม", d.profitTotal, d.profitPP >= 0 ? "text-emerald-700" : "text-rose-600"]].map(([l, v, c]) => (
                <div key={l as string} className="rounded-lg bg-white border border-slate-200 px-2 py-2 text-center">
                  <div className="text-[10px] text-slate-400">{l as string}</div><div className={`text-sm font-bold tabular-nums ${c as string}`}>฿{fmt(v as number)}</div>
                </div>
              ))}
            </div>

            {/* บันทึกเป็นต้นทุนมาตรฐาน */}
            {canEdit && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">บันทึกเป็นต้นทุนมาตรฐานของ:</span>
                <button onClick={() => setTarget("parent")} disabled={!inputs.parent_code} className={`h-8 px-3 text-sm rounded-lg border ${target === "parent" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200"} disabled:opacity-40`}>รุ่น (ทุกสี{inputs.parent_code ? ` · ${inputs.parent_code}` : ""})</button>
                <button onClick={() => setTarget("sku")} className={`h-8 px-3 text-sm rounded-lg border ${target === "sku" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200"}`}>เฉพาะ SKU นี้</button>
                <button onClick={() => void save()} disabled={saving} className="h-8 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 ml-auto">{saving ? "บันทึก…" : "💾 บันทึก"}</button>
              </div>
            )}

            {(savedParent || savedSku) && (
              <div className="text-[11px] text-slate-400 space-y-0.5">
                {savedParent && <div>✓ มีต้นทุนมาตรฐานของรุ่น ({inputs.parent_code}) แล้ว · โดย {savedParent.created_by_name?.split("@")[0] ?? "—"}</div>}
                {savedSku && <div>✓ มีต้นทุนเฉพาะ SKU นี้ (override) แล้ว · โดย {savedSku.created_by_name?.split("@")[0] ?? "—"}</div>}
              </div>
            )}
            </div>{/* ปิดคอลัมน์ขวา */}

            {/* เลือกวัตถุดิบทดแทน (เก็บใน scenario) */}
            {subFor && (
              <ERPModal open onClose={() => setSubFor(null)} size="sm" title={`🔁 ใช้วัตถุดิบทดแทนของ: ${subFor.name || subFor.sku}`}>
                <div className="space-y-2">
                  <p className="text-[12px] text-slate-500">เลือกวัสดุอื่นมาแทนในการคิดต้นทุน (ไม่แตะ BOM จริง)</p>
                  <ComponentPicker sku="" name="" placeholder="ค้นหา/เลือกวัตถุดิบทดแทน…" onPick={setSub} />
                </div>
              </ERPModal>
            )}
          </div>
        ))}
    </div>
  );
}
