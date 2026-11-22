"use client";

// ============================================================
// หน้าจัดการสถานะงานแบบละเอียด (/tasks/settings?tab=status) — เจ้าของเลือก 2026-11-22 (แทนแท็บ "สถานะ" + "เส้นทาง" ที่แยกกัน)
//  • บน: ผังเส้นทางสถานะ (ดูอย่างเดียว) · ซ้าย: รายการสถานะ ลากเรียงได้ · ขวา: ตั้งค่าสถานะที่เลือก
//  • ตั้งค่าต่อสถานะ: ชื่อไทย/อังกฤษ · สี · % · ปิดงาน/ต้องอนุมัติ/เริ่มต้น · ไปต่อได้ที่ไหน (ป้ายปุ่ม/ชนิด) · เงื่อนไขก่อนเข้า (เตือน/ห้าม)
//  • ข้อมูล: ตารางสถานะ/เส้นทางเดิม (use-statuses · ไม่ย้ายข้อมูล) + เงื่อนไขใน ui_config task_status_gates (lib/task-status-gates)
//  • ทุกการแก้บันทึกประวัติฝั่ง server (API สถานะ/เส้นทาง/ui-config)
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { LoadingState } from "@/components/state-views";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { STATUS_COLOR_OPTIONS, statusColor } from "@/lib/creative-status-colors";
import { listStatuses, createStatus, updateStatus, deleteStatus, setTransition, deleteTransition, type Status, type Transition } from "./use-statuses";
import { gateOf, STATUS_GATES_KEY, type GateMode, type StatusGates } from "@/lib/task-status-gates";
import { loadStatusGates, clearStatusGatesCache } from "./status-gate-check";

const KINDS = [
  { value: "normal", label: () => tr("ปกติ", "Normal") }, { value: "approve", label: () => tr("อนุมัติ", "Approve") },
  { value: "reject", label: () => tr("ไม่ผ่าน", "Reject") }, { value: "revise", label: () => tr("ให้แก้", "Revise") }, { value: "block", label: () => tr("ติดปัญหา", "Blocked") },
];
const GATE_OPTS: { v: GateMode; th: string; en: string }[] = [{ v: "off", th: "ไม่เช็ก", en: "Off" }, { v: "warn", th: "แค่เตือน", en: "Warn" }, { v: "block", th: "ห้ามย้าย", en: "Block" }];

export function StatusWorkflowManager() {
  const t = useT();
  const toast = useToast();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [gates, setGates] = useState<StatusGates | null>(null);
  const [loading, setLoading] = useState(true);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([listStatuses(), loadStatusGates(true)]);
      setStatuses(r.statuses); setTransitions(r.transitions); setGates(g);
      setSelKey((k) => k && r.statuses.some((s) => s.key === k) ? k : r.statuses[0]?.key ?? null);
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  // ใช้อยู่กี่งาน (สถานะที่เลือก) — นับตอนเลือก
  useEffect(() => {
    if (!selKey || usage[selKey] != null) return;
    apiFetch(`/api/creative-tasks?status=${encodeURIComponent(selKey)}&limit=1`).then((r) => r.json())
      .then((j) => setUsage((u) => ({ ...u, [selKey]: Number(j?.total ?? 0) }))).catch(() => undefined);
  }, [selKey, usage]);

  const sel = statuses.find((s) => s.key === selKey) ?? null;
  const labelOf = useCallback((k: string) => { const s = statuses.find((x) => x.key === k); return s ? tr(s.label, s.label_en || s.label) : k; }, [statuses]);

  const patch = async (id: string, p: Record<string, unknown>) => { try { await updateStatus(id, p); await load(); } catch (e) { toast.error((e as Error).message); } };
  const reorder = async (from: number, to: number) => {
    const next = moveItem(statuses, from, to); setStatuses(next);
    const jobs = next.map((s, idx) => ({ s, idx })).filter(({ s, idx }) => s.sort_order !== idx);
    try { await Promise.all(jobs.map(({ s, idx }) => updateStatus(s.id!, { sort_order: idx }))); setStatuses(next.map((s, idx) => ({ ...s, sort_order: idx }))); }
    catch (e) { toast.error((e as Error).message); await load(); }
  };
  const { rowProps, handleProps, rowCls } = useDragReorder(reorder);

  const [newLabel, setNewLabel] = useState("");
  const add = async () => {
    if (!newLabel.trim()) return;
    try { await createStatus({ label: newLabel.trim(), color: "slate" }); setNewLabel(""); await load(); toast.success(t("เพิ่มสถานะแล้ว", "Status added")); }
    catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (s: Status) => {
    const n = usage[s.key] ?? 0;
    if (!(await askConfirm({ title: t(`ลบสถานะ "${s.label}"?`, `Delete status "${s.label}"?`), message: n ? t(`มีงานใช้สถานะนี้อยู่ ${n} งาน — ย้ายงานออกก่อนลบ`, `${n} task(s) use this status — move them first`) : t("ลบแล้วกู้คืนไม่ได้ (เส้นทางที่ผูกกับสถานะนี้จะหายด้วย)", "This can't be undone (its transitions go too)"), variant: "danger" }))) return;
    try { await deleteStatus(s.id!); await load(); toast.success(t("ลบแล้ว", "Deleted")); } catch (e) { toast.error((e as Error).message); }
  };

  // เส้นทางจากสถานะที่เลือก
  const fromList = transitions.filter((x) => x.from_key === selKey);
  const [tTo, setTTo] = useState(""); const [tKind, setTKind] = useState("normal"); const [tLabel, setTLabel] = useState("");
  useEffect(() => { setTTo(""); setTKind("normal"); setTLabel(""); }, [selKey]);
  const saveTransition = async () => {
    if (!selKey || !tTo) { toast.error(t("เลือกปลายทางก่อน", "Pick a destination first")); return; }
    try { await setTransition({ from_key: selKey, to_key: tTo, label: tLabel.trim() || `→ ${labelOf(tTo)}`, kind: tKind }); setTTo(""); setTLabel(""); setTKind("normal"); await load(); toast.success(t("บันทึกเส้นทางแล้ว", "Transition saved")); }
    catch (e) { toast.error((e as Error).message); }
  };
  const removeTransition = async (x: Transition) => {
    try {
      await deleteTransition(x.id!); await load();
      toast.undo(t(`ลบเส้นทาง → ${labelOf(x.to_key)} แล้ว`, `Removed → ${labelOf(x.to_key)}`), async () => {
        try { await setTransition({ from_key: x.from_key, to_key: x.to_key, label: x.label, kind: x.kind }); await load(); } catch (e) { toast.error((e as Error).message); }
      });
    } catch (e) { toast.error((e as Error).message); }
  };

  // เงื่อนไขก่อนเข้าสถานะ
  const setGate = async (key: string, field: "readiness" | "content", mode: GateMode) => {
    if (!gates) return;
    const prev = gates;
    const next: StatusGates = { ...gates, [key]: { ...gateOf(gates, key), [field]: mode } };
    setGates(next);
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: STATUS_GATES_KEY, value: next }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      clearStatusGatesCache();
      toast.success(t("บันทึกเงื่อนไขแล้ว", "Rule saved"));
    } catch (e) { setGates(prev); toast.error((e as Error).message); }
  };

  // ผังเส้นทาง (ดูอย่างเดียว): สถานะเรียงตามลำดับ + ชนิดเส้นทางที่ออก
  const outCount = useMemo(() => { const m: Record<string, number> = {}; for (const x of transitions) m[x.from_key] = (m[x.from_key] ?? 0) + 1; return m; }, [transitions]);

  if (loading) return <LoadingState />;
  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="font-semibold text-slate-800">{t("สถานะงาน + เส้นทาง", "Task statuses + transitions")}</h2>
          <span className="text-[11px] text-slate-400">{t("กดสถานะเพื่อตั้งค่า", "Click a status to configure")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {statuses.map((s, i) => { const c = statusColor(s.color); return (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <button type="button" onClick={() => setSelKey(s.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${c.cls} ${selKey === s.key ? "ring-2 ring-violet-300" : ""}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{tr(s.label, s.label_en || s.label)}
                <span className="text-[10px] opacity-60">{s.progress_percent}%</span>
                {s.is_approval_gate && <span title={t("ต้องอนุมัติ", "Needs approval")}>✓</span>}
                {gates && (gateOf(gates, s.key).readiness === "block" || gateOf(gates, s.key).content === "block") && <span title={t("มีเงื่อนไขห้ามย้าย", "Has a blocking rule")}>⛔</span>}
              </button>
              {i < statuses.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ); })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t("ลูกศรคือลำดับในบอร์ด — ทางไปต่อจริงของแต่ละสถานะตั้งในกล่องขวา", "Arrows show board order — each status's real next steps are set on the right")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* ซ้าย: รายการสถานะ ลากเรียง */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 space-y-1.5">
          <p className="text-xs text-slate-400">{t("รายการสถานะ (ลากเรียงได้)", "Statuses (drag to reorder)")}</p>
          {statuses.map((s, i) => (
            <div key={s.key} {...rowProps(i)} onClick={() => setSelKey(s.key)}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 cursor-pointer ${selKey === s.key ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:bg-slate-50"} ${rowCls(i)}`}>
              <DragHandle {...handleProps(i)} title={t("ลากเพื่อจัดลำดับ", "Drag to reorder")} />
              <span className={`h-2.5 w-2.5 rounded-full ${statusColor(s.color).dot}`} />
              <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{tr(s.label, s.label_en || s.label)}</span>
              <span className="text-[11px] text-slate-400">{s.progress_percent}%</span>
              <span className="text-[10px] text-slate-300" title={t("ทางไปต่อ", "Next steps")}>→{outCount[s.key] ?? 0}</span>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder={t("เพิ่มสถานะใหม่…", "Add a status…")} className="flex-1 h-8 border border-slate-200 rounded-lg px-2 text-sm" />
            <button type="button" onClick={() => void add()} className="h-8 px-3 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700">＋</button>
          </div>
        </div>

        {/* ขวา: ตั้งค่าสถานะที่เลือก */}
        {sel ? (
          <div key={sel.key} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 flex-1">{t("ตั้งค่า", "Settings")} “{tr(sel.label, sel.label_en || sel.label)}”</h3>
              <span className="text-[11px] text-slate-400">{usage[sel.key] != null ? t(`ใช้อยู่ ${usage[sel.key]} งาน`, `${usage[sel.key]} task(s)`) : "…"}</span>
              <span className="font-mono text-[10px] text-slate-300">{sel.key}</span>
            </div>
            <section className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-400">{t("ชื่อไทย", "Thai name")}<input defaultValue={sel.label} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== sel.label) void patch(sel.id!, { label: v }); }} className="mt-0.5 w-full h-8 border border-slate-200 rounded-lg px-2 text-sm text-slate-700" /></label>
              <label className="text-xs text-slate-400">{t("ชื่ออังกฤษ (ว่าง = ใช้ไทย)", "English (blank = Thai)")}<input defaultValue={sel.label_en ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (sel.label_en ?? "")) void patch(sel.id!, { label_en: v || null }); }} className="mt-0.5 w-full h-8 border border-slate-200 rounded-lg px-2 text-sm text-slate-700" /></label>
              <label className="text-xs text-slate-400">{t("สี", "Color")}
                <select defaultValue={sel.color} onChange={(e) => void patch(sel.id!, { color: e.target.value })} className="mt-0.5 w-full h-8 border border-slate-200 rounded-lg px-2 text-sm text-slate-700">{STATUS_COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label className="text-xs text-slate-400">{t("ความคืบหน้า % (ใช้เมื่องานยังไม่มีคอนเทนต์)", "Progress % (used when a task has no content)")}<input type="number" min={0} max={100} defaultValue={sel.progress_percent} onBlur={(e) => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)); if (v !== sel.progress_percent) void patch(sel.id!, { progress_percent: v }); }} className="mt-0.5 w-full h-8 border border-slate-200 rounded-lg px-2 text-sm text-slate-700" /></label>
              <div className="sm:col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={sel.is_terminal} onChange={(e) => void patch(sel.id!, { is_terminal: e.target.checked })} />{t("ปิดงาน (ดูอย่างเดียว)", "Closes the task (read-only)")}</label>
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={sel.is_approval_gate} onChange={(e) => void patch(sel.id!, { is_approval_gate: e.target.checked })} />{t("จุดรออนุมัติ", "Approval point")}</label>
                <label className="inline-flex items-center gap-1.5"><input type="radio" name="defstatus" checked={sel.is_default} onChange={() => void patch(sel.id!, { is_default: true })} />{t("สถานะตอนสร้างงาน", "Status for new tasks")}</label>
              </div>
            </section>

            <section className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500">{t("ไปต่อได้ที่ไหน", "Can move to")}</p>
              {fromList.length === 0 ? <p className="text-sm text-slate-400 italic">{t("ยังไม่มีทางไปต่อ — งานในสถานะนี้จะย้ายไม่ได้ (นอกจากแอดมินบังคับ)", "No next step yet — tasks here can't move (except admin force)")}</p> : fromList.map((x) => (
                <div key={x.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                  <span className="text-slate-400">→</span><span className="font-medium text-slate-700">{labelOf(x.to_key)}</span>
                  <span className="text-xs rounded border border-slate-200 bg-slate-50 px-1.5 text-slate-500">{x.label}</span>
                  <span className="text-[11px] text-violet-600">{KINDS.find((k) => k.value === x.kind)?.label()}</span>
                  <button type="button" onClick={() => { setTTo(x.to_key); setTKind(x.kind ?? "normal"); setTLabel(x.label ?? ""); }} title={t("แก้", "Edit")} className="ml-auto text-slate-300 hover:text-violet-600">✎</button>
                  <button type="button" onClick={() => void removeTransition(x)} title={t("ลบ", "Remove")} className="text-slate-300 hover:text-red-500">✕</button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <select value={tTo} onChange={(e) => setTTo(e.target.value)} className="h-8 border border-slate-200 rounded-lg px-2 text-sm"><option value="">{t("ปลายทาง…", "Destination…")}</option>{statuses.filter((s) => s.key !== sel.key).map((s) => <option key={s.key} value={s.key}>{tr(s.label, s.label_en || s.label)}</option>)}</select>
                <select value={tKind} onChange={(e) => setTKind(e.target.value)} className="h-8 border border-slate-200 rounded-lg px-2 text-sm">{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label()}</option>)}</select>
                <input value={tLabel} onChange={(e) => setTLabel(e.target.value)} placeholder={t("ป้ายปุ่ม เช่น ส่งตรวจ", "Button label, e.g. Submit")} className="flex-1 min-w-[120px] h-8 border border-slate-200 rounded-lg px-2 text-sm" />
                <button type="button" onClick={() => void saveTransition()} className="h-8 px-3 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700">{fromList.some((x) => x.to_key === tTo) ? t("บันทึก", "Save") : t("เพิ่ม", "Add")}</button>
              </div>
              <p className="text-[11px] text-slate-400">{t("ชนิด อนุมัติ/ไม่ผ่าน/ให้แก้ ต้องมีสิทธิ์อนุมัติ · ไม่ผ่าน/ให้แก้/ติดปัญหา จะถามเหตุผล", "Approve/reject/revise need approval rights · reject/revise/block ask for a reason")}</p>
            </section>

            <section className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500">{t("ก่อนย้ายเข้าสถานะนี้ ต้อง…", "Before moving into this status…")}</p>
              {gates && ([["readiness", t("ความพร้อมสินค้าครบ (ตามข้อเช็กของประเภทงาน)", "Product readiness complete (per task type checks)")], ["content", t("คอนเทนต์ของงานพร้อมครบทุกชิ้น", "All the task's content is ready")]] as const).map(([field, label]) => (
                <div key={field} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                  <span className="flex-1 min-w-[180px] text-sm text-slate-700">{label}</span>
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                    {GATE_OPTS.map((o) => { const on = gateOf(gates, sel.key)[field] === o.v; return (
                      <button key={o.v} type="button" onClick={() => { if (!on) void setGate(sel.key, field, o.v); }}
                        className={`h-7 px-2.5 text-xs ${on ? (o.v === "block" ? "bg-rose-600 text-white" : o.v === "warn" ? "bg-amber-500 text-white" : "bg-slate-700 text-white") : "bg-white text-slate-600 hover:bg-slate-50"}`}>{t(o.th, o.en)}</button>
                    ); })}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">{t("ใช้กับการย้ายไปข้างหน้าทุกที่ (ลิ้นชัก · บอร์ด · กระดาน) · ส่งกลับแก้ไม่เช็ก · แอดมิน \"บังคับตั้งสถานะ\" ข้ามได้ · ข้อลงครบทุกร้านไม่นับ (ดูในลิ้นชัก)", "Applies to every forward move (drawer · board · canvas) · send-backs aren't checked · admin force skips it · the all-shops check isn't counted (see the drawer)")}</p>
            </section>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button type="button" onClick={() => void remove(sel)} className="h-8 px-3 rounded-lg border border-rose-200 text-rose-600 text-sm hover:bg-rose-50">{t("ลบสถานะนี้", "Delete this status")}</button>
            </div>
          </div>
        ) : <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">{t("เลือกสถานะทางซ้าย", "Pick a status on the left")}</div>}
      </div>
    </div>
  );
}
