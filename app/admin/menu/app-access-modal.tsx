"use client";

// ============================================================
// AppAccessModal — ป๊อปอัป "ใครเข้าแอปนี้ได้" (ของกลางหน้า /admin/menu)
// ต่อยอดระบบสิทธิ์เดิม (ไม่สร้างของซ้ำ):
//   - แอปถูกล็อกด้วย erp_app_groups.permission_key = app.<key>
//   - ตำแหน่ง (role) ที่เข้าได้  → erp_role_permissions (PATCH /api/admin/roles toggle)
//   - ยกเว้นรายคน (อนุญาต/ห้าม) → erp_user_permissions (POST /api/admin/user-permissions)
//   - admin = เข้าได้ทุกแอปเสมอ (override)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import type { RoleDef, RolesPermissionsResponse } from "@/app/api/admin/roles/route";
import type { AdminUser, AdminUsersResponse } from "@/app/api/admin/users/route";
import type { PermKeyOverride } from "@/app/api/admin/user-permissions/route";

export type AppLite = { id: string; key: string; label: string; icon?: string | null; icon_url?: string | null; permission_key: string | null };

const ROLE_COLOR: Record<string, string> = {
  purple: "bg-purple-100 text-purple-700 border-purple-300",
  blue: "bg-blue-100 text-blue-700 border-blue-300",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-300",
  slate: "bg-slate-100 text-slate-700 border-slate-300",
  amber: "bg-amber-100 text-amber-700 border-amber-300",
  red: "bg-red-100 text-red-700 border-red-300",
};

export function AppAccessModal({ app, actor, canEditRoles = true, onClose, onChanged, onFlash }: {
  app: AppLite;
  actor?: string;
  canEditRoles?: boolean;   // ต้องมี admin.roles ถึงจะแก้สิทธิ์ตำแหน่งได้ (ยกเว้นรายคนใช้ admin.users)
  onClose: () => void;
  onChanged: (patch: { permission_key: string | null }) => void;   // sync แถวแอปในหน้าหลัก
  onFlash: (m: string) => void;
}) {
  const [permKey, setPermKey] = useState<string | null>(app.permission_key);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [rolePerm, setRolePerm] = useState<Set<string>>(new Set());      // role_key ที่มีสิทธิ์เข้าแอปนี้
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overrides, setOverrides] = useState<Record<string, "grant" | "revoke">>({});   // user_id → mode
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [userQ, setUserQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // key สำหรับล็อก: ใช้ของเดิมถ้ามี (กันแอปที่ใช้ key ร่วม เช่น dispatch→app.production เพี้ยน)
  // ถ้าแอปยังไม่เคยล็อก → derive app.<key> ให้ (china-pay → app.china_pay)
  const lockKeyRef = useRef(app.permission_key || `app.${app.key.replace(/-/g, "_")}`);
  const locked = !!permKey;

  const loadRoles = useCallback(async () => {
    const rj = (await apiFetch("/api/admin/roles").then((r) => r.json())) as RolesPermissionsResponse;
    if (!rj.error) {
      setRoles((rj.roles ?? []).filter((r) => r.active !== false));
      const set = new Set<string>();
      if (permKey) for (const m of rj.matrix ?? []) if (m.permission_key === permKey) set.add(m.role_key);
      setRolePerm(set);
    } else setErr(rj.error);
  }, [permKey]);

  const loadOverrides = useCallback(async () => {
    if (!permKey) { setOverrides({}); return; }
    const j = await apiFetch(`/api/admin/user-permissions?permission_key=${encodeURIComponent(permKey)}`).then((r) => r.json());
    if (!j.error) {
      const m: Record<string, "grant" | "revoke"> = {};
      for (const o of (j.overrides ?? []) as PermKeyOverride[]) m[o.user_id] = o.mode;
      setOverrides(m);
    }
  }, [permKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const uj = (await apiFetch("/api/admin/users").then((r) => r.json())) as AdminUsersResponse;
      if (alive && !uj.error) setUsers(uj.data ?? []);
      await Promise.all([loadRoles(), loadOverrides()]);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [loadRoles, loadOverrides]);

  // ล็อก/ปลดล็อกแอป (เซ็ต/ล้าง permission_key)
  const toggleLock = async (on: boolean) => {
    setBusy("lock"); setErr(null);
    const newKey = on ? lockKeyRef.current : null;
    const j = await apiFetch("/api/menu/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: app.id, patch: { permission_key: newKey } }) }).then((r) => r.json());
    if (j.error) setErr(j.error);
    else { setPermKey(newKey); onChanged({ permission_key: newKey }); onFlash(on ? "ล็อกแอปแล้ว — เฉพาะคนมีสิทธิ์เข้าได้" : "ปลดล็อก — ทุกคนเข้าได้"); }
    setBusy(null);
  };

  // ติ๊กตำแหน่ง (role)
  const toggleRole = async (roleKey: string, has: boolean) => {
    if (!permKey || roleKey === "admin" || !canEditRoles) return;
    setBusy(`role:${roleKey}`); setErr(null);
    setRolePerm((prev) => { const n = new Set(prev); if (has) n.delete(roleKey); else n.add(roleKey); return n; });
    const j = await apiFetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "toggle", role_key: roleKey, permission_key: permKey, granted: !has, actor }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); await loadRoles(); }
    setBusy(null);
  };

  // ยกเว้นรายคน
  const setOverride = async (userId: string, mode: "grant" | "revoke" | "default") => {
    if (!permKey) return;
    setBusy(`user:${userId}`); setErr(null);
    setOverrides((prev) => { const n = { ...prev }; if (mode === "default") delete n[userId]; else n[userId] = mode; return n; });
    const j = await apiFetch("/api/admin/user-permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, permission_key: permKey, mode }) }).then((r) => r.json());
    if (j.error) { setErr(j.error); await loadOverrides(); }
    setBusy(null);
  };

  const userName = (u: AdminUser) => u.display_name || u.username || u.email;
  const exceptionUsers = useMemo(() => users.filter((u) => overrides[u.id]), [users, overrides]);
  const addableUsers = useMemo(() => {
    const s = userQ.trim().toLowerCase();
    return users.filter((u) => !overrides[u.id] && u.role !== "admin")
      .filter((u) => !s || userName(u).toLowerCase().includes(s) || u.email.toLowerCase().includes(s))
      .slice(0, 30);
  }, [users, overrides, userQ]);

  return (
    <ERPModal open onClose={onClose} size="lg"
      title={`ตั้งสิทธิ์เข้าแอป «${app.label}»`}
      footer={<button onClick={onClose} className="h-9 px-4 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">ปิด</button>}>

      {err && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">⚠ {err}<button onClick={() => setErr(null)} className="text-red-400 hover:text-red-700">✕</button></div>}

      {/* สวิตช์ล็อก/ไม่ล็อก */}
      <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${locked ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
        <div className="text-sm">
          <div className="font-medium text-slate-800">{locked ? "🔒 ล็อกอยู่ — เฉพาะคนมีสิทธิ์เข้าได้" : "🌐 เปิดให้ทุกคนเข้าได้"}</div>
          <div className="text-xs text-slate-500 mt-0.5">{locked ? "เลือกตำแหน่ง/พนักงานที่เข้าได้ด้านล่าง · พิมพ์ URL ตรงก็เข้าไม่ได้ถ้าไม่มีสิทธิ์" : "ทุกคนที่ล็อกอินเห็นและเข้าแอปนี้ได้"}</div>
        </div>
        <button onClick={() => toggleLock(!locked)} disabled={busy === "lock"}
          className={`h-9 px-4 text-sm font-medium rounded-lg shrink-0 disabled:opacity-50 ${locked ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
          {busy === "lock" ? "…" : locked ? "ปลดล็อก (เปิดทุกคน)" : "🔒 เริ่มล็อกสิทธิ์"}
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
      ) : !locked ? (
        <p className="mt-4 text-sm text-slate-400 text-center py-6">แอปนี้ยังไม่ได้ล็อก — กด <b>เริ่มล็อกสิทธิ์</b> เพื่อกำหนดว่าใครเข้าได้</p>
      ) : (
        <div className="mt-4 space-y-5">
          {/* ตำแหน่ง */}
          <section>
            <div className="text-sm font-semibold text-slate-700 mb-2">👥 ตำแหน่งที่เข้าได้{!canEditRoles && <span className="ml-2 text-[11px] font-normal text-amber-600">(ดูอย่างเดียว — ต้องมีสิทธิ์ admin.roles ถึงแก้ได้)</span>}</div>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const isAdmin = r.key === "admin";
                const has = isAdmin || rolePerm.has(r.key);
                const bz = busy === `role:${r.key}`;
                return (
                  <button key={r.key} onClick={() => toggleRole(r.key, rolePerm.has(r.key))} disabled={isAdmin || bz || !canEditRoles}
                    title={isAdmin ? "ผู้ดูแลระบบเข้าได้ทุกแอปเสมอ" : has ? "กดเพื่อเอาสิทธิ์ออก" : "กดเพื่อให้เข้าได้"}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-sm transition-colors disabled:cursor-not-allowed ${has ? (ROLE_COLOR[r.color] ?? ROLE_COLOR.slate) : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"} ${isAdmin ? "opacity-90" : ""}`}>
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded ${has ? "bg-white/70" : "bg-slate-100"}`}>{has ? "✓" : ""}</span>
                    {r.label}{isAdmin && <span className="text-[10px] opacity-70">(ทุกแอป)</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ยกเว้นรายคน */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-700">🙋 ยกเว้นรายคน</div>
              <button onClick={() => { setAddOpen((s) => !s); setUserQ(""); }} className="text-xs font-medium text-blue-600 hover:underline">{addOpen ? "ปิด" : "＋ เพิ่มพนักงาน"}</button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">ใช้ทับตำแหน่ง — “อนุญาตพิเศษ” = ให้เข้าแม้ตำแหน่งไม่มีสิทธิ์ · “ห้ามพิเศษ” = กันไม่ให้เข้าแม้ตำแหน่งมีสิทธิ์</p>

            {/* รายการยกเว้นปัจจุบัน */}
            {exceptionUsers.length === 0 ? (
              <div className="text-xs text-slate-300 py-3 text-center border border-dashed border-slate-200 rounded-lg">ยังไม่มีการยกเว้นรายคน</div>
            ) : (
              <div className="space-y-1.5">
                {exceptionUsers.map((u) => {
                  const mode = overrides[u.id];
                  const bz = busy === `user:${u.id}`;
                  return (
                    <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 bg-slate-50/60">
                      <span className="flex-1 text-sm text-slate-700 truncate">{userName(u)} <span className="text-[11px] text-slate-400">{u.email}</span></span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${mode === "grant" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>{mode === "grant" ? "✅ อนุญาตพิเศษ" : "🚫 ห้ามพิเศษ"}</span>
                      <button onClick={() => setOverride(u.id, mode === "grant" ? "revoke" : "grant")} disabled={bz} className="text-[11px] text-slate-500 hover:text-slate-800 disabled:opacity-50">สลับ</button>
                      <button onClick={() => setOverride(u.id, "default")} disabled={bz} className="text-[11px] text-rose-500 hover:text-rose-700 disabled:opacity-50">เอาออก</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* เพิ่มพนักงาน */}
            {addOpen && (
              <div className="mt-2 border border-slate-200 rounded-lg p-2">
                <input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="ค้นหาชื่อ / อีเมล…" className="w-full h-8 px-2 mb-2 text-sm border border-slate-200 rounded" />
                <div className="max-h-52 overflow-auto space-y-1">
                  {addableUsers.length === 0 ? <div className="text-xs text-slate-300 py-3 text-center">ไม่พบพนักงาน</div>
                    : addableUsers.map((u) => (
                      <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50">
                        <span className="flex-1 text-sm text-slate-700 truncate">{userName(u)} <span className="text-[11px] text-slate-400">{u.email}</span></span>
                        <button onClick={() => setOverride(u.id, "grant")} disabled={busy === `user:${u.id}`} className="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50">✅ ให้เข้า</button>
                        <button onClick={() => setOverride(u.id, "revoke")} disabled={busy === `user:${u.id}`} className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50">🚫 ห้าม</button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>

          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">บันทึกอัตโนมัติทุกการเปลี่ยน · ผู้ดูแลระบบ (admin) เข้าได้ทุกแอปเสมอ</p>
        </div>
      )}
    </ERPModal>
  );
}
