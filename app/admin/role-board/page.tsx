"use client";

// ============================================================
// บอร์ดตำแหน่ง (Role Board) — เห็นภาพว่าแต่ละตำแหน่ง "เห็นอะไร + ทำอะไรได้"
// เสริมหน้า /admin/roles-permissions (ตารางติ๊กเทคนิค) — ตัวนี้เห็นภาพ + แก้ได้
// reuse /api/admin/roles (roles+permissions+matrix, PATCH toggle) + /api/menu/apps
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied, roleLabel } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { RolesPermissionsResponse, PermissionDef } from "@/app/api/admin/roles/route";
import type { AdminUser } from "@/app/api/admin/users/route";
import type { UserOverride } from "@/app/api/admin/user-permissions/route";
import { ALL_WIDGETS, WIDGET_META, layoutForRole, type DashboardLayout, type DashboardView } from "@/lib/dashboard-widgets";
import type { DashboardPanel } from "@/lib/dashboard-systems";

type AppLite = { key: string; label: string; icon: string | null; icon_url?: string | null; permission_key: string | null; is_active?: boolean };

const ROLE_BADGE: Record<string, string> = {
  purple: "bg-purple-600", blue: "bg-blue-600", emerald: "bg-emerald-600",
  slate: "bg-slate-600", amber: "bg-amber-600", red: "bg-red-600",
};
const roleBg = (c: string) => ROLE_BADGE[c] ?? "bg-slate-600";

// ป้ายหมวดสิทธิ์ (ภาษาคน) — ที่เป็นอังกฤษ map ให้อ่านง่าย, ที่เป็นไทยอยู่แล้วใช้ตามเดิม
const CAT_LABEL: Record<string, string> = {
  core: "⚙ ระบบหลัก", admin: "🔐 ผู้ดูแลระบบ", products: "📦 สินค้า", pr: "🛒 ใบขอซื้อ",
  po: "📄 ใบสั่งซื้อ", qt: "💬 ใบเสนอราคา", so: "🧾 ใบขาย", qc: "🔍 QC", master: "🗃 ข้อมูลหลัก",
  suppliers: "🏢 ผู้ขาย", customers: "🧑 ลูกค้า", employees: "👥 พนักงาน", inventory: "🗄 คลังสินค้า",
  production: "🏭 ผลิต", accounting: "💰 บัญชี", attachments: "🖼 ไฟล์แนบ", assets: "🗂 คลังไฟล์",
  tasks: "📋 งาน", notifications: "🔔 แจ้งเตือน", Files: "📁 ไฟล์", Reports: "📊 รายงาน",
  Marketing: "📣 การตลาด", Goals: "🎯 เป้าหมาย",
};
const catLabel = (c: string) => CAT_LABEL[c] ?? c;

// สีป้าย action ตามความหมาย (เดาจากชื่อ)
function actionCls(label: string, key: string): string {
  const s = (label + " " + key).toLowerCase();
  if (/อนุมัติ|approve|confirm|submit|ส่ง/.test(s)) return "bg-violet-100 text-violet-700 border-violet-200";
  if (/สร้าง|create|add|เพิ่ม|new/.test(s)) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (/ลบ|delete|remove|ทิ้ง/.test(s)) return "bg-rose-100 text-rose-700 border-rose-200";
  if (/แก้|edit|update|จัดการ|manage|ตั้งค่า/.test(s)) return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function AppIco({ app, size = 22 }: { app: AppLite; size?: number }) {
  if (app.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(app.icon_url)}&w=64`} alt="" className="rounded object-contain shrink-0" style={{ width: size, height: size }} />;
  }
  return <span className="shrink-0 leading-none" style={{ fontSize: size }}>{app.icon ?? "🧩"}</span>;
}

export default function RoleBoardPage() {
  const canView = usePermission("roles.view");
  const canEdit = usePermission("admin.roles");
  const { user } = useAuth();

  const [data, setData] = useState<RolesPermissionsResponse | null>(null);
  const [apps, setApps] = useState<AppLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState<string>("");
  const [granted, setGranted] = useState<Record<string, Set<string>>>({});
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  // เฟส 2 (เทียบ/รายคน) + เฟส 3 (จัด widget แดชบอร์ด)
  const [mode, setMode] = useState<"role" | "compare" | "person">("role");
  const [cmpKey, setCmpKey] = useState<string>("");            // ตำแหน่ง B (โหมดเทียบ)
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [personId, setPersonId] = useState<string>("");
  const [personEff, setPersonEff] = useState<{ role_key: string | null; eff: Set<string>; ov: Map<string, "grant" | "revoke"> } | null>(null);
  const [layoutRows, setLayoutRows] = useState<DashboardLayout[]>([]);
  const [panelRows, setPanelRows] = useState<DashboardPanel[]>([]);   // ตั้งค่าการ์ดระบบ (ซ่อน/ใครเห็น)
  const dragW = useRef<string | null>(null);   // widget ที่กำลังลาก

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 1800); };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [rp, aj, lj, pj] = await Promise.all([
        apiFetch("/api/admin/roles").then((r) => r.json()) as Promise<RolesPermissionsResponse>,
        apiFetch("/api/menu/apps").then((r) => r.json()),
        apiFetch("/api/dashboard/layouts").then((r) => r.json()),
        apiFetch("/api/dashboard/panels").then((r) => r.json()),
      ]);
      if (rp.error) throw new Error(rp.error);
      setData(rp);
      setApps(((aj.data ?? []) as AppLite[]).filter((a) => a.is_active !== false && a.key !== "home"));
      setLayoutRows((lj.data ?? []) as DashboardLayout[]);
      setPanelRows((pj.data ?? []) as DashboardPanel[]);
      const g: Record<string, Set<string>> = {};
      for (const { role_key, permission_key } of rp.matrix) (g[role_key] ??= new Set()).add(permission_key);
      setGranted(g);
      setRoleKey((prev) => prev || rp.roles.find((r) => !r.is_builtin)?.key || rp.roles.find((r) => r.key === "manager")?.key || rp.roles[0]?.key || "");
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) load(); }, [canView, load]);

  const role = data?.roles.find((r) => r.key === roleKey) ?? null;
  const has = (permKey: string) => !!granted[roleKey]?.has(permKey);

  // หมวดของสิทธิ์ "เข้าถึงแอป" (app.*) — แยกไปโชว์ section แอป ไม่ซ้ำใน "หน้าที่"
  const appAccessCat = useMemo(() => data?.permissions.find((p) => p.key.startsWith("app."))?.category ?? "", [data]);

  // สิทธิ์จัดกลุ่มตามหมวด (ตัดหมวดเข้าถึงแอปออก)
  const dutyCats = useMemo(() => {
    if (!data) return [] as { cat: string; perms: PermissionDef[] }[];
    const m = new Map<string, PermissionDef[]>();
    for (const p of data.permissions) {
      if (p.category === appAccessCat) continue;
      (m.get(p.category) ?? m.set(p.category, []).get(p.category)!).push(p);
    }
    return [...m.entries()].map(([cat, perms]) => ({ cat, perms: perms.sort((a, b) => a.sort_order - b.sort_order) }));
  }, [data, appAccessCat]);

  const toggle = async (permKey: string, next: boolean, dangerous?: boolean) => {
    if (!canEdit || !roleKey) return;
    if (next && dangerous && !confirm("สิทธิ์นี้เป็นสิทธิ์อันตราย — ยืนยันเปิดให้ตำแหน่งนี้?")) return;
    setGranted((g) => {
      const n = { ...g }; const s = new Set(n[roleKey] ?? []);
      if (next) s.add(permKey); else s.delete(permKey); n[roleKey] = s; return n;
    });
    try {
      const j = await apiFetch("/api/admin/roles", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "toggle", role_key: roleKey, permission_key: permKey, granted: next, actor: user?.name }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      flash("บันทึกแล้ว");
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่ได้"); void load(); }
  };

  // การ์ดระบบที่ตำแหน่งนี้เห็น (อิงสิทธิ์เข้าแอป) — read-only, ปรับซ่อน/แสดงต่อการ์ดที่ ⚙️ บนแดชบอร์ด
  const cardsSeen = useMemo(() => apps.filter((a) => !a.permission_key || has(a.permission_key)), [apps, granted, roleKey]);

  // ---- เฟส 3: หน้าแดชบอร์ดของ role (widget เสริม + มุมมองเริ่มต้น) ----
  const curLayout = layoutForRole(layoutRows, roleKey);
  const saveLayout = async (patch: Partial<DashboardLayout>) => {
    if (!canEdit || !roleKey) return;
    setLayoutRows((rows) => {
      const others = rows.filter((r) => r.role_key !== roleKey);
      const base = rows.find((r) => r.role_key === roleKey) ?? { role_key: roleKey, widgets: curLayout.widgets, default_view: curLayout.default_view };
      return [...others, { ...base, ...patch, role_key: roleKey }];
    });
    try {
      const j = await apiFetch("/api/dashboard/layouts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role_key: roleKey, patch }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      flash("บันทึกหน้าแดชบอร์ดแล้ว");
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่ได้"); void load(); }
  };
  const toggleWidget = (w: string) => saveLayout({ widgets: curLayout.widgets.includes(w) ? curLayout.widgets.filter((x) => x !== w) : [...curLayout.widgets, w] });
  // ลากวาง widget (จริง) — วางทับตัวไหน = แทรกก่อนตัวนั้น
  const reorderWidget = (target: string) => {
    const from = dragW.current; dragW.current = null;
    if (!from || from === target) return;
    const arr = [...curLayout.widgets]; const fi = arr.indexOf(from), ti = arr.indexOf(target);
    if (fi < 0 || ti < 0) return;
    arr.splice(fi, 1); arr.splice(ti, 0, from);
    saveLayout({ widgets: arr });
  };

  // ---- ซ่อน/แสดงการ์ดระบบต่อตำแหน่ง (เขียน erp_dashboard_panels.visible_roles/hidden) ----
  const rolesWithApp = (app: AppLite): string[] =>
    (data?.roles ?? []).filter((r) => r.active && (!app.permission_key || granted[r.key]?.has(app.permission_key!))).map((r) => r.key);
  const panelOf = (key: string) => panelRows.find((p) => p.app_key === key);
  const roleSeesCard = (app: AppLite): boolean => {
    const p = panelOf(app.key);
    if (p?.hidden) return false;
    if (p?.visible_roles && p.visible_roles.length) return roleKey === "admin" || p.visible_roles.includes(roleKey);
    return !app.permission_key || has(app.permission_key);   // ค่าเริ่มต้น = ตามสิทธิ์เข้าแอป
  };
  const savePanel = async (appKey: string, patch: Partial<DashboardPanel>) => {
    setPanelRows((rows) => {
      const others = rows.filter((r) => r.app_key !== appKey);
      const base = rows.find((r) => r.app_key === appKey) ?? { app_key: appKey, hidden: false, visible_roles: null, enabled_events: null, sort_order: null };
      return [...others, { ...base, ...patch, app_key: appKey }];
    });
    try {
      const j = await apiFetch("/api/dashboard/panels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_key: appKey, patch }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      flash("บันทึกการ์ดแล้ว");
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่ได้"); void load(); }
  };
  // สลับซ่อน/แสดงการ์ดของ "ตำแหน่งที่เลือก" — คำนวณ visible_roles (whitelist) ให้ถูก (ว่าง=ซ่อนหมด, ครบ=ตามสิทธิ์แอป)
  const toggleCard = (app: AppLite) => {
    if (!canEdit || roleKey === "admin" || !app.permission_key) return;
    const all = rolesWithApp(app);
    const p = panelOf(app.key);
    const current = p?.hidden ? [] : (p?.visible_roles && p.visible_roles.length ? p.visible_roles : all);
    const sees = current.includes(roleKey);
    const next = (sees ? current.filter((r) => r !== roleKey) : [...current, roleKey]).filter((r) => all.includes(r));
    if (next.length === 0) return void savePanel(app.key, { hidden: true, visible_roles: null });
    if (next.length === all.length) return void savePanel(app.key, { hidden: false, visible_roles: null });
    void savePanel(app.key, { hidden: false, visible_roles: next });
  };

  // ---- เฟส 2: มุมมองรายคน (สิทธิ์จริง = สิทธิ์ตำแหน่ง + override เฉพาะคน) ----
  useEffect(() => {
    if (mode !== "person" || users.length) return;
    apiFetch("/api/admin/users").then((r) => r.json()).then((j) => setUsers((j.data ?? []) as AdminUser[])).catch(() => { /* ไม่มีสิทธิ์ดูรายชื่อ */ });
  }, [mode, users.length]);
  const loadPerson = async (uid: string) => {
    setPersonId(uid); setPersonEff(null);
    if (!uid) return;
    try {
      const j = await apiFetch(`/api/admin/user-permissions?user_id=${uid}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const eff = new Set<string>((j.role_perms ?? []) as string[]);
      const ov = new Map<string, "grant" | "revoke">(((j.overrides ?? []) as UserOverride[]).map((o) => [o.permission_key, o.mode]));
      for (const [k, m] of ov) { if (m === "grant") eff.add(k); else eff.delete(k); }
      setPersonEff({ role_key: j.role_key ?? null, eff, ov });
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดสิทธิ์รายคนไม่ได้"); }
  };

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-slate-800">บอร์ดตำแหน่ง</h1>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-emerald-600">✓ {msg}</span>}
            <Link href="/admin/roles-permissions" className="h-9 px-3 leading-9 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⚙️ ตารางสิทธิ์ละเอียด</Link>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-3">เลือกตำแหน่ง → เห็นว่าเข้าแอปไหนได้ · เห็นการ์ดระบบอะไร · มีหน้าที่ทำอะไรได้ {canEdit ? "(กดสลับเพื่อแก้)" : "(ดูอย่างเดียว — ต้องมีสิทธิ์ admin.roles จึงแก้ได้)"}</p>

        {/* โหมด */}
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5 mb-4">
          {([["role", "🏷️ ตามตำแหน่ง"], ["compare", "↔️ เทียบตำแหน่ง"], ["person", "👤 รายคน"]] as const).map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-xs sm:text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${mode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>

        {err &&<div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-2">⚠ {err}<button onClick={() => setErr(null)} className="text-red-400 hover:text-red-700">✕</button></div>}

        {loading ? <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div> : !data ? null : (
          <>
            {/* เลือกตำแหน่ง (โหมดตามตำแหน่ง/เทียบ) */}
            {mode !== "person" && (
              <>
                <div className="text-xs font-medium text-slate-500 mb-1.5">{mode === "compare" ? "ตำแหน่ง A" : "เลือกตำแหน่ง (role)"}</div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {data.roles.filter((r) => r.active).map((r) => {
                    const on = r.key === roleKey;
                    return (
                      <button key={r.key} onClick={() => setRoleKey(r.key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border-2 transition-colors ${on ? `${roleBg(r.color)} text-white border-transparent` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        {r.label}
                        <span className={`text-[10px] px-1.5 rounded-full ${on ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{granted[r.key]?.size ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
                {mode === "compare" && (
                  <>
                    <div className="text-xs font-medium text-slate-500 mb-1.5">ตำแหน่ง B (เทียบกับ)</div>
                    <div className="flex flex-wrap items-center gap-2 mb-5">
                      {data.roles.filter((r) => r.active && r.key !== roleKey).map((r) => (
                        <button key={r.key} onClick={() => setCmpKey(r.key)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border-2 transition-colors ${r.key === cmpKey ? `${roleBg(r.color)} text-white border-transparent` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {mode === "role" && role && (
              <div className="space-y-4">
                {/* 1. แอปที่เข้าได้ */}
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-[15px] font-semibold text-slate-800">📱 แอปที่เข้าได้</span>
                    <span className="text-xs text-slate-400">({cardsSeen.length}/{apps.length} แอป{canEdit ? " · กดสลับ" : ""})</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                    {apps.map((a) => {
                      const open = !a.permission_key;   // ไม่มี permission = ทุกคนเข้าได้
                      const on = open || has(a.permission_key!);
                      return (
                        <button key={a.key} disabled={open || !canEdit}
                          onClick={() => a.permission_key && toggle(a.permission_key, !on)}
                          title={open ? "เปิดให้ทุกคน" : on ? "เข้าได้ (กดเพื่อปิด)" : "เข้าไม่ได้ (กดเพื่อเปิด)"}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all ${on ? "border-slate-200 bg-slate-50" : "border-slate-100 opacity-40"} ${(!open && canEdit) ? "hover:border-blue-300 cursor-pointer" : "cursor-default"}`}>
                          <AppIco app={a} size={24} />
                          <span className="text-[11px] text-slate-600 text-center leading-tight line-clamp-2">{a.label}</span>
                          {!on && <span className="text-[9px] text-slate-400">🔒</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* 2. การ์ดระบบบนแดชบอร์ด (ซ่อน/แสดงต่อตำแหน่ง) */}
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[15px] font-semibold text-slate-800">🗂️ การ์ดระบบบนแดชบอร์ด</span>
                    <span className="text-xs text-slate-400">(เห็นบน /dashboard{canEdit && roleKey !== "admin" ? " · กดสลับซ่อน/แสดง" : ""})</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">{roleKey === "admin" ? "ผู้ดูแลระบบเห็นทุกการ์ดเสมอ" : "การ์ดขึ้นตามแอปที่เข้าได้ — ปิดตัวไหน = ซ่อนเฉพาะตำแหน่งนี้"}</p>
                  {(() => {
                    const cands = apps.filter((a) => !a.permission_key || has(a.permission_key));
                    if (cands.length === 0) return <div className="text-xs text-slate-300">ยังไม่มีการ์ด (ตำแหน่งนี้ยังเข้าแอปไม่ได้)</div>;
                    return (
                      <div className="flex flex-wrap gap-2">
                        {cands.map((a) => {
                          const on = roleKey === "admin" || roleSeesCard(a);
                          const editable = canEdit && roleKey !== "admin" && !!a.permission_key;
                          return (
                            <button key={a.key} disabled={!editable} onClick={() => toggleCard(a)}
                              title={editable ? (on ? "แสดงอยู่ (กดเพื่อซ่อน)" : "ซ่อนอยู่ (กดเพื่อแสดง)") : undefined}
                              className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${on ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-white border-slate-200 text-slate-300 line-through"} ${editable ? "hover:border-blue-300 cursor-pointer" : "cursor-default"}`}>
                              <AppIco app={a} size={15} /> {a.label}{!on && " 🚫"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </section>

                {/* 3. หน้าที่ (ทำอะไรได้) */}
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-[15px] font-semibold text-slate-800">📋 หน้าที่ (ทำอะไรได้)</span>
                    <span className="text-xs text-slate-400">(สิทธิ์แยกตามระบบ{canEdit ? " · กดสลับ" : ""})</span>
                  </div>
                  <div className="space-y-1.5">
                    {dutyCats.map(({ cat, perms }) => {
                      const onCount = perms.filter((p) => has(p.key)).length;
                      const isOpen = openCats.has(cat) || onCount > 0;
                      return (
                        <div key={cat} className="border border-slate-100 rounded-lg">
                          <button onClick={() => setOpenCats((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 rounded-lg">
                            <span className="text-sm font-medium text-slate-700 flex-1">{catLabel(cat)}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${onCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{onCount}/{perms.length}</span>
                            <span className="text-slate-300 text-xs">{isOpen ? "▲" : "▼"}</span>
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-2.5 pt-0.5 flex flex-wrap gap-1.5">
                              {perms.map((p) => {
                                const on = has(p.key);
                                return (
                                  <button key={p.key} disabled={!canEdit}
                                    onClick={() => toggle(p.key, !on, p.is_dangerous)}
                                    title={p.description ?? p.key}
                                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${on ? actionCls(p.label, p.key) : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"} ${canEdit ? "cursor-pointer" : "cursor-default"}`}>
                                    {on ? "✓ " : ""}{p.label}{p.is_dangerous && <span title="อันตราย"> ⚠</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* 4. หน้าแดชบอร์ดของตำแหน่งนี้ (เฟส 3) */}
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[15px] font-semibold text-slate-800">🎛️ หน้าแดชบอร์ดของตำแหน่งนี้</span>
                    <span className="text-xs text-slate-400">(widget + มุมมองเริ่มต้น{canEdit ? " · กดจัด" : ""})</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">มีผลกับหน้า /dashboard ของทุกคนในตำแหน่งนี้</p>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-xs text-slate-500">มุมมองเริ่มต้น:</span>
                    {(["systems", "calendar", "list"] as DashboardView[]).map((v) => (
                      <button key={v} disabled={!canEdit} onClick={() => saveLayout({ default_view: v })}
                        className={`text-xs px-2.5 py-1 rounded-full border ${curLayout.default_view === v ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                        {v === "systems" ? "🗂️ การ์ดระบบ" : v === "calendar" ? "📅 ปฏิทิน" : "📋 รายการ"}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mb-1.5">widget ที่แสดง{canEdit ? " (ลากเรียง บน→ล่าง)" : " (บน→ล่าง)"}</div>
                  <div className="space-y-1.5" onDragOver={(e) => { if (dragW.current) e.preventDefault(); }}>
                    {curLayout.widgets.map((w) => {
                      const meta = WIDGET_META[w as keyof typeof WIDGET_META];
                      if (!meta) return null;
                      return (
                        <div key={w} draggable={canEdit}
                          onDragStart={() => { dragW.current = w; }} onDragEnd={() => { dragW.current = null; }}
                          onDragOver={(e) => { if (dragW.current) e.preventDefault(); }}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); reorderWidget(w); }}
                          className={`flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}>
                          {canEdit && <span className="text-slate-300 select-none text-lg leading-none" title="ลากเพื่อเรียง">⠿</span>}
                          <span className="text-lg">{meta.icon}</span>
                          <div className="flex-1 min-w-0"><div className="text-sm text-slate-700">{meta.label}</div><div className="text-[11px] text-slate-400 truncate">{meta.desc}</div></div>
                          {canEdit && <button onClick={() => toggleWidget(w)} title="เอาออก" className="w-7 h-7 rounded text-rose-400 hover:bg-rose-50">✕</button>}
                        </div>
                      );
                    })}
                    {curLayout.widgets.length === 0 && <div className="text-xs text-slate-300 px-1">ไม่มี widget เสริม (แสดงแค่การ์ดระบบ/ปฏิทิน/รายการ)</div>}
                  </div>
                  {canEdit && ALL_WIDGETS.filter((w) => !curLayout.widgets.includes(w)).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-slate-400">เพิ่ม:</span>
                      {ALL_WIDGETS.filter((w) => !curLayout.widgets.includes(w)).map((w) => (
                        <button key={w} onClick={() => toggleWidget(w)} className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">+ {WIDGET_META[w].icon} {WIDGET_META[w].label}</button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* เทียบตำแหน่ง (เฟส 2) */}
            {mode === "compare" && role && (!cmpKey ? (
              <div className="text-center text-sm text-slate-400 py-10 bg-white border border-slate-200 rounded-xl">เลือก “ตำแหน่ง B” ด้านบนเพื่อเทียบ</div>
            ) : (
              <div className="space-y-4">
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[15px] font-semibold text-slate-800 mb-1">📱 แอปที่เข้าได้ — เทียบ</div>
                  <p className="text-[11px] text-slate-400 mb-3">A = {data.roles.find((r) => r.key === roleKey)?.label} · B = {data.roles.find((r) => r.key === cmpKey)?.label} · แถบเหลือง = ต่างกัน</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {apps.filter((a) => a.permission_key).map((a) => {
                      const inA = !!granted[roleKey]?.has(a.permission_key!); const inB = !!granted[cmpKey]?.has(a.permission_key!);
                      return (
                        <div key={a.key} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${inA !== inB ? "border-amber-300 bg-amber-50" : "border-slate-100"}`}>
                          <AppIco app={a} size={18} />
                          <span className="flex-1 text-xs text-slate-600 truncate">{a.label}</span>
                          <span className={`text-[11px] ${inA ? "text-emerald-600" : "text-slate-300"}`}>A{inA ? "✓" : "✗"}</span>
                          <span className={`text-[11px] ${inB ? "text-emerald-600" : "text-slate-300"}`}>B{inB ? "✓" : "✗"}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-[15px] font-semibold text-slate-800 mb-3">📋 หน้าที่ — เทียบ (จำนวนสิทธิ์ต่อหมวด)</div>
                  <div className="space-y-1">
                    {dutyCats.map(({ cat, perms }) => {
                      const na = perms.filter((p) => granted[roleKey]?.has(p.key)).length;
                      const nb = perms.filter((p) => granted[cmpKey]?.has(p.key)).length;
                      if (na === 0 && nb === 0) return null;
                      return (
                        <div key={cat} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${na !== nb ? "bg-amber-50" : ""}`}>
                          <span className="flex-1 text-sm text-slate-700">{catLabel(cat)}</span>
                          <span className="text-xs text-slate-500">A <b className="text-slate-700">{na}</b> · B <b className="text-slate-700">{nb}</b></span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ))}

            {/* รายคน (เฟส 2) */}
            {mode === "person" && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1.5">เลือกคน</div>
                  <select value={personId} onChange={(e) => loadPerson(e.target.value)} className="w-full max-w-sm h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                    <option value="">— เลือกผู้ใช้ —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.email} ({roleLabel(u.role)})</option>)}
                  </select>
                </div>
                {!personId ? (
                  <div className="text-center text-sm text-slate-400 py-10 bg-white border border-slate-200 rounded-xl">เลือกคนเพื่อดูว่าเขาเห็นอะไร (รวมสิทธิ์เฉพาะคน)</div>
                ) : !personEff ? (
                  <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
                ) : (
                  <>
                    <div className="text-sm text-slate-600">ตำแหน่ง: <b>{roleLabel(personEff.role_key ?? "")}</b>{personEff.ov.size > 0 && <span className="text-amber-600"> · มีสิทธิ์เฉพาะคน {personEff.ov.size} รายการ</span>}</div>
                    <section className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="text-[15px] font-semibold text-slate-800 mb-3">📱 แอปที่เข้าได้ (จริง)</div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                        {apps.map((a) => {
                          const open = !a.permission_key; const on = open || personEff.eff.has(a.permission_key!);
                          const ov = a.permission_key ? personEff.ov.get(a.permission_key) : undefined;
                          return (
                            <div key={a.key} className={`relative flex flex-col items-center gap-1 p-2.5 rounded-lg border ${on ? "border-slate-200 bg-slate-50" : "border-slate-100 opacity-40"}`}>
                              <AppIco app={a} size={24} />
                              <span className="text-[11px] text-slate-600 text-center leading-tight line-clamp-2">{a.label}</span>
                              {ov && <span className={`absolute top-1 right-1 text-[10px] ${ov === "grant" ? "text-emerald-600" : "text-rose-600"}`}>{ov === "grant" ? "➕" : "➖"}</span>}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2">➕ = ให้สิทธิ์พิเศษเฉพาะคน · ➖ = ตัดสิทธิ์เฉพาะคน (ต่างจากตำแหน่ง)</p>
                    </section>
                    <section className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="text-[15px] font-semibold text-slate-800 mb-3">📋 หน้าที่ (จริง)</div>
                      <div className="space-y-0.5">
                        {dutyCats.map(({ cat, perms }) => {
                          const n = perms.filter((p) => personEff.eff.has(p.key)).length;
                          if (n === 0) return null;
                          return (
                            <div key={cat} className="flex items-center gap-2 px-3 py-1.5">
                              <span className="flex-1 text-sm text-slate-700">{catLabel(cat)}</span>
                              <span className="text-xs text-slate-500">{n}/{perms.length}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}
          </>
        )}
        <p className="mt-4 text-[11px] text-slate-400">แก้ที่นี่ = แก้สิทธิ์จริงของตำแหน่ง (มีผลกับทุกคนในตำแหน่งนั้น) · บันทึกทันที + มีประวัติ · ผู้แก้: {user?.name ?? "—"}</p>
      </div>
    </PlaygroundShell>
  );
}
