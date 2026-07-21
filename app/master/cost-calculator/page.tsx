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

  // effInputs: ใส่ qty + ค่าแรงกลางที่แก้ในหน้า (centralOverride) → deriveCost คิด substitutes จาก materials ให้เอง
  const eff = useMemo(() => inputs ? { ...inputs, qty, central_rate: centralOverride ?? inputs.central_rate } : null, [inputs, qty, centralOverride]);
  const d = useMemo(() => eff ? deriveCost(eff, sc) : null, [eff, sc]);

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

  // จับกลุ่ม "ตามวัตถุดิบ" — รวมบรรทัดวัสดุตัวเดียวกันเป็นแถวเดียว (บวกจำนวน) เรียงตามราค���มาก→น้อย
  const matRows = useMemo(() => {
    if (!inputs) return [] as MoCostMaterial[];
    const g = new Map<string, MoCostMaterial>();
    for (const m of inputs.materials) {
      const key = m.sku || m.name || "?";
      const ex = g.get(key);
      if (ex) ex.qty_per = Math.round((ex.qty_per + m.qty_per) * 10000) / 10000;
      else g.set(key, { ...m });
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
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🧮 คำนวณต้นทุนสินค้า</h1>
          <p className="text-sm text-slate-500 mt-0.5">เลือกสินค้า → คิดต้นทุน/กำไร + ลองว่า “จ่ายงานกี่บาท / ทำกี่วัน” → บันทึกเป็นต้นทุนมาตรฐาน</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <div className="text-[11px] text-slate-500">สินค้า (เลือก SKU เพื่อดึงสูตร/ราคา)</div>
          <SkuPicker value={sku} onChange={setSku} placeholder="เลือกสินค้า…" />
          {inputs && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
              {inputs.parent_code && <span>รุ่น (Parent): <b className="text-slate-700">{inputs.parent_code}</b></span>}
              <span>สูตร: {inputs.bom_code ? <b className="text-slate-700">{inputs.bom_code}</b> : <span className="text-amber-600">— ยังไม่มี BOM —</span>}</span>
              <label className="flex items-center gap-1">จำนวน (ต่อล็อต): <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="w-20 h-7 px-2 text-right border border-slate-200 rounded-lg" /></label>
            </div>
          )}
        </div>

        {loading && <div className="text-center text-slate-400 py-8 text-sm">กำลังคิดต้นทุน…</div>}

        {inputs && d && (
          <>
            {/* สรุปต่อชิ้น */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 flex justify-between"><span>สรุปต่อชิ้น</span><span>จำนวน {fmt(qty)} ชิ้น</span></div>
              <div className="divide-y divide-slate-50 text-sm">
                <Row label="💵 ราคาขาย / ชิ้น" amount={d.sell} strong cls="text-slate-800" />
                <Row label="วัตถุดิบ / ชิ้น" amount={d.matPP} neg sub={inputs.missing_price > 0 ? `⚠️ ${inputs.missing_price} รายการยังไม่มีราคา` : undefined} />
                <Row label={laborModeLabel(sc.labor_mode)} amount={d.laborPP} neg
                  sub={sc.labor_mode === "system" ? `ค่าแรงกลาง ฿${fmt(d.central)}` : sc.labor_mode === "table" ? (d.tableCalc === "target" ? `เสร็จใน ≤ ${fmt(d.maxDays)} วัน` : d.daysNeeded > 0 ? `ทำ ${fmt(Math.ceil(d.daysNeeded))} วัน` : undefined) : sc.labor_mode === "target" ? "งบที่จ่ายได้ตามเป้าหมาย" : `${d.effPieceJobs.length} งานเหมา`} />
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
                  {effJobs.map((j, i) => (
                    <div key={i} className="flex items-center gap-1.5 flex-wrap">
                      <input list="pw-jobs" value={j.label} disabled={!canEdit} onChange={(e) => setJob(i, { label: e.target.value })} placeholder="เลือก/พิมพ์ชื่องาน เช่น เย็บ" className="flex-1 min-w-[100px] h-8 px-2 text-sm border border-slate-200 rounded-lg" />
                      <input type="number" step="any" value={j.rate || ""} disabled={!canEdit} onChange={(e) => setJob(i, { rate: Number(e.target.value) || 0 })} placeholder="฿/ชิ้น" className={numIn} />
                      <span className="text-[11px] text-slate-400">×{fmt(j.qty_per)}</span>
                      {canEdit && <button onClick={() => delJob(i)} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>}
                    </div>
                  ))}
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
                <span>📦 วัตถุดิบ ({matRows.length} ชนิด) · รวม <b className="text-slate-700">฿{fmt(d.matPP)}</b>/ชิ้น</span><span className="text-slate-400">{showMat ? "▲" : "▼"}</span>
              </button>
              {showMat && (
                <div className="border-t border-slate-100 divide-y divide-slate-50 text-[12px]">
                  {matRows.map((m) => ({ m, sub: m.sku ? subMap.get(m.sku) : undefined }))
                    .map((x) => ({ ...x, unit: x.sub ? x.sub.unit_cost : x.m.unit_cost }))
                    .sort((a, b) => (b.unit * b.m.qty_per) - (a.unit * a.m.qty_per))
                    .map(({ m, sub, unit }, i) => {
                      const linePP = Math.round(unit * m.qty_per * 100) / 100;
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="min-w-0 truncate">
                            {sub ? <span className="text-indigo-700">🔁 {sub.sub_name} <span className="text-[10px] text-indigo-400">(แทน {m.name})</span></span> : <span className="text-slate-600">{m.name || m.sku}</span>}
                            <span className="text-slate-300"> ×{fmt(m.qty_per)}</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`tabular-nums ${unit > 0 ? "text-slate-600" : "text-amber-600"}`}>{unit > 0 ? `฿${fmt(linePP)}` : "ยังไม่มีราคา"}</span>
                            {canEdit && m.sku && (sub
                              ? <button onClick={() => clearSub(m.sku!)} title="คืนวัสดุเดิม" className="text-[10px] text-slate-400 hover:text-rose-500">คืนเดิม</button>
                              : <button onClick={() => setSubFor(m)} title="ใช้วัตถุดิบทดแทน" className="text-[13px] text-indigo-400 hover:text-indigo-700">🔁</button>)}
                          </span>
                        </div>
                      );
                    })}
                  {inputs.materials.length === 0 && <div className="px-3 py-4 text-center text-slate-400 text-[12px]">— ไม่มีวัตถุดิบใน BOM —</div>}
                </div>
              )}
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

            {/* เลือกวัตถุดิบทดแทน (เก็บใน scenario) */}
            {subFor && (
              <ERPModal open onClose={() => setSubFor(null)} size="sm" title={`🔁 ใช้วัตถุดิบทดแทนของ: ${subFor.name || subFor.sku}`}>
                <div className="space-y-2">
                  <p className="text-[12px] text-slate-500">เลือกวัสดุอื่นมาแทนในการคิดต้นทุน (ไม่แตะ BOM จริง)</p>
                  <ComponentPicker sku="" name="" placeholder="ค้นหา/เลือกวัตถุดิบทดแทน…" onPick={setSub} />
                </div>
              </ERPModal>
            )}
          </>
        )}
    </div>
  );
}
