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

type Role = { key: string; label: string; active: boolean; sort_order: number };
type Perm = { key: string; label: string; category: string; description: string | null; is_dangerous: boolean; sort_order: number };
type MatrixRow = { role_key: string; permission_key: string };
type Tab = "perm" | "task_type" | "platform";

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
