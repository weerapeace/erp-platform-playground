"use client";

/**
 * 🔄 ป๊อป "อัปเดตงาน" (โหมดอัปเดตงานของบอร์ดจ่ายงาน) — บอกระบบว่าใบนี้ไปถึงขั้นไหนแล้วจริงๆ
 *   ขั้น 1: เลือกสถานะปัจจุบันจากเส้นขั้นตอน → ติ๊กขั้นก่อนหน้าให้ (ของครบ/เตรียม/ตัด เอาออกได้ · ติ๊ก "ยังขาดของ" ได้)
 *   ขั้น 2: เติมเฉพาะข้อมูลที่ยังไม่มี — จ่ายงานหลายแถว (หลายช่าง) · ส่งคืนหลายรอบ · ทุกขั้นมีวันที่ (ข้ามได้ = จำไม่ได้)
 *   ขั้น 3: ผลการบันทึกทีละขั้น (พังขั้นไหน หยุดตรงนั้น บอกว่าสำเร็จถึงไหน)
 * กติกาทั้งหมดอยู่ที่ ./catch-up.ts (ทดสอบแล้ว) · ข้อมูลตั้งต้นจาก GET /api/mo/catch-up
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import { CrewPick, crewFields, crewList, lastCrewIds } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";
import { DeskStaffPanel } from "./desk-staff-panel";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import {
  CU_TARGETS, CU_STAGE_LABEL, CU_NO_DATES, cuFacts, cuRows, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuTargetBlocked, cuStepLabel, cuRun, cuStageDone, cuCanShort,
  type CuTargetKey, type CuTicks, type CuResult, type CuStage, type CuStep, type CuDispLine, type CuRetLine, type CuDates,
} from "./catch-up";

type DeptLite = { id: string; name: string };
/** แถวจ่ายงานบนจอ = แถวตามกติกา + คนรับ */
type DispRow = CuDispLine & { crewIds: string[] };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const numIn = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
const lbl = "mb-1 block text-[12px] text-slate-500";
const addBtn = "h-8 rounded-lg border border-dashed border-indigo-300 px-3 text-[12px] text-indigo-700 hover:bg-indigo-50";
/** สถานะซื้อของรายวัตถุดิบ (lib/mo-material-status) → คำที่โชว์ */
const MAT_LABEL: Record<string, string> = { buy: "ต้องซื้อ", requested: "รออนุมัติ", ordered: "รอของ", received: "ได้ของแล้ว", have: "มีของ", ready: "เตรียมแล้ว", skip: "ไม่ต้องซื้อ" };
/** เส้นขั้นตอน = สถานะที่เลือกได้เรียงตามลำดับ (ยกเลิกใบแยกไว้ล่างสุด) แบ่งหมวดตาม group */
const flow = CU_TARGETS.filter((t) => t.key !== "cancel");
const phases = [...new Set(flow.map((t) => t.group))];

/** ช่องวันที่ของแต่ละขั้น (ว่าง = จำไม่ได้ ข้ามได้) */
function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return <div><label className={lbl}>{label}</label><DispatchDatePick value={value} onChange={onChange} /></div>;
}

export function CatchUpModal({ moNo, onClose, onDone, departments, craftsmen, workOrders, canMoveStaff = false, canAddNew = false, onStaffChanged, onDesksChanged }: {
  /** ใบสั่งผลิตที่จะอัปเดต (null = ปิดป๊อป) */
  moNo: string | null;
  onClose: () => void;
  /** บันทึกแล้วอย่างน้อย 1 ขั้น → ให้หน้าแม่โหลดบอร์ดใหม่ */
  onDone: () => void;
  departments: DeptLite[]; craftsmen: Assignee[]; workOrders: WorkOrder[];
  /** 👥 จัดคนในโต๊ะ (ของกลาง DeskStaffPanel — ตัวเดียวกับป๊อปจ่ายงาน) · ย้ายคน/สร้าง/เปลี่ยนชื่อ/ปิดโต๊ะ = สิทธิ์ฝ่ายบุคคล */
  canMoveStaff?: boolean; canAddNew?: boolean;
  onStaffChanged?: () => void | Promise<void>;
  /** สร้าง/เปลี่ยนชื่อ/ปิดโต๊ะแล้ว → หน้าแม่โหลดโต๊ะใหม่ */
  onDesksChanged?: () => void;
}) {
  const [snap, setSnap] = useState<CatchUpSnapshot | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [page, setPage] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<CuTargetKey | null>(null);
  const [ticks, setTicks] = useState<CuTicks>({});
  const [disp, setDisp] = useState<DispRow[]>([]);      // แถวจ่ายงาน (หลายช่าง = หลายแถว)
  const [ret, setRet] = useState<CuRetLine[]>([]);       // รอบส่งคืน (ส่งไม่พร้อมกัน = หลายรอบ)
  const [qc, setQc] = useState({ good: 0, bad: 0 });
  const [dates, setDates] = useState<CuDates>(CU_NO_DATES);
  const [shelfId, setShelfId] = useState("");
  const [badReason, setBadReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [missing, setMissing] = useState<string[]>([]);   // รหัสวัตถุดิบที่ "ยังขาด"
  const [deskPanelFor, setDeskPanelFor] = useState<string | null>(null);   // แถวจ่ายที่เปิด "จัดคนในโต๊ะ"
  const [running, setRunning] = useState(-1);
  const [results, setResults] = useState<CuResult[]>([]);
  const seq = useRef(0);
  const nk = (p: string) => `${p}${++seq.current}`;

  useEffect(() => {
    if (!moNo) return;
    setSnap(null); setLoadErr(""); setPage(1); setTarget(null); setTicks({}); setDisp([]); setRet([]); setDates(CU_NO_DATES);
    setShelfId(""); setBadReason(""); setCancelReason(""); setMissing([]); setDeskPanelFor(null); setResults([]); setRunning(-1);
    let alive = true;
    void (async () => {
      try {
        const r = await apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(moNo)}`);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok || j.error) throw new Error(j.error || "โหลดข้อมูลใบงานไม่สำเร็จ");
        setSnap(j.data as CatchUpSnapshot);
      } catch (e) { if (alive) setLoadErr(e instanceof Error ? e.message : "โหลดข้อมูลใบงานไม่สำเร็จ"); }
    })();
    return () => { alive = false; };
  }, [moNo]);

  const f = useMemo(() => (snap ? cuFacts(snap) : null), [snap]);
  const pick = (k: CuTargetKey) => {
    if (!f) return;
    setTarget(k); setTicks((t) => ({ ...cuDefaultTicks(f, k), short: k !== "have" && cuCanShort(f, k) ? t.short : false }));
    const q = cuDefaultQty(f, k);
    setDisp([{ key: nk("d"), deptId: "", crewIds: [], qty: q.dispatchQty, date: null }]);
    setRet([{ key: nk("r"), ref: "auto", qty: q.returnQty, date: null }]);
    setQc({ good: q.qcGood, bad: 0 });
    const good = snap?.shelves.filter((s) => s.kind !== "defect") ?? [];
    if (good.length === 1) setShelfId(good[0].id);
  };
  const rows = f && target ? cuRows(f, target, ticks) : [];
  const selIdx = target ? flow.findIndex((t) => t.key === target) : -1;
  const phaseOn = (ph: string) => selIdx >= 0 && flow.some((t, i) => t.group === ph && i <= selIdx);
  /** ขั้นที่ระบบบันทึกไปถึงแล้ว (ไกลสุด) — ป้าย "ระบบบันทึกถึงตรงนี้" */
  const sysKey = f ? [...flow].reverse().find((t) => t.upto && t.key !== "return_part" && cuStageDone(f, t.upto))?.key : undefined;
  const toggleShort = (v: boolean) => {
    setTicks((t) => ({ ...t, short: v }));
    if (v && snap) setMissing(snap.materials.filter((x) => !x.ready && ["buy", "requested", "ordered"].includes(x.status)).map((x) => x.sku));
  };
  const on = (st: CuStage) => rows.some((r) => r.stage === st && (r.state === "need" || (r.state === "opt" && !!ticks[st])));

  // ── แถวจ่ายงาน: โต๊ะ / คนรับ ของแต่ละแถว
  const deptOf = (id: string) => departments.find((d) => d.id === id) ?? null;
  const isHire = (d: DeptLite | null) => !!d && /เหมา/.test(d.name);
  const poolOf = (d: DeptLite | null) => (d ? (isHire(d) ? craftsmen : craftsmen.filter((c) => c.department_id === d.id)) : []);
  const setRow = (key: string, patch: Partial<DispRow>) => setDisp((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setRetRow = (key: string, patch: Partial<CuRetLine>) => setRet((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const crewNames = (r: DispRow) => crewList(r.crewIds, poolOf(deptOf(r.deptId))).map((x) => x.name).join(", ");
  const dispLabel = (r: DispRow) => { const d = deptOf(r.deptId); const n = crewNames(r); return d ? `${d.name}${n ? ` · ${n}` : ""}` : `แถวจ่าย ${disp.indexOf(r) + 1}`; };
  const dispTotal = disp.reduce((a, r) => a + (r.qty > 0 ? r.qty : 0), 0);
  const remain = f ? Math.max(0, f.qty - f.dispatched) : 0;
  const outstanding = f ? Math.max(0, f.dispatched + (on("dispatch") ? dispTotal : 0) - f.received) : 0;
  const retTotal = ret.reduce((a, r) => a + (r.qty > 0 ? r.qty : 0), 0);
  // ใบที่ส่งคืนได้: ใบจ่ายเดิมที่ยังค้างช่าง + แถวจ่ายใหม่
  const retOptions = [
    ...(snap?.wos ?? []).filter((w) => w.status !== "done" && w.qty - w.received_qty > 0.0001)
      .map((w) => ({ ref: w.id, label: `${w.wo_no} · ${w.assignee_name ?? w.department_name ?? "—"} (ค้าง ${fmt(w.qty - w.received_qty)})` })),
    ...(on("dispatch") ? disp.filter((r) => r.qty > 0).map((r) => ({ ref: `new:${r.key}`, label: `ใหม่: ${dispLabel(r)} (${fmt(r.qty)})` })) : []),
  ];
  /** ชื่อโต๊ะ/คน ที่โชว์ในสรุปขั้น */
  const whoOf = (s: CuStep) => {
    if (s.kind === "dispatch") { const r = disp.find((x) => x.key === s.line); return r ? dispLabel(r) : ""; }
    if (s.kind === "return") return s.ref === "auto" ? "" : retOptions.find((o) => o.ref === s.ref)?.label.replace(/ \((ค้าง )?[\d,.]+\)$/, "").replace(/^ใหม่: /, "") ?? "";
    return "";
  };

  const built = f && target
    ? cuBuildSteps(f, target, ticks, { disp, ret, qcGood: qc.good, qcBad: qc.bad, shelfId, cancelReason, missing, dates }, snap?.wos ?? [])
    : { steps: [] as CuStep[], errors: [] as string[] };
  const errors = [...built.errors, ...(on("dispatch")
    ? disp.flatMap((r, i) => (r.qty > 0 && isHire(deptOf(r.deptId)) && r.crewIds.length === 0 ? [`แถวจ่าย ${i + 1}: โต๊ะเหมา ต้องเลือกช่างอย่างน้อย 1 คน`] : []))
    : [])];
  const hasStep = (k: CuStep["kind"]) => built.steps.some((s) => s.kind === k);

  const save = async () => {
    if (!snap || errors.length || !built.steps.length) return;
    setPage(3); setResults([]);
    const ctxDisp: Record<string, { dept: DeptLite; who: Record<string, unknown> }> = {};
    for (const r of disp) { const d = deptOf(r.deptId); if (d) ctxDisp[r.key] = { dept: d, who: crewFields(crewList(r.crewIds, poolOf(d)), d.name) }; }
    const res = await cuRun(built.steps, { snap, disp: ctxDisp, shelfId, badReason }, async (url, body, method = "POST") => {
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(r.status === 401 || r.status === 403 ? "คุณไม่มีสิทธิ์ทำขั้นนี้" : (j?.error || "บันทึกไม่สำเร็จ"));
      return j as Record<string, unknown>;
    }, setRunning, (s) => cuStepLabel(s, whoOf));
    setRunning(-1); setResults(res);
    if (res.some((x) => x.ok)) onDone();
  };

  const busy = page === 3 && results.length === 0;
  const m = snap?.mo, p = snap?.progress;
  const buyTxt = !m ? "" : m.skipped.buy ? "ป้ายของครบ" : !p ? "ยังไม่มีสูตร" : f?.buyDone ? "ของครบ"
    : `ต้องซื้อ ${p.buy}${p.requested ? ` · รออนุมัติ ${p.requested}` : ""}${p.ordered ? ` · รอของ ${p.ordered}` : ""}`;

  const footer = page === 1 ? (<>
    <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
    <button type="button" disabled={!target} onClick={() => setPage(2)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">ถัดไป: เติมข้อมูล →</button>
  </>) : page === 2 ? (<>
    <button type="button" onClick={() => setPage(1)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">← กลับ</button>
    <button type="button" disabled={errors.length > 0 || built.steps.length === 0} onClick={() => void save()}
      className={`h-9 px-4 text-sm font-medium text-white rounded-lg disabled:opacity-40 ${target === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
      {target === "cancel" ? "ยืนยันยกเลิกใบ" : "✓ บันทึกอัปเดต"}
    </button>
  </>) : (
    <button type="button" disabled={busy} onClick={onClose} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">ปิด</button>
  );

  return (
    <ERPModal open={!!moNo} onClose={onClose} size="lg" storageKey="wb-catchup" footer={footer}
      hasUnsavedChanges={page === 2} closeOnBackdrop={page === 1}
      title={`🔄 อัปเดตงาน${m ? ` · ${m.product_sku ?? m.mo_no}` : ""}`}
      description={m ? `${m.mo_no}${m.product_name && m.product_name !== m.product_sku ? ` · ${m.product_name}` : ""} · สั่งผลิต ${fmt(m.qty)} ชิ้น` : undefined}>
      {loadErr ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</div>
        : !snap || !f || !m ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลดข้อมูลใบงาน…</div>
        : page === 1 ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
              <div className="mb-1 font-medium text-slate-500">ระบบบันทึกไว้ตอนนี้</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-700">
                {([["ซื้อของ", buyTxt], ["เตรียม", m.has_bom ? `${m.prep_ready}/${m.prep_total}` : m.prep_done ? "ครบ" : "—"],
                  ["ตัด", m.has_bom ? (m.cut_total ? `${m.cut_ready}/${m.cut_total}` : "ไม่มีชิ้นต้องตัด") : m.cut_done ? "ครบ" : "—"],
                  ["จ่าย", `${fmt(f.dispatched)}/${fmt(f.qty)}`], ["ช่างคืน", fmt(f.received)],
                  ["QC รับเข้า", `${fmt(f.qcPulled)}${f.shelfGood ? ` (บนชั้น ${fmt(f.shelfGood)})` : ""}`]] as [string, string][]).map(([k, v]) => (
                  <span key={k}><span className="text-slate-400">{k}</span> {v}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">ตอนนี้ของจริงอยู่ขั้นไหน? <span className="text-[12px] font-normal text-slate-400">กดขั้นเดียว ขั้นก่อนหน้าเป็นสีม่วงให้เอง</span></div>
              <div>
                {phases.map((ph, pi) => {
                  const items = flow.filter((t) => t.group === ph);
                  const lineOn = pi < phases.length - 1 && phaseOn(phases[pi + 1]);
                  return (
                    <div key={ph} className="relative grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-1.5">
                      {pi < phases.length - 1 && <span className={`absolute left-[2.5rem] top-9 -bottom-1.5 w-0.5 ${lineOn ? "bg-indigo-400" : "bg-slate-200"}`} />}
                      <div className="relative z-[1] flex flex-col items-center gap-0.5 pt-1">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${phaseOn(ph) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-400"}`}>{pi + 1}</span>
                        <span className="bg-white px-0.5 text-center text-[11px] leading-tight text-slate-500">{ph}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((t) => {
                          const i = flow.indexOf(t), why = cuTargetBlocked(f, t.key), sel = target === t.key, past = selIdx >= 0 && i < selIdx;
                          const isSys = sysKey === t.key;
                          return (
                            <button key={t.key} type="button" disabled={!!why} title={why ?? t.hint} onClick={() => pick(t.key)}
                              className={`min-w-[8.5rem] rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sel
                                ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : past ? "border-indigo-200 bg-indigo-50/60" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
                              <div className={`text-[13px] ${sel ? "font-semibold text-indigo-700" : past ? "text-indigo-700" : "font-medium text-slate-800"}`}>{t.label}</div>
                              <div className={`text-[11px] ${isSys ? "text-emerald-600" : "text-slate-400"}`}>{why ?? (isSys ? "ระบบบันทึกถึงตรงนี้" : t.hint)}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const why = cuTargetBlocked(f, "cancel"), sel = target === "cancel";
                return (
                  <button type="button" disabled={!!why} title={why ?? undefined} onClick={() => pick("cancel")}
                    className={`mt-1 rounded-md px-2 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-40 ${sel ? "bg-rose-50 font-medium text-rose-700 ring-1 ring-rose-400" : "text-rose-600 underline decoration-dotted hover:bg-rose-50"}`}>
                    ยกเลิกใบ <span className="text-rose-400">({why ?? "เฉพาะใบที่ยังไม่จ่าย"})</span>
                  </button>
                );
              })()}
            </div>
            {target && target !== "cancel" && (
              <div>
                <div className="mb-1 text-[12px] text-slate-500">ขั้นที่จะบันทึก · เอาติ๊กออกได้ ถ้าทำข้ามไปก่อน</div>
                <div className="divide-y divide-dashed divide-slate-200 rounded-lg border border-slate-200 px-3">
                  {rows.map((r) => {
                    const checked = r.state === "done" || r.state === "need" || r.state === "implied" || (r.state === "opt" && !!ticks[r.stage]);
                    const note = r.state === "done" ? "มีในระบบแล้ว" : r.state === "need" ? "ต้องบันทึก" : r.state === "implied" ? "รวมอยู่ใน \"เตรียมของแล้ว\""
                      : r.state === "short" ? "ยังไม่ครบ (ดูด้านล่าง)" : ticks[r.stage] ? "ติ๊กให้แล้ว" : "ยังไม่ได้ทำ (ทำข้ามไปก่อน)";
                    return (
                      <div key={r.stage}>
                        <label className={`flex items-center gap-2 py-2 text-sm ${r.state === "opt" ? "cursor-pointer" : ""}`}>
                          <input type="checkbox" checked={checked} disabled={r.state !== "opt"} onChange={(e) => setTicks((t) => ({ ...t, [r.stage]: e.target.checked }))}
                            className="h-4 w-4 accent-indigo-600" />
                          <span className={`flex-1 ${r.state === "done" ? "text-slate-400" : "text-slate-800"}`}>{CU_STAGE_LABEL[r.stage]}</span>
                          <span className={`text-[11px] ${r.state === "done" ? "text-emerald-600" : r.state === "short" || (r.state === "opt" && !ticks[r.stage]) ? "text-amber-600" : "text-slate-400"}`}>{note}</span>
                        </label>
                        {r.stage === "have" && cuCanShort(f, target) && (
                          <div className="pb-2 pl-6">
                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                              <input type="checkbox" checked={!!ticks.short} onChange={(e) => toggleShort(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                              <span className="flex-1 text-amber-700">⚠️ ยังขาดของอยู่</span>
                              <span className="text-[11px] text-slate-400">{ticks.short ? `ขาด ${missing.length} รายการ` : "ติ๊กถ้ายังมีของไม่ครบ"}</span>
                            </label>
                            {ticks.short && (snap.materials.length ? (
                              <div className="mt-2">
                                <div className="mb-1.5 text-[12px] text-slate-500">ขาดอะไรบ้าง? (ระบบเลือกตัวที่ยังไม่มีของให้ก่อน)</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {snap.materials.map((x) => {
                                    const on = missing.includes(x.sku);
                                    return (
                                      <button key={x.sku} type="button" onClick={() => setMissing((ms) => (on ? ms.filter((s) => s !== x.sku) : [...ms, x.sku]))}
                                        className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] ${on ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"}`}>
                                        {on && "⚠️"} {x.name} <span className="text-[11px] text-slate-400">· {MAT_LABEL[x.status] ?? x.status}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="mt-1.5 text-[11px] text-slate-400">ตัวที่ขาดจะไม่ถูกติ๊กเตรียม/ตัด → ยังขึ้นในหน้าขอซื้อให้ฝ่ายจัดซื้อเห็น</div>
                              </div>
                            ) : <div className="mt-1 text-[11px] text-slate-400">ใบนี้ยังไม่มีสูตร เลือกรายการของไม่ได้ — ระบบจะไม่ติดป้าย "ของครบ" ให้</div>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : page === 2 ? (
          <div className="space-y-3">
            {target === "cancel" && (
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div>
                  <label className="mb-1 block text-[12px] text-rose-700">เหตุผลที่ยกเลิก (บังคับ)</label>
                  <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="ลูกค้ายกเลิกออเดอร์"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
                </div>
                <DateField label="ยกเลิกเมื่อ" value={dates.cancel} onChange={(v) => setDates((d) => ({ ...d, cancel: v }))} />
              </div>
            )}
            {(hasStep("skip_buy") || hasStep("mark_ready")) && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">วัตถุดิบ / เตรียม / ตัด</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {hasStep("skip_buy") && <DateField label="ของครบเมื่อ" value={dates.have} onChange={(v) => setDates((d) => ({ ...d, have: v }))} />}
                  {hasStep("mark_ready") && <DateField label="เตรียม/ตัดเสร็จเมื่อ" value={dates.ready} onChange={(v) => setDates((d) => ({ ...d, ready: v }))} />}
                </div>
              </section>
            )}
            {on("dispatch") && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-700">🚚 จ่ายงาน</span>
                  <span className={`text-[12px] ${dispTotal > remain + 0.0001 ? "text-rose-600" : "text-slate-500"}`}>จ่ายรวม {fmt(dispTotal)} / เหลือให้จ่าย {fmt(remain)} ชิ้น</span>
                  {f.dispatched > 0 && <span className="text-[11px] text-slate-400">· ใส่ 0 ได้ ถ้าที่เหลือยังไม่ได้จ่ายจริง</span>}
                </div>
                <div className="space-y-2">
                  {disp.map((r, i) => {
                    const d = deptOf(r.deptId), hire = isHire(d), pool = poolOf(d);
                    return (
                      <div key={r.key} className="rounded-lg bg-slate-50/70 p-2.5">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_6.5rem_minmax(0,1fr)_auto]">
                          <div>
                            <label className={lbl}>{disp.length > 1 ? `แถว ${i + 1} · ` : ""}โต๊ะ</label>
                            <select value={r.deptId} onChange={(e) => setRow(r.key, { deptId: e.target.value, crewIds: [] })} className={numIn}>
                              <option value="">— เลือกโต๊ะ —</option>
                              {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>จำนวน</label>
                            <input type="number" min={0} step="any" value={r.qty} onChange={(e) => setRow(r.key, { qty: Number(e.target.value) })} className={numIn} />
                          </div>
                          <DateField label="วันที่จ่าย" value={r.date} onChange={(v) => setRow(r.key, { date: v })} />
                          {disp.length > 1 && (
                            <button type="button" title="ลบแถวนี้" onClick={() => { setDisp((rs) => rs.filter((x) => x.key !== r.key)); setRet((rs) => rs.map((x) => (x.ref === `new:${r.key}` ? { ...x, ref: "auto" } : x))); }}
                              className="mt-5 h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600">✕</button>
                          )}
                        </div>
                        {d && (
                          <div className="mt-2 flex items-center gap-2 text-[12px]">
                            <span className="text-slate-500">👥 {craftsmen.filter((c) => c.department_id === d.id).length} คนในโต๊ะ</span>
                            <button type="button" onClick={() => setDeskPanelFor((k) => (k === r.key ? null : r.key))} className="text-violet-700 hover:underline">{deskPanelFor === r.key ? "ปิดจัดคน ▴" : "จัดคนในโต๊ะ ▾"}</button>
                          </div>
                        )}
                        {d && deskPanelFor === r.key && (
                          <div className="mt-2">
                            <DeskStaffPanel dept={d} desks={departments} people={craftsmen} canMove={canMoveStaff} canAddNew={canAddNew} onChanged={() => onStaffChanged?.()}
                              wos={workOrders} onDesksChanged={(focus) => { onDesksChanged?.(); setRow(r.key, { deptId: focus ?? "", crewIds: [] }); }} />
                          </div>
                        )}
                        {d && (
                          <div className="mt-2">
                            <label className={lbl}>คนรับ {hire ? "(โต๊ะเหมา ต้องเลือกคน)" : "(เลือกได้หลายคน)"}</label>
                            <CrewPick people={pool} value={r.crewIds} onChange={(ids) => setRow(r.key, { crewIds: ids })} required={hire} recent={lastCrewIds(workOrders, d.id, pool)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button type="button" className={`${addBtn} mt-2`}
                  onClick={() => setDisp((rs) => [...rs, { key: nk("d"), deptId: rs[rs.length - 1]?.deptId ?? "", crewIds: [], qty: Math.max(0, Math.round((remain - dispTotal) * 100) / 100), date: rs[rs.length - 1]?.date ?? null }])}>
                  ＋ เพิ่มแถวจ่าย (จ่ายหลายช่าง / หลายวัน)
                </button>
              </section>
            )}
            {on("return") && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-700">↩️ ช่างส่งคืน</span>
                  <span className="text-[12px] text-slate-500">คืนรวม {fmt(retTotal)} / ค้างช่าง {fmt(outstanding)} ชิ้น</span>
                  {retTotal > 0 && outstanding - retTotal > 0.0001 && <span className="text-[12px] text-amber-700">· ยังอยู่กับช่าง {fmt(outstanding - retTotal)} ชิ้น</span>}
                </div>
                <div className="space-y-2">
                  {ret.map((r, i) => (
                    <div key={r.key} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50/70 p-2.5 sm:grid-cols-[minmax(0,1.6fr)_6.5rem_minmax(0,1fr)_auto]">
                      <div>
                        <label className={lbl}>{ret.length > 1 ? `รอบ ${i + 1} · ` : ""}ส่งจากใบไหน</label>
                        <select value={r.ref} onChange={(e) => setRetRow(r.key, { ref: e.target.value })} className={numIn}>
                          <option value="auto">อัตโนมัติ (ใบเก่าก่อน)</option>
                          {retOptions.map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>จำนวน</label>
                        <input type="number" min={0} step="any" value={r.qty} onChange={(e) => setRetRow(r.key, { qty: Number(e.target.value) })} className={numIn} />
                      </div>
                      <DateField label="วันที่ส่งคืน" value={r.date} onChange={(v) => setRetRow(r.key, { date: v })} />
                      {ret.length > 1 && (
                        <button type="button" title="ลบรอบนี้" onClick={() => setRet((rs) => rs.filter((x) => x.key !== r.key))}
                          className="mt-5 h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className={`${addBtn} mt-2`}
                  onClick={() => setRet((rs) => [...rs, { key: nk("r"), ref: "auto", qty: Math.max(0, Math.round((outstanding - retTotal) * 100) / 100), date: null }])}>
                  ＋ เพิ่มรอบส่งคืน (ส่งไม่พร้อมกัน)
                </button>
                <div className="mt-2 text-[11px] text-slate-500">💰 บันทึกเป็น "ยังไม่ลงค่าแรง" — เงินเดือนยังไม่นับ จนกว่าจะไปใส่ค่าแรงที่ตารางส่งงาน</div>
              </section>
            )}
            {on("qc_in") && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">🗄️ QC รับเข้าชั้น</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div>
                    <label className={lbl}>ของดี (ชิ้น)</label>
                    <input type="number" min={0} step="any" value={qc.good} onChange={(e) => setQc((q) => ({ ...q, good: Number(e.target.value) }))} className={numIn} />
                  </div>
                  <div>
                    <label className={lbl}>ชั้นที่วางของดี</label>
                    <select value={shelfId} onChange={(e) => setShelfId(e.target.value)} className={numIn}>
                      <option value="">— เลือกชั้น —</option>
                      {snap.shelves.filter((s) => s.kind !== "defect").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>ของเสีย (ชิ้น)</label>
                    <input type="number" min={0} step="any" value={qc.bad} onChange={(e) => setQc((q) => ({ ...q, bad: Number(e.target.value) }))} className={numIn} />
                  </div>
                  <DateField label="QC รับเข้าเมื่อ" value={dates.qc} onChange={(v) => setDates((d) => ({ ...d, qc: v }))} />
                </div>
                {qc.bad > 0 && (
                  <input value={badReason} onChange={(e) => setBadReason(e.target.value)} placeholder="สาเหตุของเสีย เช่น เย็บเบี้ยว" className={`${numIn} mt-2`} />
                )}
              </section>
            )}
            {(on("ship") || on("close")) && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">{on("ship") && on("close") ? "📤 ส่งออก / 🏁 ปิดใบ" : on("ship") ? "📤 ส่งออกจาก QC" : "🏁 ปิดใบ"}</div>
                {on("ship") && qc.good > 0 && <div className="mb-2 text-[12px] text-slate-500">ของดี {fmt(qc.good)} ชิ้นที่รับเข้า จะถูกส่งออกจากชั้นต่อทันที</div>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {on("ship") && <DateField label="ส่งออกเมื่อ" value={dates.ship} onChange={(v) => setDates((d) => ({ ...d, ship: v }))} />}
                  {on("close") && <DateField label="ปิดใบเมื่อ" value={dates.close} onChange={(v) => setDates((d) => ({ ...d, close: v }))} />}
                </div>
              </section>
            )}
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="mb-1 text-[12px] font-medium text-slate-500">ระบบจะบันทึก</div>
              {built.steps.length ? built.steps.map((s, i) => <div key={i} className="text-[13px] text-slate-700">• {cuStepLabel(s, whoOf)}</div>)
                : <div className="text-[13px] text-slate-400">—</div>}
              <div className="mt-1 text-[11px] text-slate-400">วันที่ที่ไม่ใส่ = จำไม่ได้ (ข้ามได้) · ทุกขั้นลงประวัติว่าใครอัปเดต · ไม่ส่งแจ้งเตือน LINE เรื่องงานเก่า</div>
            </div>
            {errors.length > 0 && <div className="space-y-0.5">{errors.map((e) => <div key={e} className="text-[13px] text-rose-600">⚠️ {e}</div>)}</div>}
          </div>
        ) : (
          <div className="space-y-2">
            {built.steps.map((s, i) => {
              const r = results[i];
              const st = r ? (r.ok ? "ok" : "fail") : running === i ? "run" : results.length ? "skip" : "wait";
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 shrink-0 text-center">{st === "ok" ? "✅" : st === "fail" ? "❌" : st === "run" ? "⏳" : "▫️"}</span>
                  <div className="min-w-0">
                    <div className={st === "skip" ? "text-slate-400" : "text-slate-800"}>{cuStepLabel(s, whoOf)}</div>
                    {st === "fail" && <div className="text-[12px] text-rose-600">{r!.msg}</div>}
                    {st === "skip" && <div className="text-[11px] text-slate-400">ยังไม่ได้ทำ (ขั้นก่อนหน้าไม่สำเร็จ)</div>}
                  </div>
                </div>
              );
            })}
            {results.length > 0 && (results.every((r) => r.ok) && results.length === built.steps.length
              ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">อัปเดตแล้ว — บอร์ดโหลดใหม่ให้แล้ว</div>
              : <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">บันทึกได้บางขั้น — ขั้นที่ ✅ เก็บไว้แล้ว เปิดป๊อปนี้ใหม่เพื่อทำต่อได้</div>)}
          </div>
        )}
    </ERPModal>
  );
}
