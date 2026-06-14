"use client";

// ============================================================
// Creative Task Manager — ตั้งค่า: สิทธิ์ + ตัวเลือกที่จัดการได้ (ประเภทงาน/แพลตฟอร์ม)
// สิทธิ์: เชื่อม /api/admin/roles (ของกลาง). ตัวเลือก: /api/creative-options
// ทุกอย่าง admin-only
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { listOptions, createOption, updateOption, deleteOption, type Option } from "../use-options";
import { listStatuses, createStatus, updateStatus, deleteStatus, setTransition, deleteTransition, type Status, type Transition } from "../use-statuses";
import { STATUS_COLOR_OPTIONS, statusColor } from "@/lib/creative-status-colors";

type Role = { key: string; label: string; active: boolean; sort_order: number };
type Perm = { key: string; label: string; category: string; description: string | null; is_dangerous: boolean; sort_order: number };
type MatrixRow = { role_key: string; permission_key: string };
type Tab = "perm" | "task_type" | "platform" | "status" | "transition";

export default function TaskSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("perm");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  return (
    <StandaloneShell title="ตั้งค่างาน Creative" icon="⚙️" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ตั้งค่า</h1>
            <p className="text-slate-500 mt-1">สิทธิ์การใช้งาน + ตัวเลือกที่ใช้ในฟอร์ม (ประเภทงาน/แพลตฟอร์ม)</p>
          </div>
          <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">← กลับไปงาน</a>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mt-4">
            <TabBtn active={tab === "perm"} onClick={() => setTab("perm")}>🔑 สิทธิ์</TabBtn>
            <TabBtn active={tab === "task_type"} onClick={() => setTab("task_type")}>🏷️ ประเภทงาน</TabBtn>
            <TabBtn active={tab === "platform"} onClick={() => setTab("platform")}>📱 แพลตฟอร์ม</TabBtn>
            <TabBtn active={tab === "status"} onClick={() => setTab("status")}>🚦 สถานะ</TabBtn>
            <TabBtn active={tab === "transition"} onClick={() => setTab("transition")}>🔀 เส้นทาง</TabBtn>
          </div>
        )}
      </div>

      <div className="px-8 py-6">
        {!isAdmin ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-slate-700 font-medium">หน้านี้สำหรับผู้ดูแลระบบ (admin) เท่านั้น</p>
          </div>
        ) : tab === "perm" ? <PermissionMatrix showToast={showToast} />
          : tab === "status" ? <StatusManager showToast={showToast} />
          : tab === "transition" ? <TransitionManager showToast={showToast} />
          : <OptionsManager kind={tab} title={tab === "task_type" ? "ประเภทงาน" : "แพลตฟอร์ม"} showToast={showToast} />}
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-[70] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white bg-slate-800">{toast}</div>}
    </StandaloneShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`h-8 px-3 rounded-md text-sm font-medium ${active ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>{children}</button>;
}

// ============================================================
// แท็บสิทธิ์ (matrix)
// ============================================================
function PermissionMatrix({ showToast }: { showToast: (m: string) => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch("/api/admin/roles");
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRoles(((j.roles as Role[]) ?? []).filter((r) => r.active).sort((a, b) => a.sort_order - b.sort_order));
      setPerms(((j.permissions as Perm[]) ?? []).filter((p) => p.category === "tasks").sort((a, b) => a.sort_order - b.sort_order));
      setGranted(new Set(((j.matrix as MatrixRow[]) ?? []).map((m) => `${m.role_key}|${m.permission_key}`)));
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (roleKey: string, permKey: string, isAdminRole: boolean) => {
    if (isAdminRole) return;
    const cellKey = `${roleKey}|${permKey}`;
    const currently = granted.has(cellKey);
    const next = !currently;
    setSavingCell(cellKey);
    setGranted((prev) => { const s = new Set(prev); if (next) s.add(cellKey); else s.delete(cellKey); return s; });
    try {
      const res = await apiFetch("/api/admin/roles", { method: "PATCH", body: JSON.stringify({ kind: "toggle", role_key: roleKey, permission_key: permKey, granted: next }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      showToast("บันทึกแล้ว");
    } catch (e) {
      setGranted((prev) => { const s = new Set(prev); if (currently) s.add(cellKey); else s.delete(cellKey); return s; });
      showToast(`ผิดพลาด: ${(e as Error).message}`);
    } finally { setSavingCell(null); }
  };

  if (loading) return <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>;
  if (err) return <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">โหลดไม่สำเร็จ: {err} <button onClick={load} className="underline ml-2">ลองใหม่</button></div>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">สิทธิ์ระบบงาน Creative ต่อตำแหน่ง</h2>
        <p className="text-xs text-slate-400 mt-0.5">ติ๊กเพื่อเปิด/ปิดสิทธิ์ · บันทึกอัตโนมัติ · ผู้ดูแล (admin) เข้าได้ทุกอย่างเสมอ</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left font-medium text-slate-500 px-5 py-3 sticky left-0 bg-slate-50/60">สิทธิ์</th>
              {roles.map((r) => <th key={r.key} className="text-center font-medium text-slate-600 px-3 py-3 whitespace-nowrap">{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p.key} className="border-b border-slate-50 hover:bg-slate-50/40">
                <td className="px-5 py-3 sticky left-0 bg-white">
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">{p.label}{p.is_dangerous && <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1 rounded">อันตราย</span>}</div>
                  {p.description && <div className="text-xs text-slate-400">{p.description}</div>}
                </td>
                {roles.map((r) => {
                  const isAdminRole = r.key === "admin";
                  const cellKey = `${r.key}|${p.key}`;
                  const on = isAdminRole || granted.has(cellKey);
                  return (
                    <td key={r.key} className="text-center px-3 py-3">
                      <button onClick={() => toggle(r.key, p.key, isAdminRole)} disabled={isAdminRole || savingCell === cellKey}
                        title={isAdminRole ? "ผู้ดูแลเข้าได้ทุกอย่างเสมอ" : on ? "คลิกเพื่อปิด" : "คลิกเพื่อเปิด"}
                        className={`h-6 w-6 rounded-md border inline-flex items-center justify-center transition-colors ${on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-300 text-transparent hover:border-violet-300"} ${isAdminRole ? "opacity-60 cursor-default" : "cursor-pointer"}`}>✓</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// แท็บจัดการตัวเลือก (ประเภทงาน / แพลตฟอร์ม)
// ============================================================
function OptionsManager({ kind, title, showToast }: { kind: string; title: string; showToast: (m: string) => void }) {
  const [opts, setOpts] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { setOpts(await listOptions(kind)); } catch (e) { showToast((e as Error).message); } finally { setLoading(false); } }, [kind, showToast]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const l = newLabel.trim(); if (!l) return;
    setBusy(true);
    try { await createOption(kind, l); setNewLabel(""); await load(); showToast("เพิ่มแล้ว"); }
    catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  };
  const rename = async (o: Option, label: string) => { if (label.trim() === o.label || !label.trim()) return; try { await updateOption(o.id, { label: label.trim() }); setOpts((p) => p.map((x) => x.id === o.id ? { ...x, label: label.trim() } : x)); showToast("บันทึกแล้ว"); } catch (e) { showToast((e as Error).message); } };
  const remove = async (o: Option) => { if (!window.confirm(`ลบ "${o.label}" ?`)) return; try { await deleteOption(o.id); await load(); showToast("ลบแล้ว"); } catch (e) { showToast((e as Error).message); } };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= opts.length) return;
    const a = opts[i], b = opts[j];
    try { await Promise.all([updateOption(a.id, { sort_order: b.sort_order }), updateOption(b.id, { sort_order: a.sort_order })]); await load(); }
    catch (e) { showToast((e as Error).message); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">เพิ่ม/แก้ชื่อ/ลบ/จัดลำดับ — เปลี่ยนที่นี่แล้วฟอร์มสร้างงาน/เทมเพลต/คอนเทนต์จะใช้ตามทันที</p>
      </div>
      <div className="p-5">
        <div className="flex gap-2 mb-4">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={`เพิ่ม${title}ใหม่...`} className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          <button onClick={add} disabled={busy} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">＋ เพิ่ม</button>
        </div>
        {loading ? <div className="py-10 text-center text-slate-400">กำลังโหลด...</div>
          : opts.length === 0 ? <div className="py-10 text-center text-slate-400">ยังไม่มีตัวเลือก</div>
          : (
            <div className="space-y-1.5">
              {opts.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex flex-col text-slate-300">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="h-3 leading-none hover:text-slate-600 disabled:opacity-30">▲</button>
                    <button onClick={() => move(i, 1)} disabled={i === opts.length - 1} className="h-3 leading-none hover:text-slate-600 disabled:opacity-30">▼</button>
                  </div>
                  <input defaultValue={o.label} onBlur={(e) => rename(o, e.target.value)} className="flex-1 text-sm bg-transparent outline-none border-b border-transparent focus:border-violet-300 py-0.5" />
                  <span className="text-[10px] text-slate-300 font-mono">{o.key}</span>
                  <button onClick={() => remove(o)} className="text-slate-300 hover:text-red-500 text-sm">✕</button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ============================================================
// แท็บจัดการสถานะ
// ============================================================
function StatusManager({ showToast }: { showToast: (m: string) => void }) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("slate");

  const load = useCallback(async () => { setLoading(true); try { setStatuses((await listStatuses()).statuses); } catch (e) { showToast((e as Error).message); } finally { setLoading(false); } }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, p: Record<string, unknown>) => { try { await updateStatus(id, p); await load(); } catch (e) { showToast((e as Error).message); } };
  const add = async () => { if (!newLabel.trim()) return; try { await createStatus({ label: newLabel.trim(), color: newColor }); setNewLabel(""); await load(); showToast("เพิ่มสถานะแล้ว"); } catch (e) { showToast((e as Error).message); } };
  const remove = async (s: Status) => { if (!window.confirm(`ลบสถานะ "${s.label}" ?`)) return; try { await deleteStatus(s.id!); await load(); showToast("ลบแล้ว"); } catch (e) { showToast((e as Error).message); } };
  const move = async (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= statuses.length) return; const a = statuses[i], b = statuses[j]; try { await Promise.all([updateStatus(a.id!, { sort_order: b.sort_order }), updateStatus(b.id!, { sort_order: a.sort_order })]); await load(); } catch (e) { showToast((e as Error).message); } };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-4xl">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">สถานะงาน</h2>
        <p className="text-xs text-slate-400 mt-0.5">เพิ่ม/แก้ชื่อ/สี/ลำดับ/ธง — Kanban·Canvas·คิว อ่านจากที่นี่ · "ปิดงาน"=ดูอย่างเดียว · "ต้องอนุมัติ"=รอตรวจ · "เริ่มต้น"=สถานะตอนสร้างงาน</p>
      </div>
      <div className="p-5">
        <div className="flex gap-2 mb-4">
          <select value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm">{STATUS_COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="เพิ่มสถานะใหม่..." className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          <button onClick={add} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ เพิ่ม</button>
        </div>
        {loading ? <div className="py-10 text-center text-slate-400">กำลังโหลด...</div> : (
          <div className="space-y-1.5">
            {statuses.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 flex-wrap">
                <div className="flex flex-col text-slate-300">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="h-3 leading-none hover:text-slate-600 disabled:opacity-30">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === statuses.length - 1} className="h-3 leading-none hover:text-slate-600 disabled:opacity-30">▼</button>
                </div>
                <span className={`h-3 w-3 rounded-full ${statusColor(s.color).dot}`} />
                <select defaultValue={s.color} onChange={(e) => patch(s.id!, { color: e.target.value })} className="h-7 border border-slate-200 rounded-md px-1 text-xs w-24">{STATUS_COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                <input defaultValue={s.label} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== s.label) patch(s.id!, { label: e.target.value.trim() }); }} className="flex-1 min-w-[120px] text-sm bg-transparent outline-none border-b border-transparent focus:border-violet-300 py-0.5" />
                <label className="flex items-center gap-1 text-[11px] text-slate-500" title="ความคืบหน้า %">% <input type="number" defaultValue={s.progress_percent} onBlur={(e) => patch(s.id!, { progress_percent: Number(e.target.value) })} className="w-12 h-7 border border-slate-200 rounded px-1 text-xs" /></label>
                <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={s.is_terminal} onChange={(e) => patch(s.id!, { is_terminal: e.target.checked })} />ปิดงาน</label>
                <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={s.is_approval_gate} onChange={(e) => patch(s.id!, { is_approval_gate: e.target.checked })} />ต้องอนุมัติ</label>
                <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="radio" name="defstatus" checked={s.is_default} onChange={() => patch(s.id!, { is_default: true })} />เริ่มต้น</label>
                <span className="text-[10px] text-slate-300 font-mono">{s.key}</span>
                <button onClick={() => remove(s)} className="text-slate-300 hover:text-red-500 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// แท็บจัดการเส้นทาง (transition)
// ============================================================
const KINDS = [{ value: "normal", label: "ปกติ" }, { value: "approve", label: "อนุมัติ" }, { value: "reject", label: "ไม่ผ่าน" }, { value: "revise", label: "ให้แก้" }, { value: "block", label: "ติดปัญหา" }];
function TransitionManager({ showToast }: { showToast: (m: string) => void }) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [toKey, setToKey] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("normal");

  const load = useCallback(async () => { setLoading(true); try { const r = await listStatuses(); setStatuses(r.statuses); setTransitions(r.transitions); if (!from && r.statuses[0]) setFrom(r.statuses[0].key); } catch (e) { showToast((e as Error).message); } finally { setLoading(false); } }, [showToast, from]);
  useEffect(() => { load(); }, [load]);

  const labelOf = (k: string) => statuses.find((s) => s.key === k)?.label ?? k;
  const fromTransitions = transitions.filter((t) => t.from_key === from);

  const add = async () => { if (!from || !toKey) { showToast("เลือกต้นทาง-ปลายทาง"); return; } try { await setTransition({ from_key: from, to_key: toKey, label: label.trim() || `→ ${labelOf(toKey)}`, kind }); setToKey(""); setLabel(""); setKind("normal"); await load(); showToast("บันทึกเส้นทางแล้ว"); } catch (e) { showToast((e as Error).message); } };
  const remove = async (t: Transition) => { try { await deleteTransition(t.id!); await load(); } catch (e) { showToast((e as Error).message); } };

  if (loading) return <div className="py-10 text-center text-slate-400">กำลังโหลด...</div>;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">เส้นทางสถานะ (จากสถานะไหน → ไปไหนได้)</h2>
        <p className="text-xs text-slate-400 mt-0.5">ชนิด "อนุมัติ/ไม่ผ่าน/ให้แก้" = ใช้สิทธิ์อนุมัติ (หัวหน้า) · ปุ่มเหล่านี้จะโผล่ในคิว/Kanban/หน้ารายละเอียด</p>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs text-slate-400">จากสถานะ</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 h-8 border border-slate-200 rounded-md px-2 text-sm">{statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </div>
        <div className="space-y-1.5">
          {fromTransitions.length === 0 ? <p className="text-sm text-slate-400 italic">ยังไม่มีเส้นทางจากสถานะนี้</p> : fromTransitions.map((t) => (
            <div key={t.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <span className="text-slate-400">→</span>
              <span className="font-medium text-slate-700">{labelOf(t.to_key)}</span>
              <span className="text-xs bg-slate-50 border border-slate-200 rounded px-1.5 text-slate-500">{t.label}</span>
              <span className="text-[11px] text-violet-600">{KINDS.find((k) => k.value === t.kind)?.label}</span>
              <button onClick={() => remove(t)} className="ml-auto text-slate-300 hover:text-red-500">✕</button>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3 flex gap-2 flex-wrap items-center">
          <span className="text-xs text-slate-400">เพิ่มเส้นทาง →</span>
          <select value={toKey} onChange={(e) => setToKey(e.target.value)} className="h-8 border border-slate-200 rounded-md px-2 text-sm"><option value="">ปลายทาง...</option>{statuses.filter((s) => s.key !== from).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 border border-slate-200 rounded-md px-2 text-sm">{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ป้ายปุ่ม (เช่น 📤 ส่งตรวจ)" className="flex-1 min-w-[140px] h-8 border border-slate-200 rounded-md px-2 text-sm" />
          <button onClick={add} className="h-8 px-3 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700">เพิ่ม</button>
        </div>
      </div>
    </div>
  );
}
