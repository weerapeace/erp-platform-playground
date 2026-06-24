"use client";

/**
 * กลุ่ม D — หน้าแผนจ่ายงาน (ร่าง) แบบคอลัมน์
 * - ลองจ่ายงานไปแต่ละโต๊ะแบบ "ร่าง" (เก็บใน mo_dispatch_plan_lines) ไม่กระทบของจริง
 * - ใบจ่ายงานจริงโชว์ล็อกไว้ดูเฉย ๆ (อ่านอย่างเดียว)
 * - กด "ดันเป็นของจริง" → สร้างใบจ่ายงานจริงตามร่างทั้งแผน
 * แยกจากบอร์ด canvas เดิม เพื่อไม่ให้กระทบของจริง
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import type { DispatchPlanLine } from "@/app/api/mo/dispatch-plans/route";

type DeptLite = { id: string; name: string };
type PendingLite = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number; remaining: number; image_url?: string | null };
type WOLite = { id: string; mo_no: string; mo_id?: string | null; qty: number; department_id: string | null; stage: string; assignee_id?: string | null; assignee_name: string | null; assignees?: { id: string | null; name: string }[]; product_sku: string | null; product_name: string | null; status: string; image_url?: string | null; labor?: { prod_plan: number; prod_actual?: number } };
type CraftLite = { id: string; name: string; department_id?: string | null; code?: string | null };
type DefectMap = Record<string, { count: number } | undefined>;

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const baht = (n: number) => "฿" + fmt(n);

function Thumb({ url }: { url?: string | null }) {
  return <HoverImage url={url} size={28} previewSize={224} />;
}

export function DispatchPlanBoard({
  planId, planName, planStatus, startDate, endDate, departments, pending, realWOs, craftsmen, defectByWorker,
  laborPerUnit, imageByMo, deptWages, canEdit, tablet, realMode, onDispatch,
  onApplied, onRenamed, onDates, onDeleted, onOpenWork, onReorderDepts, onManageDepts, onUpdateWO,
}: {
  planId: string; planName: string; planStatus: string; startDate: string | null; endDate: string | null;
  departments: DeptLite[]; pending: PendingLite[]; realWOs: WOLite[]; craftsmen: CraftLite[];
  defectByWorker: DefectMap; deptWages: Record<string, number>;
  laborPerUnit: Record<string, number>;   // mo_no → ค่าแรงผลิตต่อชิ้น (จากแผนกลุ่ม A)
  imageByMo: Record<string, string | null>;
  canEdit: boolean;
  tablet?: boolean;   // โหมดแท็บเล็ต → โฟกัสทีละโต๊ะ (แตะชิปเลือกโต๊ะ + เห็น 2 ช่อง รอจ่าย/โต๊ะที่เลือก)
  realMode?: boolean;   // มุมมอง "ของจริง" — คอลัมน์เหมือนหน้าแผน แต่จ่ายจริงทันที (ไม่ใช่ร่าง)
  onDispatch?: (info: { moId: string; deptId: string; qty: number }) => void;   // จ่ายจริง → เปิดหน้ายืนยัน
  onApplied: () => void; onRenamed: (name: string) => void; onDates: (start: string | null, end: string | null) => void; onDeleted: () => void;
  onOpenWork: (info: { moId: string | null; moNo: string | null; productSku: string | null; productName: string | null; qty: number }) => void;
  onReorderDepts?: (orderedIds: string[]) => void;   // ลากสลับคอลัมน์แผนก → บันทึกลำดับ
  onManageDepts?: () => void;   // เปิดป๊อปอัปตั้งค่าแผนก (ซ่อน/แสดงโต๊ะ ฯลฯ)
  onUpdateWO?: (id: string, patch: { labor_cost?: number; assignees?: { id: string | null; name: string }[]; assignee_name?: string | null; assignee_id?: string | null; assignee_type?: string }) => Promise<void>;   // แก้ใบงานจริง (ของจริงเท่านั้น)
}) {
  const toast = useToast();
  const [lines, setLines] = useState<DispatchPlanLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);   // mo_no ของการ์ดรอจ่ายที่เลือก
  const [dispQty, setDispQty] = useState<Record<string, string>>({});   // จำนวนที่จะจ่าย (แบ่งจ่าย) ต่อ mo_no
  const [staffPopup, setStaffPopup] = useState<DeptLite | null>(null);   // popup ดูพนักงานในแผนก
  const [laborEditId, setLaborEditId] = useState<string | null>(null);   // ใบงานจริงที่กำลังใส่ค่าแรง
  const [laborEditVal, setLaborEditVal] = useState("");
  const [laborSaving, setLaborSaving] = useState(false);
  const [assignPopup, setAssignPopup] = useState<{ wo: WOLite; dept: DeptLite } | null>(null);   // เลือกช่าง (หลายคน) ของใบงานจริง
  const [assignSel, setAssignSel] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  // เปิด/บันทึก ตัวเลือกช่างหลายคน
  const craftsOfDept = useCallback((dept: DeptLite) => /เหมา/.test(dept.name) ? craftsmen : craftsmen.filter((c) => c.department_id === dept.id), [craftsmen]);
  const openAssign = (w: WOLite, dept: DeptLite) => {
    const cur = new Set<string>();
    (w.assignees ?? []).forEach((a) => { if (a.id) cur.add(a.id); });
    if (cur.size === 0 && w.assignee_id) cur.add(w.assignee_id);   // ของเดิม (ช่างเดี่ยว)
    setAssignSel(cur); setAssignPopup({ wo: w, dept });
  };
  const saveAssign = async () => {
    if (!assignPopup || !onUpdateWO) return;
    const list = [...assignSel].map((id) => { const c = craftsmen.find((x) => x.id === id); return c ? { id: c.id, name: c.name } : null; }).filter(Boolean) as { id: string; name: string }[];
    setAssignSaving(true);
    try {
      await onUpdateWO(assignPopup.wo.id, { assignees: list, assignee_name: list.map((x) => x.name).join(", ") || null, assignee_id: list[0]?.id ?? null, assignee_type: list.length ? "craftsman" : "department" });
      setAssignPopup(null);
    } catch { /* parent toast */ } finally { setAssignSaving(false); }
  };
  const [focusDept, setFocusDept] = useState<string | null>(null);   // โหมดแท็บเล็ต: โต๊ะที่กำลังโฟกัส
  const [colW, setColW] = useState(240);   // ความกว้างคอลัมน์/โต๊ะ (px) — ปรับได้ จำที่เครื่อง
  useEffect(() => { try { const v = Number(localStorage.getItem("wb:planColW")); if (v >= 180 && v <= 480) setColW(v); } catch { /* ignore */ } }, []);
  const setColWidth = (w: number) => { const v = Math.max(180, Math.min(480, Math.round(w))); setColW(v); try { localStorage.setItem("wb:planColW", String(v)); } catch { /* ignore */ } };
  // กลุ่มใบสั่งงาน (สำหรับแท็บกรองในคอลัมน์รอจ่าย)
  const [moGroups, setMoGroups] = useState<{ name: string; mo_nos: string[] }[]>([]);
  const [groupTab, setGroupTab] = useState<string>("__all__");   // __all__ | ชื่อกลุ่ม | __none__
  useEffect(() => { void (async () => { try { const r = await apiFetch("/api/mo/groups"); const j = await r.json();
    setMoGroups(((j.data ?? []) as { name: string; mo_nos: unknown }[]).map((g) => ({ name: g.name, mo_nos: (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[] }))); } catch { /* ignore */ } })(); }, []);
  const groupsOf = (moNo: string) => moGroups.filter((g) => g.mo_nos.includes(moNo)).map((g) => g.name);
  const inGroupTab = (moNo: string) => groupTab === "__all__" ? true : groupTab === "__none__" ? groupsOf(moNo).length === 0 : groupsOf(moNo).includes(groupTab);
  const [name, setName] = useState(planName);
  const [sDate, setSDate] = useState(startDate ?? "");
  const [eDate, setEDate] = useState(endDate ?? "");
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const applied = planStatus === "applied";
  const editable = canEdit && !applied;

  useEffect(() => { setName(planName); }, [planName]);
  useEffect(() => { setSDate(startDate ?? ""); setEDate(endDate ?? ""); }, [startDate, endDate]);

  const load = useCallback(async () => {
    if (realMode) { setLines([]); setLoading(false); return; }   // ของจริง: ไม่มีร่าง — โต๊ะโชว์ใบจ่ายงานจริง
    setLoading(true);
    try { const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`); const j = await r.json();
      setLines((j?.data?.lines ?? []) as DispatchPlanLine[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [planId, realMode]);
  useEffect(() => { setSelected(null); void load(); }, [load]);

  const defectOf = (nm: string | null | undefined) => nm ? defectByWorker[nm.trim().toLowerCase()] : undefined;
  // ค่าแรงผลิตของรายการร่าง = จำนวน × ค่าแรงต่อชิ้น (จากแผนกลุ่ม A)
  const lineLabor = (l: DispatchPlanLine) => (Number(l.qty) || 0) * (laborPerUnit[l.mo_no ?? ""] ?? 0);
  const woLabor = (w: WOLite) => (w.labor?.prod_actual || w.labor?.prod_plan || ((Number(w.qty) || 0) * (laborPerUnit[w.mo_no] ?? 0)));

  // จำนวนที่วางแผนไปแล้วต่อใบ (ในแผนนี้) → เหลือให้วางแผนได้อีกเท่าไร
  const draftedByMo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.mo_no) m.set(l.mo_no, (m.get(l.mo_no) ?? 0) + (Number(l.qty) || 0));
    return m;
  }, [lines]);
  const availOf = (p: PendingLite) => Math.max(0, Math.round((p.remaining - (draftedByMo.get(p.mo_no) ?? 0)) * 100) / 100);
  // จำนวนที่จะจ่ายครั้งนี้ (แบ่งจ่าย) — ว่าง = จ่ายเต็มที่เหลือ · ไม่เกินที่เหลือ
  const dispQtyOf = (p: PendingLite) => {
    const raw = dispQty[p.mo_no]; const av = availOf(p);
    const n = raw === undefined || raw === "" ? av : Number(raw);
    return Math.max(0, Math.min(av, Number.isFinite(n) ? n : 0));
  };

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

  const addBusyRef = useRef(false);   // กันคลิกโต๊ะรัวๆ สร้างการ์ดร่างซ้ำระหว่างรอเน็ต
  const addLineFor = async (moNo: string, dept: DeptLite) => {
    if (!editable) return;
    const p = pending.find((x) => x.mo_no === moNo); if (!p) return;
    const qty = dispQtyOf(p);
    if (qty <= 0) { toast.info("ใส่จำนวนที่จะจ่ายก่อน (หรือใบนี้วางแผนครบแล้ว)"); return; }
    if (realMode) { onDispatch?.({ moId: p.id, deptId: dept.id, qty }); setDispQty((d) => { const n = { ...d }; delete n[moNo]; return n; }); setSelected(null); return; }   // ของจริง → เปิดหน้ายืนยันจ่าย
    try {
      const r = await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_line", line: { mo_no: p.mo_no, mo_id: p.id, product_sku: p.product_sku, product_name: p.product_name, qty, department_id: dept.id, department_name: dept.name } }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setLines((ls) => [...ls, j.data as DispatchPlanLine]);
      setDispQty((d) => { const n = { ...d }; delete n[moNo]; return n; });   // จ่ายแล้ว → รีเซ็ตช่อง (default = ที่เหลือใหม่)
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const addLine = (dept: DeptLite) => {
    if (!selected || addBusyRef.current) return;   // addBusyRef กันแตะรัวซ้ำระหว่างรอเน็ต
    addBusyRef.current = true;
    // ไม่ล้าง selected → จ่ายแล้วการ์ดยังเลือกอยู่ จ่ายส่วนที่เหลือไปโต๊ะอื่นต่อได้ (แบ่งจ่าย)
    void addLineFor(selected, dept).finally(() => { addBusyRef.current = false; });
  };
  // ลากการ์ดร่างย้ายโต๊ะ
  const moveLine = async (lineId: string, dept: DeptLite) => {
    if (!editable) return;
    setLines((ls) => ls.map((l) => l.id === lineId ? { ...l, department_id: dept.id, department_name: dept.name, assignee_id: null, assignee_name: null } as DispatchPlanLine : l));
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_line", lineId, department_id: dept.id, department_name: dept.name }) }); }
    catch { void load(); }
  };
  // ลากการ์ด (HTML5) — เก็บข้อมูลว่ากำลังลากอะไร
  const dragRef = useRef<{ kind: "pending" | "draft"; moNo: string; lineId?: string } | null>(null);
  const dropToDept = (dept: DeptLite) => {
    const d = dragRef.current; dragRef.current = null; if (!d) return;
    if (d.kind === "pending") void addLineFor(d.moNo, dept);
    else if (d.kind === "draft" && d.lineId) void moveLine(d.lineId, dept);
  };
  // ลากสลับคอลัมน์แผนก (C4)
  const deptDragRef = useRef<string | null>(null);
  const reorderDept = (targetId: string) => {
    const src = deptDragRef.current; deptDragRef.current = null;
    if (!src || src === targetId || !onReorderDepts) return;
    const ids = departments.map((d) => d.id);
    const from = ids.indexOf(src), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorderDepts(ids);
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
  const saveDates = async () => {
    const s = sDate || null, e = eDate || null;
    try { await apiFetch(`/api/mo/dispatch-plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", start_date: s, end_date: e }) }); onDates(s, e); }
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
  const visiblePending = pending.filter((p) => availOf(p) > 0 && inGroupTab(p.mo_no));
  // โหมดแท็บเล็ต: โฟกัสทีละโต๊ะ → เห็น 2 ช่อง (รอจ่าย + โต๊ะที่เลือก) ลดการเลื่อนหาคอลัมน์
  const focusedId = tablet ? (departments.some((d) => d.id === focusDept) ? focusDept : departments[0]?.id ?? null) : null;
  const shownDepts = tablet ? departments.filter((d) => d.id === focusedId) : departments;
  const draftCountOf = (id: string) => (draftByDept.get(id) ?? []).length;

  // การ์ดร่าง 1 ใบ (แยกไว้เพื่อจัดกลุ่มตามช่างได้)
  const draftCard = (l: DispatchPlanLine, d: DeptLite) => {
    const opts = deptCraftsmen(d);
    return (
      <div key={l.id}
        className="rounded-lg px-2 py-1.5 mb-1.5" style={{ background: "#e1f5ee", border: "1.5px dashed #1d9e75" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {editable && <span draggable onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: "draft", moNo: l.mo_no ?? "", lineId: l.id }; deptDragRef.current = null; }} title="ลากย้ายโต๊ะ" className="shrink-0 cursor-move text-emerald-400 hover:text-emerald-600 select-none">⠿</span>}
            <Thumb url={imageByMo[l.mo_no ?? ""]} />
            <span className="text-sm font-semibold truncate" style={{ color: "#0f6e56" }}>{l.product_sku}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onOpenWork({ moId: l.mo_id, moNo: l.mo_no, productSku: l.product_sku, productName: l.product_name, qty: Number(l.qty) || 0 })} title="ดูรายละเอียดงาน" className="text-slate-400 hover:text-blue-600 text-xs">🔍</button>
            <span className="text-[10px] px-1 rounded" style={{ color: "#0f6e56", border: "0.5px solid #5dcaa5" }}>ร่าง</span>
            {editable && <button onClick={() => removeLine(l.id)} className="text-rose-400 hover:text-rose-600 text-xs" title="เอาออก">✕</button>}
          </div>
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: "#0f6e56" }}>ค่าแรงผลิต {baht(lineLabor(l))} ({fmt(Number(l.qty) || 0)} × {baht(laborPerUnit[l.mo_no ?? ""] ?? 0)})</div>
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
  };

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือของแผน */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-xl px-3 py-2">
        {realMode ? <span className="text-sm font-semibold text-slate-700">📋 จ่ายงานจริง</span> : <>
          <span className="text-[11px] text-slate-400">ชื่อแผน</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} disabled={!editable}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
          <span className="text-[11px] text-slate-400 ml-1">เริ่ม</span>
          <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} onBlur={saveDates} disabled={!editable}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
          <span className="text-[11px] text-slate-400">เสร็จ</span>
          <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} onBlur={saveDates} disabled={!editable}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
          {applied && <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">ดันเป็นของจริงแล้ว</span>}
        </>}
        <div className="flex-1" />
        {!tablet && (
          <div className="flex items-center gap-1.5" title="ปรับความกว้างของโต๊ะ — กว้างขึ้นรหัสจะอยู่บรรทัดเดียว">
            <span className="text-[11px] text-slate-400">↔ กว้างโต๊ะ</span>
            <input type="range" min={180} max={480} step={10} value={colW} onChange={(e) => setColWidth(Number(e.target.value))} className="w-28 accent-indigo-600" />
          </div>
        )}
        {onManageDepts && <button onClick={onManageDepts} className="h-8 px-3 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">⚙️ จัดการโต๊ะ</button>}
        {!realMode && editable && <button onClick={() => setConfirmApply(true)} disabled={lines.length === 0}
          className="h-8 px-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">🚀 ดันเป็นของจริง</button>}
        {!realMode && <button onClick={deletePlan} className="h-8 px-2.5 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">ลบแผน</button>}
      </div>

      {/* คำอธิบายสัญลักษณ์ */}
      <div className="flex gap-4 flex-wrap text-[11px] text-slate-500">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm border border-slate-300 align-[-1px]" /> รอจ่าย</span>
        {!realMode && <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px]" style={{ border: "1.5px dashed #1d9e75" }} /> ร่าง (ทดลอง)</span>}
        <span>{realMode ? "📋 จ่ายจริงแล้ว" : "🔒 จ่ายจริง (ล็อก)"}</span>
        {editable && <span className="text-indigo-500">{realMode ? "แตะการ์ดรอจ่าย → แตะที่โต๊ะ → ยืนยันจ่ายจริง" : tablet ? "แตะการ์ดรอจ่าย → แตะที่โต๊ะเพื่อจ่าย (ไม่ต้องลาก)" : "กดการ์ดรอจ่าย → กดที่โต๊ะเพื่อจ่ายแบบร่าง"}</span>}
      </div>

      {/* แท็บเล็ต: แถบชิปเลือกโต๊ะที่จะโฟกัส */}
      {tablet && departments.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <span className="text-sm text-slate-400 shrink-0">โต๊ะ:</span>
          {departments.map((d) => {
            const on = d.id === focusedId; const n = draftCountOf(d.id);
            return (
              <button key={d.id} type="button" onClick={() => setFocusDept(d.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {d.name}{n > 0 && <span className={`ml-1.5 text-[11px] ${on ? "text-indigo-100" : "text-slate-400"}`}>({n})</span>}
              </button>
            );
          })}
        </div>
      )}

      {loading ? <div className="text-center py-10 text-slate-400 text-sm">กำลังโหลดแผน…</div> : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: tablet ? "1fr 1fr" : `repeat(auto-fill, minmax(${colW}px, 1fr))` }}>
          {/* คอลัมน์รอจ่าย */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 min-h-[140px]"
            onDragOver={(e) => { if (editable && dragRef.current?.kind === "draft") e.preventDefault(); }}
            onDrop={() => { if (!editable) return; const d = dragRef.current; dragRef.current = null; if (d?.kind === "draft" && d.lineId) void removeLine(d.lineId); }}>
            <div className="sticky top-0 z-20 flex items-center justify-between -mx-2 -mt-2 px-2 pt-2 pb-2 mb-2 bg-slate-100 rounded-t-xl border-b border-slate-200"><span className="text-sm font-bold text-slate-700">📥 รอจ่าย</span>
              <span className="text-[11px] text-slate-400">{visiblePending.length}</span></div>
            {/* แท็บกรองตามกลุ่มใบสั่งงาน */}
            {moGroups.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {([["__all__", "ทั้งหมด"], ...moGroups.map((g) => [g.name, g.name] as [string, string]), ["__none__", "ยังไม่จับกลุ่ม"]] as [string, string][]).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setGroupTab(key)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${groupTab === key ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
                ))}
              </div>
            )}
            {visiblePending.map((p) => {
              const on = selected === p.mo_no;
              return (
                <div key={p.id}
                  onClick={() => editable && setSelected(on ? null : p.mo_no)}
                  className={`rounded-lg px-2 py-1.5 mb-1.5 bg-white ${on ? "ring-2 ring-indigo-400 border-indigo-300" : "border border-slate-200"} ${editable ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    {editable && <span draggable onDragStart={(e) => { e.stopPropagation(); dragRef.current = { kind: "pending", moNo: p.mo_no }; }} onClick={(e) => e.stopPropagation()} title="ลากไปวางที่โต๊ะ" className="shrink-0 cursor-move text-slate-300 hover:text-slate-500 select-none">⠿</span>}
                    <Thumb url={p.image_url} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 truncate">{p.product_sku}</div>
                      <div className="text-[10px] text-slate-400 truncate">{p.mo_no} · ค่าแรง {baht(laborPerUnit[p.mo_no] ?? 0)}/ชิ้น</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: p.id, moNo: p.mo_no, productSku: p.product_sku, productName: p.product_name, qty: p.qty }); }} title="ดูรายละเอียดงาน" className="shrink-0 text-slate-300 hover:text-blue-600">🔍</button>
                  </div>
                  {/* จำนวนที่เหลือต้องจ่าย — เด่น ๆ */}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700">เหลือจ่าย <b className="text-base font-bold tabular-nums">{fmt(availOf(p))}</b> ชิ้น</span>
                    {!on && editable && <span className="text-[10px] text-slate-300">แตะเพื่อจ่าย</span>}
                  </div>
                  {/* แบ่งจ่าย — ระบุจำนวนแล้วแตะโต๊ะ (จ่ายส่วนที่เหลือไปโต๊ะอื่นต่อได้) */}
                  {on && editable && (
                    <div className="mt-1.5 flex items-center gap-1.5 bg-indigo-50/70 border border-indigo-100 rounded-lg px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px] font-medium text-indigo-700 shrink-0">✂️ แบ่งจ่าย</span>
                      <input type="number" min={0} max={availOf(p)} step="any"
                        value={dispQty[p.mo_no] ?? String(availOf(p))}
                        onChange={(e) => setDispQty((d) => ({ ...d, [p.mo_no]: e.target.value }))}
                        className="w-16 h-7 px-1.5 text-sm text-right border border-indigo-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                      <span className="text-[11px] text-slate-500 shrink-0">ชิ้น</span>
                      <span className="text-[10px] text-indigo-500 ml-auto shrink-0">→ แตะโต๊ะ</span>
                    </div>
                  )}
                </div>
              );
            })}
            {visiblePending.length === 0 && <div className="text-center text-[11px] text-slate-300 py-3">— ไม่มีใบในกลุ่มนี้ —</div>}
          </div>

          {/* คอลัมน์แผนก (แท็บเล็ต = เฉพาะโต๊ะที่โฟกัส) */}
          {shownDepts.map((d) => {
            const reals = realByDept.get(d.id) ?? [];
            const drafts = draftByDept.get(d.id) ?? [];
            const totQty = drafts.reduce((a, l) => a + (Number(l.qty) || 0), 0) + reals.reduce((a, w) => a + (Number(w.qty) || 0), 0);
            const totLabor = drafts.reduce((a, l) => a + lineLabor(l), 0) + reals.reduce((a, w) => a + woLabor(w), 0);
            const canDrop = editable && !!selected;
            return (
              <div key={d.id} onClick={() => canDrop && addLine(d)}
                onDragOver={(e) => { if (editable) e.preventDefault(); }} onDrop={() => editable && dropToDept(d)}
                className={`rounded-xl border p-2 min-h-[140px] ${canDrop ? "border-dashed border-indigo-300 bg-indigo-50/30 cursor-pointer" : "border-slate-200 bg-white"}`}>
                <div className="sticky top-0 z-20 flex items-center justify-between gap-1 -mx-2 -mt-2 px-2 pt-2 pb-2 mb-1.5 bg-white rounded-t-xl border-b border-slate-100"
                  onDragOver={(e) => { if (onReorderDepts && deptDragRef.current) e.preventDefault(); }}
                  onDrop={(e) => { if (deptDragRef.current) { e.stopPropagation(); reorderDept(d.id); } }}>
                  <div className="flex items-center gap-1 min-w-0">
                    {onReorderDepts && <span draggable onDragStart={(e) => { e.stopPropagation(); deptDragRef.current = d.id; dragRef.current = null; }} title="ลากสลับตำแหน่งโต๊ะ" className="shrink-0 cursor-move text-slate-300 hover:text-slate-500 select-none">⠿</span>}
                    <span className="text-sm font-bold text-slate-700 truncate">{d.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setStaffPopup(d); }} title="ดูพนักงานในแผนก" className="shrink-0 text-slate-300 hover:text-violet-600 text-[11px]">👥</button>
                  </div>
                  <span className="text-[10px] text-right shrink-0 leading-tight">
                    {(deptWages[d.id] ?? 0) > 0 && <span className="block text-violet-600" title="เงินเดือนรวมพนักงานในแผนก">คน {baht(deptWages[d.id])}</span>}
                    {totQty > 0 && <span className="block text-slate-500" title="ค่าแรงงานที่จ่ายในโต๊ะนี้">งาน {fmt(totQty)} ชิ้น · {baht(totLabor)}</span>}
                    {(deptWages[d.id] ?? 0) > 0 && totLabor > 0 && (() => { const diff = (deptWages[d.id] ?? 0) - totLabor; return <span className={`block ${diff >= 0 ? "text-amber-600" : "text-rose-600"}`} title="เงินเดือนพนักงาน − ค่าแรงงานที่จ่าย">ต่าง {baht(diff)}</span>; })()}
                  </span>
                </div>
                {/* ใบจ่ายจริง — ในแผน "ล็อก" (ดูอย่างเดียว) · ในของจริง "แก้ได้" (ใส่ค่าแรง ฯลฯ) */}
                {reals.map((w) => {
                  const wl = woLabor(w);
                  const canEditWO = realMode && editable && !!onUpdateWO;
                  const editing = laborEditId === w.id;
                  return (
                  <div key={w.id} className={`rounded-lg px-2 py-1.5 mb-1.5 bg-slate-50 border border-slate-200 ${realMode ? "" : "opacity-70"}`}>
                    <div className="flex items-center gap-2">
                      <Thumb url={w.image_url} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-medium text-slate-600 truncate">{w.product_sku}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); onOpenWork({ moId: w.mo_id ?? null, moNo: w.mo_no, productSku: w.product_sku, productName: w.product_name, qty: w.qty }); }} title="ดูรายละเอียดงาน" className="text-slate-400 hover:text-blue-600 text-xs">🔍</button>
                            {!realMode && <span className="text-slate-400" title="จ่ายจริงแล้ว — ในแผนดูอย่างเดียว">🔒</span>}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {/* #3: เลือกช่างหลายคน (เฉพาะของจริง) — กดที่ชื่อเพื่อเลือก */}
                          {canEditWO
                            ? <button onClick={(e) => { e.stopPropagation(); openAssign(w, d); }} className="text-violet-600 hover:underline font-medium">👤 {w.assignee_name || "เลือกช่าง"} ✎</button>
                            : <span>{w.assignee_name ?? "—"}</span>}
                          {" · "}{fmt(w.qty)} ชิ้น · {baht(wl)}
                        </div>
                        {/* #2: ใส่ค่าแรง (เฉพาะของจริง + การ์ดที่ยังไม่มีค่าแรง) — กดง่าย */}
                        {canEditWO && wl <= 0 && !editing && (
                          <button onClick={(e) => { e.stopPropagation(); setLaborEditId(w.id); setLaborEditVal(""); }}
                            className="mt-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">💰 ใส่ค่าแรง</button>
                        )}
                        {canEditWO && editing && (
                          <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input type="number" min={0} step="any" autoFocus value={laborEditVal} onChange={(e) => setLaborEditVal(e.target.value)} placeholder="บาท/ชิ้น"
                              className="w-20 h-7 px-1.5 text-xs text-right border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400" />
                            <span className="text-[10px] text-slate-400 shrink-0">× {fmt(w.qty)} = ฿{fmt((Number(laborEditVal) || 0) * (Number(w.qty) || 0))}</span>
                            <button disabled={laborSaving} title="บันทึก" onClick={async () => {
                              setLaborSaving(true);
                              try { await onUpdateWO!(w.id, { labor_cost: (Number(laborEditVal) || 0) * (Number(w.qty) || 0) }); setLaborEditId(null); }
                              catch { /* parent toast */ } finally { setLaborSaving(false); }
                            }} className="h-7 px-2 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">✓</button>
                            <button title="ยกเลิก" onClick={() => setLaborEditId(null)} className="h-7 px-1.5 text-xs text-slate-400 hover:text-slate-600">✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
                {/* รายการร่าง — จัดกลุ่มย่อยตามช่าง */}
                {(() => {
                  const byCraft = new Map<string, DispatchPlanLine[]>();
                  for (const l of drafts) { const k = l.assignee_name || ""; (byCraft.get(k) ?? byCraft.set(k, []).get(k)!).push(l); }
                  const showHeads = byCraft.size > 1 || [...byCraft.keys()].some((k) => k);   // มีหลายช่าง หรือมีระบุช่าง → โชว์หัวกลุ่มช่าง
                  return [...byCraft.entries()].map(([craft, ls]) => (
                    <div key={craft || "__none__"}>
                      {showHeads && (
                        <div className="flex items-center justify-between text-[10px] font-medium mt-1 mb-0.5 px-0.5" style={{ color: "#0f6e56" }}>
                          <span className="truncate">👤 {craft || "ทั้งโต๊ะ (ไม่ระบุช่าง)"}</span>
                          <span className="text-slate-400 shrink-0">{fmt(ls.reduce((a, l) => a + (Number(l.qty) || 0), 0))} ชิ้น · {baht(ls.reduce((a, l) => a + lineLabor(l), 0))}</span>
                        </div>
                      )}
                      {ls.map((l) => draftCard(l, d))}
                    </div>
                  ));
                })()}
                {reals.length === 0 && drafts.length === 0 && <div className="text-center text-[11px] text-slate-300 py-3">{canDrop ? "กดเพื่อจ่าย (ร่าง)" : "—"}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* #3: เลือกช่างหลายคน (multi-pick) ให้ใบงานจริง */}
      {assignPopup && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => setAssignPopup(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-xs w-full p-4 max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-slate-800 truncate">👤 เลือกช่าง (เลือกได้หลายคน)</h3>
              <button onClick={() => setAssignPopup(null)} className="text-slate-400 hover:text-slate-600 shrink-0">✕</button>
            </div>
            <div className="text-[11px] text-slate-400 mb-2">{assignPopup.dept.name} · เลือกแล้ว {assignSel.size} คน</div>
            <div className="flex-1 overflow-auto -mx-1 px-1 space-y-0.5">
              {(() => {
                const crafts = craftsOfDept(assignPopup.dept);
                if (crafts.length === 0) return <div className="text-[12px] text-slate-300 py-4 text-center">แผนกนี้ยังไม่มีช่าง</div>;
                return crafts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm">
                    <input type="checkbox" checked={assignSel.has(c.id)} onChange={() => setAssignSel((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className="w-4 h-4 accent-violet-600" />
                    <span className="flex-1 truncate text-slate-700">{c.code ? `[${c.code}] ` : ""}{c.name}</span>
                  </label>
                ));
              })()}
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <button onClick={() => setAssignSel(new Set())} className="h-8 px-2 text-xs text-slate-500 hover:text-slate-700">ล้าง (ทั้งโต๊ะ)</button>
              <button disabled={assignSaving} onClick={saveAssign} className="h-8 px-4 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">{assignSaving ? "บันทึก…" : "บันทึก"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ยืนยันดันเป็นของจริง */}
      {staffPopup && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onClick={() => setStaffPopup(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-xs w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-800 truncate">👥 พนักงาน — {staffPopup.name}</h3>
              <button onClick={() => setStaffPopup(null)} className="text-slate-400 hover:text-slate-600 shrink-0">✕</button>
            </div>
            {(() => {
              const list = craftsmen.filter((c) => c.department_id === staffPopup.id);
              return list.length === 0
                ? <p className="text-xs text-slate-400 py-3 text-center">แผนกนี้ยังไม่มีพนักงานผูกไว้</p>
                : <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">{list.map((c) => <div key={c.id} className="py-1.5 text-sm text-slate-700">{c.code ? <code className="text-[10px] text-slate-400 mr-1">[{c.code}]</code> : null}{c.name}</div>)}</div>;
            })()}
            {(deptWages[staffPopup.id] ?? 0) > 0 && <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-violet-700">เงินเดือนรวมในแผนก {baht(deptWages[staffPopup.id])}</div>}
          </div>
        </div>
      )}

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
