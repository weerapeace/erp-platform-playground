"use client";

// ============================================================
// Creative Task Manager — ตั้งค่า (สิทธิ์การใช้งาน)
// เชื่อมระบบสิทธิ์กลาง /api/admin/roles (ไม่สร้างที่เก็บใหม่)
// แสดง matrix เฉพาะหมวด tasks → admin ติ๊กเปิด/ปิดต่อตำแหน่งได้
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";

type Role = { key: string; label: string; active: boolean; sort_order: number };
type Perm = { key: string; label: string; category: string; description: string | null; is_dangerous: boolean; sort_order: number };
type MatrixRow = { role_key: string; permission_key: string };

export default function TaskSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

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

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [isAdmin, load]);

  const toggle = async (roleKey: string, permKey: string, isAdminRole: boolean) => {
    if (isAdminRole) return; // admin เข้าได้ทุกอย่างเสมอ — ไม่ให้แก้
    const cellKey = `${roleKey}|${permKey}`;
    const currently = granted.has(cellKey);
    const next = !currently;
    setSavingCell(cellKey);
    // optimistic
    setGranted((prev) => { const s = new Set(prev); if (next) s.add(cellKey); else s.delete(cellKey); return s; });
    try {
      const res = await apiFetch("/api/admin/roles", { method: "PATCH", body: JSON.stringify({ kind: "toggle", role_key: roleKey, permission_key: permKey, granted: next }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      showToast("บันทึกแล้ว");
    } catch (e) {
      // revert
      setGranted((prev) => { const s = new Set(prev); if (currently) s.add(cellKey); else s.delete(cellKey); return s; });
      showToast(`ผิดพลาด: ${(e as Error).message}`);
    } finally { setSavingCell(null); }
  };

  return (
    <StandaloneShell title="ตั้งค่างาน Creative" icon="⚙️" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ตั้งค่า — สิทธิ์การใช้งาน</h1>
            <p className="text-slate-500 mt-1">กำหนดว่าแต่ละตำแหน่งทำอะไรได้บ้างในระบบงาน Creative · เชื่อมระบบสิทธิ์กลาง</p>
          </div>
          <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">← กลับไปงาน</a>
        </div>
      </div>

      <div className="px-8 py-6">
        {!isAdmin ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-slate-700 font-medium">หน้านี้สำหรับผู้ดูแลระบบ (admin) เท่านั้น</p>
            <p className="text-slate-400 text-sm mt-1">ติดต่อผู้ดูแลระบบเพื่อปรับสิทธิ์การใช้งาน</p>
          </div>
        ) : loading ? (
          <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
        ) : err ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">โหลดไม่สำเร็จ: {err} <button onClick={load} className="underline ml-2">ลองใหม่</button></div>
        ) : (
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
                            <button
                              onClick={() => toggle(r.key, p.key, isAdminRole)}
                              disabled={isAdminRole || savingCell === cellKey}
                              title={isAdminRole ? "ผู้ดูแลเข้าได้ทุกอย่างเสมอ" : on ? "คลิกเพื่อปิดสิทธิ์" : "คลิกเพื่อเปิดสิทธิ์"}
                              className={`h-6 w-6 rounded-md border inline-flex items-center justify-center transition-colors ${on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-300 text-transparent hover:border-violet-300"} ${isAdminRole ? "opacity-60 cursor-default" : "cursor-pointer"}`}
                            >✓</button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
              อยากปรับตำแหน่ง/สร้าง role ใหม่ หรือยกเว้นสิทธิ์รายคน → ทำได้ที่หน้าจัดการสิทธิ์กลางของระบบ
            </div>
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-6 right-6 z-[70] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white bg-slate-800">{toast}</div>}
    </StandaloneShell>
  );
}
