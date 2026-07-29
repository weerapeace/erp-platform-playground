"use client";

// ของกลาง: ป๊อปอัป "ให้สิทธิ์รายคน" (override ทับสิทธิ์ตามตำแหน่ง)
//   <UserPermOverrideButton permissionKey="ai.caption" label="ใช้ AI เขียนแคปชั่น" />
// เบื้องหลังใช้ของเดิมทั้งหมด: /api/admin/users + /api/admin/user-permissions
//   mode: grant = เปิดให้คนนี้ (ชนะตำแหน่ง) · revoke = ปิดคนนี้ (ชนะตำแหน่ง) · default = ตามตำแหน่ง
// ฟังก์ชัน erp_can ใน DB เช็ก override นี้ก่อน role อยู่แล้ว (admin ผ่านทุกอย่าง)

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";

type Row = { id: string; name: string; email?: string | null; role?: string | null; role_label?: string | null };
type Mode = "grant" | "revoke" | "default";

export function UserPermOverrideButton({ permissionKey, label, className = "" }: {
  permissionKey: string;
  label: string;              // ชื่อสิทธิ์ (โชว์ในหัวป๊อปอัป)
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);   // จำนวนคนที่ตั้งค่าเฉพาะไว้ (โชว์บนปุ่ม)

  const loadCount = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/admin/user-permissions?permission_key=${encodeURIComponent(permissionKey)}`).then((r) => r.json());
      setCount(((j.overrides ?? []) as unknown[]).length);
    } catch { /* ไม่ขึ้นก็ไม่เป็นไร */ }
  }, [permissionKey]);
  useEffect(() => { void loadCount(); }, [loadCount]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={`ให้สิทธิ์รายคน: ${label}`}
        className={`text-[11px] text-slate-500 hover:text-violet-700 border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap ${className}`}>
        👤 รายคน{count > 0 ? ` (${count})` : ""}
      </button>
      {open && <Modal permissionKey={permissionKey} label={label} onClose={() => { setOpen(false); void loadCount(); }} />}
    </>
  );
}

function Modal({ permissionKey, label, onClose }: { permissionKey: string; label: string; onClose: () => void }) {
  const [users, setUsers] = useState<Row[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Mode>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [uj, oj] = await Promise.all([
          apiFetch("/api/admin/users").then((r) => r.json()),
          apiFetch(`/api/admin/user-permissions?permission_key=${encodeURIComponent(permissionKey)}`).then((r) => r.json()),
        ]);
        setUsers(((uj.users ?? uj.data ?? []) as Row[]).filter((u) => u?.id));
        const m: Record<string, Mode> = {};
        for (const o of (oj.overrides ?? []) as { user_id: string; mode: Mode }[]) m[o.user_id] = o.mode;
        setOverrides(m);
      } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
    })();
  }, [permissionKey]);

  const setMode = async (userId: string, mode: Mode) => {
    setBusy(userId); setErr(null);
    const prev = overrides[userId];
    setOverrides((p) => { const n = { ...p }; if (mode === "default") delete n[userId]; else n[userId] = mode; return n; });   // optimistic
    try {
      const j = await apiFetch("/api/admin/user-permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, permission_key: permissionKey, mode }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
    } catch (e) {
      setErr((e as Error).message);
      setOverrides((p) => { const n = { ...p }; if (prev) n[userId] = prev; else delete n[userId]; return n; });   // คืนค่าถ้าพลาด
    } finally { setBusy(null); }
  };

  const kw = q.trim().toLowerCase();
  const shown = kw ? users.filter((u) => `${u.name} ${u.email ?? ""} ${u.role_label ?? u.role ?? ""}`.toLowerCase().includes(kw)) : users;

  return (
    <ERPModal open onClose={onClose} size="lg" title={`👤 ให้สิทธิ์รายคน — ${label}`}
      description="ตั้งเฉพาะคนได้ ทับสิทธิ์ของตำแหน่ง · ผู้ดูแลระบบ (admin) ใช้ได้ทุกอย่างอยู่แล้ว"
      footer={<div className="flex justify-end"><button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button></div>}>
      {err && <p className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{err}</p>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / อีเมล / ตำแหน่ง…"
        className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm mb-2" />
      {loading ? <p className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</p> : (
        <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
          {shown.map((u) => {
            const mode = overrides[u.id] ?? "default";
            const bz = busy === u.id;
            return (
              <div key={u.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 truncate">{u.name || u.email || u.id}</p>
                  <p className="text-[11px] text-slate-400 truncate">{u.role_label ?? u.role ?? "—"}{u.email ? ` · ${u.email}` : ""}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {([["default", "ตามตำแหน่ง"], ["grant", "✅ เปิดให้"], ["revoke", "🚫 ปิด"]] as [Mode, string][]).map(([m, lb]) => (
                    <button key={m} type="button" disabled={bz} onClick={() => setMode(u.id, m)}
                      className={`h-7 px-2 text-[11px] rounded-md border disabled:opacity-50 ${mode === m
                        ? (m === "grant" ? "bg-emerald-600 text-white border-emerald-600" : m === "revoke" ? "bg-rose-600 text-white border-rose-600" : "bg-slate-700 text-white border-slate-700")
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{lb}</button>
                  ))}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-400">ไม่พบผู้ใช้</p>}
        </div>
      )}
    </ERPModal>
  );
}
