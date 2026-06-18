"use client";

/**
 * กลุ่ม D — หน้าแผนจ่ายงาน (ร่าง) แบบคอลัมน์
 * - ลองจ่ายงานไปแต่ละโต๊ะแบบ "ร่าง" (เก็บใน mo_dispatch_plan_lines) ไม่กระทบของจริง
 * - ใบจ่ายงานจริงโชว์ล็อกไว้ดูเฉย ๆ (อ่านอย่างเดียว)
 * - กด "ดันเป็นของจริง" → สร้างใบจ่ายงานจริงตามร่างทั้งแผน
 * แยกจากบอร์ด canvas เดิม เพื่อไม่ให้กระทบของจริง
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { DispatchPlanLine } from "@/app/api/mo/dispatch-plans/route";

type DeptLite = { id: string; name: string };
type PendingLite = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number; remaining: number; image_url?: string | null };
type WOLite = { id: string; mo_no: string; qty: number; department_id: string | null; stage: string; assignee_name: string | null; product_sku: string | null; product_name: string | null; status: string };
type CraftLite = { id: string; name: string; department_id?: string | null; code?: string | null };
type DefectMap = Record<string, { count: number } | undefined>;

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

export function DispatchPlanBoard({
  planId, planName, planStatus, departments, pending, realWOs, craftsmen, defectByWorker, canEdit,
  onApplied, onRenamed, onDeleted,
}: {
  planId: string; planName: string; planStatus: string;
  departments: DeptLite[]; pending: PendingLite[]; realWOs: WOLite[]; craftsmen: CraftLite[];
  defectByWorker: DefectMap; canEdit: boolean;
  onApplied: () => void; onRenamed: (name: string) => void; onDeleted: () => void;
}) {
  const toast = useToast();
  const [lines, setLines] = useState<DispatchPlanLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);   // mo_no ของการ์ดรอจ่ายที่เลือก
  const [name, setName] = useState(planName);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const applied = planStatus === "applied";
  const editable = canEdit && !applied;

  useEffect(() => { setName(planName); }, [planName]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`); const j = await r.json();
      setLines((j?.data?.lines ?? []) as DispatchPlanLine[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [planId]);
  useEffect(() => { setSelected(null); void load(); }, [load]);

  const defectOf = (nm: string | null | undefined) => nm ? defectByWorker[nm.trim().toLowerCase()] : undefined;

  // จำนวนที่วางแผนไปแล้วต่อใบ (ในแผนนี้) → เหลือให้วางแผนได้อีกเท่าไร
  const draftedByMo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.mo_no) m.set(l.mo_no, (m.get(l.mo_no) ?? 0) + (Number(l.qty) || 0));
    return m;
  }, [lines]);
  const availOf = (p: PendingLite) => Math.max(0, Math.round((p.remaining - (draftedByMo.get(p.mo_no) ?? 0)) * 100) / 100);

  // ใบจ่ายงานจริง จัดกลุ่มตามแผนก (โชว์ล็อก)
  const realByDept = useMemo(() => {
    const m = new Map<string, WOLite[]>();
    for (const w of realWOs) { if (w.status === "done") continue; const k = w.department_id ?? ""; if (!k) continue; (m.get(k) ?? m.set(k, []).get(k)!).push(w); }
    return m;
  }, [realWOs]);
  const draftByDept = useMemo(() => {
    const m = new Map<string, DispatchPlanLine[]>();
    for (const l of lines) { const k = l.department_id ?? ""; (m.get(k) ?? m.set(k, []).get(k)!).push(l); }
    return m;
  }, [lines]);

  const addLine = async (dept: DeptLite) => {
    if (!editable || !selected) return;
    const p = pending.find((x) => x.mo_no === selected); if (!p) return;
    const qty = availOf(p);
    if (qty <= 0) { toast.info("ใบนี้วางแผนครบจำนวนแล้ว"); return; }
    try {
      const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_line", line: { mo_no: p.mo_no, mo_id: p.id, product_sku: p.product_sku, product_name: p.product_name, qty, department_id: dept.id, department_name: dept.name } }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setLines((ls) => [...ls, j.data as DispatchPlanLine]); setSelected(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const removeLine = async (lineId: string) => {
    if (!editable) return;
    setLines((ls) => ls.filter((l) => l.id !== lineId));
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_line", lineId }) }); }
    catch { void load(); }
  };
  const updateLine = async (lineId: string, patch: { qty?: number; assignee_id?: string | null; assignee_name?: string | null }) => {
    setLines((ls) => ls.map((l) => l.id === lineId ? { ...l, ...patch } as DispatchPlanLine : l));
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_line", lineId, ...patch }) }); }
    catch { void load(); }
  };
  const saveName = async () => {
    const nm = name.trim() || "แผนไม่มีชื่อ";
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", name: nm }) }); onRenamed(nm); }
    catch { /* ignore */ }
  };
  const doApply = async () => {
    setApplying(true);
    try { const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply" }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`ดันเป็นของจริงแล้ว: สร้างใบจ่ายงาน ${j.data?.applied ?? 0} ใบ`); setConfirmApply(false); onApplied();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ดันไม่สำเร็จ"); }
    finally { setApplying(false); }
  };
  const deletePlan = async () => {
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "DELETE" }); toast.success("ลบแผนแล้ว"); onDeleted(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const deptCraftsmen = (dept: DeptLite) => /เหมา/.test(dept.name) ? craftsmen : craftsmen.filter((c) => c.department_id === dept.id);

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือของแผน */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-xl px-3 py-2">
        <span className="text-[11px] text-slate-400">ชื่อแผน</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} disabled={!editable}
          className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
        {applied && <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">ดันเป็นของจริงแล้ว</span>}
        <div className="flex-1" />
        {editable && <button onClick={() => setConfirmApply(true)} disabled={lines.length === 0}
          className="h-8 px-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">🚀 ดันเป็นของจริง</button>}
        <button onClick={deletePlan} className="h-8 px-2.5 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">ลบแผน</button>
      </div>

      {/* คำอธิบายสัญลักษณ์ */}
      <div className="flex gap-4 flex-wrap text-[11px] text-slate-500">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm border border-slate-300 align-[-1px]" /> รอจ่าย</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px]" style={{ border: "1.5px dashed #1d9e75" }} /> ร่าง (ทดลอง)</span>
        <span>🔒 จ่ายจริง (ล็อก)</span>
        {editable && <span className="text-indigo-500">กดการ์ดรอจ่าย → กดที่โต๊ะเพื่อจ่ายแบบร่าง</span>}
      </div>

      {loading ? <div className="text-center py-10 text-slate-400 text-sm">กำลังโหลดแผน…</div> : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {/* คอลัมน์รอจ่าย */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 min-h-[140px]">
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-slate-700">📥 รอจ่าย</span>
              <span className="text-[11px] text-slate-400">{pending.filter((p) => availOf(p) > 0).length}</span></div>
            {pending.filter((p) => availOf(p) > 0).map((p) => {
              const on = selected === p.mo_no;
              return (
                <button key={p.id} type="button" disabled={!editable} onClick={() => setSelected(on ? null : p.mo_no)}
                  className={`w-full text-left rounded-lg px-2 py-1.5 mb-1.5 bg-white ${on ? "ring-2 ring-indigo-400 border-indigo-300" : "border border-slate-200"} ${editable ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                  <div className="text-sm font-semibold text-slate-800 truncate">{p.product_sku}</div>
                  <div className="text-[11px] text-slate-500">{p.mo_no} · เหลือวางแผน {fmt(availOf(p))}/{fmt(p.remaining)}</div>
                </button>
              );
            })}
            {pending.filter((p) => availOf(p) > 0).length === 0 && <div className="text-center text-[11px] text-slate-300 py-3">— วางแผนครบแล้ว —</div>}
          </div>

          {/* คอลัมน์แผนก */}
          {departments.map((d) => {
            const reals = realByDept.get(d.id) ?? [];
            const drafts = draftByDept.get(d.id) ?? [];
            const draftQty = drafts.reduce((a, l) => a + (Number(l.qty) || 0), 0);
            const realQty = reals.reduce((a, w) => a + (Number(w.qty) || 0), 0);
            const canDrop = editable && !!selected;
            return (
              <div key={d.id} onClick={() => canDrop && addLine(d)}
                className={`rounded-xl border p-2 min-h-[140px] ${canDrop ? "border-dashed border-indigo-300 bg-indigo-50/30 cursor-pointer" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-700 truncate">{d.name}</span>
                  <span className="text-[11px] text-slate-400">{draftQty > 0 ? `ร่าง ${fmt(draftQty)}` : reals.length ? `${fmt(realQty)} ชิ้น` : ""}</span>
                </div>
                {/* ใบจ่ายจริง (ล็อก) */}
                {reals.map((w) => (
                  <div key={w.id} className="rounded-lg px-2 py-1.5 mb-1.5 bg-slate-50 border border-slate-200 opacity-70">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600 truncate">{w.product_sku}</span><span className="text-slate-400">🔒</span></div>
                    <div className="text-[11px] text-slate-400 truncate">{w.assignee_name ?? "—"} · {fmt(w.qty)} ชิ้น</div>
                  </div>
                ))}
                {/* รายการร่าง */}
                {drafts.map((l) => {
                  const opts = deptCraftsmen(d);
                  return (
                    <div key={l.id} className="rounded-lg px-2 py-1.5 mb-1.5" style={{ background: "#e1f5ee", border: "1.5px dashed #1d9e75" }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold truncate" style={{ color: "#0f6e56" }}>{l.product_sku}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] px-1 rounded" style={{ color: "#0f6e56", border: "0.5px solid #5dcaa5" }}>ร่าง</span>
                          {editable && <button onClick={() => removeLine(l.id)} className="text-rose-400 hover:text-rose-600 text-xs" title="เอาออก">✕</button>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <input type="number" min={0} step="any" value={Number(l.qty) || 0} disabled={!editable}
                          onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })}
                          className="w-14 h-6 px-1 text-xs text-right border rounded" style={{ borderColor: "#9fe1cb" }} />
                        <span className="text-[10px]" style={{ color: "#0f6e56" }}>ชิ้น</span>
                        {opts.length > 0 && (
                          <select value={l.assignee_id ?? ""} disabled={!editable}
                            onChange={(e) => { const c = opts.find((x) => x.id === e.target.value); updateLine(l.id, { assignee_id: c?.id ?? null, assignee_name: c?.name ?? null }); }}
                            className="flex-1 h-6 px-1 text-[11px] border rounded min-w-0" style={{ borderColor: "#9fe1cb" }}>
                            <option value="">ทั้งโต๊ะ</option>
                            {opts.map((c) => { const df = defectOf(c.name); return <option key={c.id} value={c.id}>{df ? "⚠️ " : ""}{c.name}</option>; })}
                          </select>
                        )}
                      </div>
                      {(() => { const df = defectOf(l.assignee_name); return df ? <div className="text-[10px] text-amber-600 mt-0.5">⚠️ ช่างนี้เคยมีงานเสีย {df.count} ครั้ง</div> : null; })()}
                    </div>
                  );
                })}
                {reals.length === 0 && drafts.length === 0 && <div className="text-center text-[11px] text-slate-300 py-3">{canDrop ? "กดเพื่อจ่าย (ร่าง)" : "—"}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ยืนยันดันเป็นของจริง */}
      {confirmApply && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => setConfirmApply(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800 mb-1">ดันแผนนี้เป็นของจริง?</h3>
            <p className="text-sm text-slate-500 mb-4">ระบบจะสร้างใบจ่ายงานจริงตามร่างทั้งหมด ({lines.length} รายการ) — หลังจากนี้แผนนี้จะล็อกแก้ไม่ได้</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmApply(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
              <button onClick={doApply} disabled={applying} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{applying ? "กำลังดัน…" : "ยืนยัน ดันเป็นของจริง"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
