"use client";

/**
 * 🔄 ป๊อป "อัปเดตงาน" (โหมดอัปเดตงานของบอร์ดจ่ายงาน) — บอกระบบว่าใบนี้ไปถึงขั้นไหนแล้วจริงๆ
 *   ขั้น 1: เลือกสถานะปัจจุบัน → ติ๊กขั้นก่อนหน้าให้ (ของครบ/เตรียม/ตัด เอาออกได้)
 *   ขั้น 2: เติมเฉพาะข้อมูลที่ยังไม่มี (โต๊ะ/คนรับ/วันที่/จำนวน/ชั้น QC) + สรุปสิ่งที่จะบันทึก
 *   ขั้น 3: ผลการบันทึกทีละขั้น (พังขั้นไหน หยุดตรงนั้น บอกว่าสำเร็จถึงไหน)
 * กติกาทั้งหมดอยู่ที่ ./catch-up.ts (ทดสอบแล้ว) · ข้อมูลตั้งต้นจาก GET /api/mo/catch-up
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import { CrewPick, crewFields, crewList, lastCrewIds } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";
import {
  CU_TARGETS, CU_STAGE_LABEL, cuFacts, cuRows, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuTargetBlocked, cuStepLabel, cuRun,
  type CuTargetKey, type CuTicks, type CuResult, type CuStage,
} from "./catch-up";

type DeptLite = { id: string; name: string };
type CrewWO = Parameters<typeof lastCrewIds>[0][number];
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const numIn = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function CatchUpModal({ moNo, onClose, onDone, departments, craftsmen, workOrders }: {
  /** ใบสั่งผลิตที่จะอัปเดต (null = ปิดป๊อป) */
  moNo: string | null;
  onClose: () => void;
  /** บันทึกแล้วอย่างน้อย 1 ขั้น → ให้หน้าแม่โหลดบอร์ดใหม่ */
  onDone: () => void;
  departments: DeptLite[]; craftsmen: Assignee[]; workOrders: CrewWO[];
}) {
  const [snap, setSnap] = useState<CatchUpSnapshot | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [page, setPage] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<CuTargetKey | null>(null);
  const [ticks, setTicks] = useState<CuTicks>({});
  const [deptId, setDeptId] = useState("");
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [dispDate, setDispDate] = useState<string | null>(null);
  const [qty, setQty] = useState({ dispatchQty: 0, returnQty: 0, qcGood: 0, qcBad: 0 });
  const [shelfId, setShelfId] = useState("");
  const [badReason, setBadReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [running, setRunning] = useState(-1);
  const [results, setResults] = useState<CuResult[]>([]);

  useEffect(() => {
    if (!moNo) return;
    setSnap(null); setLoadErr(""); setPage(1); setTarget(null); setTicks({}); setDeptId(""); setCrewIds([]); setDispDate(null);
    setShelfId(""); setBadReason(""); setCancelReason(""); setResults([]); setRunning(-1);
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
    setTarget(k); setTicks(cuDefaultTicks(f, k));
    const q = cuDefaultQty(f, k); setQty(q);
    const good = snap?.shelves.filter((s) => s.kind !== "defect") ?? [];
    if (good.length === 1) setShelfId(good[0].id);
  };
  const rows = f && target ? cuRows(f, target, ticks) : [];
  const on = (st: CuStage) => rows.some((r) => r.stage === st && (r.state === "need" || (r.state === "opt" && !!ticks[st])));

  const dept = departments.find((d) => d.id === deptId) ?? null;
  const hire = !!dept && /เหมา/.test(dept.name);
  const pool = useMemo(() => (dept ? (hire ? craftsmen : craftsmen.filter((c) => c.department_id === dept.id)) : []), [dept, hire, craftsmen]);
  const built = f && target ? cuBuildSteps(f, target, ticks, { ...qty, shelfId, deptId, cancelReason }) : { steps: [], errors: [] };
  const errors = [...built.errors, ...(on("dispatch") && hire && crewIds.length === 0 && qty.dispatchQty > 0 ? ["โต๊ะเหมา ต้องเลือกช่างอย่างน้อย 1 คน"] : [])];

  const save = async () => {
    if (!snap || errors.length || !built.steps.length) return;
    setPage(3); setResults([]);
    const res = await cuRun(built.steps, {
      snap, dept, who: dept ? crewFields(crewList(crewIds, pool), dept.name) : {}, dispatchDate: dispDate, shelfId, badReason,
    }, async (url, body, method = "POST") => {
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(r.status === 401 || r.status === 403 ? "คุณไม่มีสิทธิ์ทำขั้นนี้" : (j?.error || "บันทึกไม่สำเร็จ"));
      return j as Record<string, unknown>;
    }, setRunning);
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
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              <div className="mb-1 font-medium text-slate-500">ระบบบันทึกไว้ตอนนี้</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span>🛒 {buyTxt}</span>
                <span>🧺 เตรียม {m.has_bom ? `${m.prep_ready}/${m.prep_total}` : m.prep_done ? "✓" : "—"}</span>
                <span>✂️ ตัด {m.has_bom ? (m.cut_total ? `${m.cut_ready}/${m.cut_total}` : "ไม่มีชิ้นต้องตัด") : m.cut_done ? "✓" : "—"}</span>
                <span>🚚 จ่าย {fmt(f.dispatched)}/{fmt(f.qty)}</span>
                <span>↩️ ช่างคืน {fmt(f.received)}</span>
                <span>🗄️ QC รับเข้า {fmt(f.qcPulled)}{f.shelfGood ? ` · บนชั้น ${fmt(f.shelfGood)}` : ""}</span>
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">ตอนนี้ของจริงอยู่ขั้นไหน?</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CU_TARGETS.map((t) => {
                  const why = cuTargetBlocked(f, t.key), sel = target === t.key;
                  return (
                    <button key={t.key} type="button" disabled={!!why} title={why ?? `${t.group} · ${t.hint}`} onClick={() => pick(t.key)}
                      className={`rounded-lg border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sel
                        ? t.key === "cancel" ? "border-rose-500 bg-rose-50 ring-1 ring-rose-500" : "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                        : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
                      <div className={`text-[13px] font-medium ${sel ? (t.key === "cancel" ? "text-rose-700" : "text-indigo-700") : "text-slate-800"}`}>{t.icon} {t.label}</div>
                      <div className="text-[11px] text-slate-400">{why ?? t.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {target && target !== "cancel" && (
              <div>
                <div className="mb-1 text-[12px] text-slate-500">ระบบติ๊กขั้นก่อนหน้าให้แล้ว · เอาติ๊กออกได้ ถ้าทำข้ามไปก่อน</div>
                <div className="divide-y divide-dashed divide-slate-200 rounded-lg border border-slate-200 px-3">
                  {rows.map((r) => {
                    const checked = r.state === "done" || r.state === "need" || r.state === "implied" || !!ticks[r.stage];
                    const note = r.state === "done" ? "✓ มีในระบบแล้ว" : r.state === "need" ? "ต้องบันทึก" : r.state === "implied" ? "รวมอยู่ใน \"เตรียมของแล้ว\""
                      : ticks[r.stage] ? "ติ๊กให้แล้ว" : "ยังไม่ได้ทำ (ทำข้ามไปก่อน)";
                    return (
                      <label key={r.stage} className={`flex items-center gap-2 py-2 text-sm ${r.state === "opt" ? "cursor-pointer" : ""}`}>
                        <input type="checkbox" checked={checked} disabled={r.state !== "opt"} onChange={(e) => setTicks((t) => ({ ...t, [r.stage]: e.target.checked }))}
                          className="h-4 w-4 accent-indigo-600" />
                        <span className={`flex-1 ${r.state === "done" ? "text-slate-400" : "text-slate-800"}`}>{CU_STAGE_LABEL[r.stage]}</span>
                        <span className={`text-[11px] ${r.state === "done" ? "text-emerald-600" : r.state === "opt" && !ticks[r.stage] ? "text-amber-600" : "text-slate-400"}`}>{note}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : page === 2 ? (
          <div className="space-y-3">
            {target === "cancel" && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                <label className="mb-1 block text-[12px] text-rose-700">เหตุผลที่ยกเลิก (บังคับ)</label>
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="ลูกค้ายกเลิกออเดอร์"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
              </div>
            )}
            {on("dispatch") && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">🚚 ข้อมูลจ่ายงาน</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-500">โต๊ะ</label>
                    <select value={deptId} onChange={(e) => { setDeptId(e.target.value); setCrewIds([]); }} className={numIn}>
                      <option value="">— เลือกโต๊ะ —</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-500">จำนวนที่จ่าย (เหลือ {fmt(f.qty - f.dispatched)})</label>
                    <input type="number" min={0} step="any" value={qty.dispatchQty} onChange={(e) => setQty((q) => ({ ...q, dispatchQty: Number(e.target.value) }))} className={numIn} />
                    {f.dispatched > 0 && <span className="block text-[10px] text-slate-400">ใส่ 0 ได้ ถ้าที่เหลือยังไม่ได้จ่ายจริง</span>}
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-500">วันที่จ่าย</label>
                    <DispatchDatePick value={dispDate} onChange={setDispDate} />
                  </div>
                </div>
                {dept && (
                  <div className="mt-3">
                    <label className="mb-1 block text-[12px] text-slate-500">คนรับ {hire ? "(โต๊ะเหมา ต้องเลือกคน)" : "(เลือกได้หลายคน)"}</label>
                    <CrewPick people={pool} value={crewIds} onChange={setCrewIds} required={hire} recent={lastCrewIds(workOrders, dept.id, pool)} />
                  </div>
                )}
              </section>
            )}
            {on("return") && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">↩️ ช่างส่งคืน</div>
                {(() => {
                  const out = Math.max(0, f.dispatched + (on("dispatch") ? qty.dispatchQty || 0 : 0) - f.received);
                  const left = out - (qty.returnQty || 0);
                  return (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-40">
                        <label className="mb-1 block text-[12px] text-slate-500">ส่งคืนแล้วกี่ชิ้น (ค้างช่าง {fmt(out)})</label>
                        <input type="number" min={0} step="any" value={qty.returnQty} onChange={(e) => setQty((q) => ({ ...q, returnQty: Number(e.target.value) }))} className={numIn} />
                      </div>
                      {left > 0.0001 && qty.returnQty > 0 && <span className="pb-2 text-[12px] text-amber-700">แยก: คืนแล้ว {fmt(qty.returnQty)} · ยังอยู่กับช่าง {fmt(left)} ชิ้น</span>}
                    </div>
                  );
                })()}
                <div className="mt-2 text-[11px] text-slate-500">💰 บันทึกเป็น "ยังไม่ลงค่าแรง" — เงินเดือนยังไม่นับ จนกว่าจะไปใส่ค่าแรงที่ตารางส่งงาน</div>
              </section>
            )}
            {on("qc_in") && (
              <section className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">🗄️ QC รับเข้าชั้น</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-500">ของดี (ชิ้น)</label>
                    <input type="number" min={0} step="any" value={qty.qcGood} onChange={(e) => setQty((q) => ({ ...q, qcGood: Number(e.target.value) }))} className={numIn} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-500">ชั้นที่วางของดี</label>
                    <select value={shelfId} onChange={(e) => setShelfId(e.target.value)} className={numIn}>
                      <option value="">— เลือกชั้น —</option>
                      {snap.shelves.filter((s) => s.kind !== "defect").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] text-slate-500">ของเสีย (ชิ้น)</label>
                    <input type="number" min={0} step="any" value={qty.qcBad} onChange={(e) => setQty((q) => ({ ...q, qcBad: Number(e.target.value) }))} className={numIn} />
                  </div>
                </div>
                {qty.qcBad > 0 && (
                  <input value={badReason} onChange={(e) => setBadReason(e.target.value)} placeholder="สาเหตุของเสีย เช่น เย็บเบี้ยว" className={`${numIn} mt-2`} />
                )}
              </section>
            )}
            {on("ship") && qty.qcGood > 0 && <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">📤 ของดี {fmt(qty.qcGood)} ชิ้นที่รับเข้า จะถูกส่งออกจากชั้นต่อทันที</div>}
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="mb-1 text-[12px] font-medium text-slate-500">ระบบจะบันทึก</div>
              {built.steps.length ? built.steps.map((s, i) => <div key={i} className="text-[13px] text-slate-700">• {cuStepLabel(s)}</div>)
                : <div className="text-[13px] text-slate-400">—</div>}
              <div className="mt-1 text-[11px] text-slate-400">ทุกขั้นลงประวัติว่าใครอัปเดต · ไม่ส่งแจ้งเตือน LINE เรื่องงานเก่า</div>
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
                    <div className={st === "skip" ? "text-slate-400" : "text-slate-800"}>{cuStepLabel(s)}</div>
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
