"use client";

// ============================================================
// บอร์ดตำแหน่ง (Role Board) — เห็นภาพว่าแต่ละตำแหน่ง "เห็นอะไร + ทำอะไรได้"
// เสริมหน้า /admin/roles-permissions (ตารางติ๊กเทคนิค) — ตัวนี้เห็นภาพ + แก้ได้
// reuse /api/admin/roles (roles+permissions+matrix, PATCH toggle) + /api/menu/apps
// ============================================================
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { RolesPermissionsResponse, PermissionDef } from "@/app/api/admin/roles/route";

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

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 1800); };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [rp, aj] = await Promise.all([
        apiFetch("/api/admin/roles").then((r) => r.json()) as Promise<RolesPermissionsResponse>,
        apiFetch("/api/menu/apps").then((r) => r.json()),
      ]);
      if (rp.error) throw new Error(rp.error);
      setData(rp);
      setApps(((aj.data ?? []) as AppLite[]).filter((a) => a.is_active !== false && a.key !== "home"));
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
        <p className="text-sm text-slate-500 mb-4">เลือกตำแหน่ง → เห็นว่าเข้าแอปไหนได้ · เห็นการ์ดระบบอะไร · มีหน้าที่ทำอะไรได้ {canEdit ? "(กดสลับเพื่อแก้)" : "(ดูอย่างเดียว — ต้องมีสิทธิ์ admin.roles จึงแก้ได้)"}</p>

        {err && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-2">⚠ {err}<button onClick={() => setErr(null)} className="text-red-400 hover:text-red-700">✕</button></div>}

        {loading ? <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div> : !data ? null : (
          <>
            {/* เลือกตำแหน่ง */}
            <div className="text-xs font-medium text-slate-500 mb-1.5">เลือกตำแหน่ง (role)</div>
            <div className="flex flex-wrap items-center gap-2 mb-5">
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

            {role && (
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

                {/* 2. การ์ดระบบบนแดชบอร์ด (derived) */}
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-[15px] font-semibold text-slate-800">🗂️ การ์ดระบบบนแดชบอร์ด</span>
                    <span className="text-xs text-slate-400">(เห็นบน /dashboard — ตามแอปที่เข้าได้)</span>
                  </div>
                  {cardsSeen.length === 0 ? <div className="text-xs text-slate-300">ยังไม่เห็นการ์ดระบบใด</div> : (
                    <div className="flex flex-wrap gap-2">
                      {cardsSeen.map((a) => (
                        <span key={a.key} className="inline-flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                          <AppIco app={a} size={15} /> {a.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-2">ซ่อน/แสดงการ์ดเฉพาะบางตำแหน่ง ปรับได้ที่ปุ่ม ⚙️ บนการ์ดแต่ละใบใน /dashboard</p>
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
              </div>
            )}
          </>
        )}
        <p className="mt-4 text-[11px] text-slate-400">แก้ที่นี่ = แก้สิทธิ์จริงของตำแหน่ง (มีผลกับทุกคนในตำแหน่งนั้น) · บันทึกทันที + มีประวัติ · ผู้แก้: {user?.name ?? "—"}</p>
      </div>
    </PlaygroundShell>
  );
}
