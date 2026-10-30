"use client";
/**
 * 🔑 สิทธิ์ตามเมนู (ของกลาง) — ตั้งสิทธิ์ต่อตำแหน่ง/รายคน จัดกลุ่มตาม "เมนูบนแถบของแอป"
 *   เมนู → สิทธิ์ที่เกี่ยวข้อง = lib/menu-permissions · ลำดับ/ชื่อเมนูตามที่แอปจัดไว้ = lib/app-menu-layout
 *   ติ๊ก = บันทึกทันที PATCH /api/admin/roles (RPC erp_role_permission_toggle — ต้อง admin.roles · มีประวัติในตัว)
 *   👤 รายคน = UserPermOverrideButton (ของกลาง) · สิทธิ์อันตรายถามก่อนเปิด · ผู้ดูแลระบบได้ทุกสิทธิ์เสมอ
 *   สิทธิ์เป็นของกลาง — สิทธิ์เดียวกันที่อยู่หลายเมนูติ๊กตามกัน และมีผลทุกแอป
 * ใช้ที่: /tasks/settings (🔑 สิทธิ์) · ⚙️ ตั้งค่าแอปเดี่ยว (components/app-settings-panel)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { askConfirm } from "@/components/modal/ask-dialog";
import { ErrorState, LoadingState } from "@/components/state-views";
import { UserPermOverrideButton } from "@/components/user-perm-override";
import { applyAppOverrides, menuPlace, moreLabelOf } from "@/lib/app-menu-layout";
import { APP_EXTRA_CATEGORIES, leftoverPermissions, menuPermissions } from "@/lib/menu-permissions";

type Role = { key: string; label: string; active: boolean; sort_order: number };
type Perm = { key: string; label: string; category: string; description: string | null; is_dangerous: boolean; sort_order: number };
type MenuRow = { id: string; label: string; href: string; icon: string | null; permission_key: string | null; is_active: boolean; show_in_sidebar: boolean; app_keys: string[]; sort_order: number; section?: string; app_overrides?: unknown };
type AppRow = { key: string; label: string; icon: string | null; permission_key: string | null; menu_more_label?: string | null };
type Section = { id: string; icon?: string | null; iconName?: string; label: string; badge?: string; keys: string[]; sameAsLabel?: string };

const chevron = (open: boolean) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
);

export function MenuPermissionMatrix({ appKey }: { appKey: string }) {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const canEditRoles = can("admin.roles");
  const canPerson = can("admin.users");
  const [data, setData] = useState<{ roles: Role[]; perms: Perm[]; menus: MenuRow[]; app: AppRow | null } | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const openInit = useRef(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [rj, mj, aj] = await Promise.all([
        apiFetch("/api/admin/roles").then((r) => r.json()),
        apiFetch("/api/menu").then((r) => r.json()),
        apiFetch("/api/menu/apps").then((r) => r.json()),
      ]);
      if (rj.error) throw new Error(rj.error);
      setData({
        roles: ((rj.roles ?? []) as Role[]).filter((r) => r.active).sort((a, b) => a.sort_order - b.sort_order),
        perms: (rj.permissions ?? []) as Perm[],
        menus: (mj.data ?? []) as MenuRow[],
        app: ((aj.data ?? []) as AppRow[]).find((a) => a.key === appKey) ?? null,
      });
      setGranted(new Set(((rj.matrix ?? []) as { role_key: string; permission_key: string }[]).map((m) => `${m.role_key}|${m.permission_key}`)));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [appKey]);
  useEffect(() => { void load(); }, [load]);

  // แต่ละเมนูของแอป (ตามลำดับที่แอปจัด) → สิทธิ์ที่เกี่ยวข้อง
  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    const { perms, menus, app } = data;
    const out: Section[] = [];
    if (app?.permission_key && perms.some((p) => p.key === app.permission_key))
      out.push({ id: "__app", icon: app.icon, label: t(`เข้าแอป ${app.label}`, `Open the ${app.label} app`), keys: [app.permission_key] });
    const appMenus = applyAppOverrides(menus.filter((m) => m.is_active && m.show_in_sidebar && (m.app_keys ?? []).includes(appKey)), appKey);
    const labelByHref = new Map(appMenus.map((m) => [m.href.split("?")[0], m.label]));
    const used = new Set<string>(out.flatMap((s) => s.keys));
    const more = moreLabelOf(app);
    for (const m of appMenus) {
      const r = menuPermissions(m, perms);
      const sameAsLabel = r.sameAs ? labelByHref.get(r.sameAs) : undefined;
      r.keys.forEach((k) => used.add(k));
      const place = menuPlace(m, appKey);
      out.push({
        id: m.id, icon: m.icon, label: m.label, keys: sameAsLabel ? [] : r.keys, sameAsLabel,
        badge: place === "more" ? t(`ใน ${more}`, `In ${more}`) : place === "hidden" ? t("ซ่อนอยู่", "Hidden") : undefined,
      });
    }
    const extra = leftoverPermissions(used, perms, APP_EXTRA_CATEGORIES[appKey] ?? []);
    if (extra.length) out.push({ id: "__extra", iconName: "list", label: t("อื่น ๆ ของแอปนี้", "Other permissions in this app"), keys: extra });
    return out;
  }, [data, appKey, t]);

  // เปิดครั้งแรก: กางเมนูแรกที่มีสิทธิ์ให้เห็นตัวอย่าง
  useEffect(() => {
    if (openInit.current || !sections.length) return;
    openInit.current = true;
    const first = sections.find((s) => s.id !== "__app" && s.keys.length);
    if (first) setOpen(new Set([first.id]));
  }, [sections]);

  const toggle = async (role: Role, p: Perm) => {
    if (role.key === "admin" || !canEditRoles || busy) return;
    const cell = `${role.key}|${p.key}`;
    const next = !granted.has(cell);
    if (next && p.is_dangerous && !(await askConfirm({
      title: t("เปิดสิทธิ์ที่มีผลกระทบสูง?", "Grant a high-impact permission?"),
      message: t(`ให้ตำแหน่ง “${role.label}” ได้สิทธิ์ “${p.label}” — มีผลทุกแอปที่ใช้สิทธิ์นี้`, `Give “${role.label}” the “${p.label}” permission — applies in every app that uses it`),
      confirmText: t("เปิดสิทธิ์", "Grant"), variant: "danger",
    }))) return;
    const flip = (on: boolean) => setGranted((prev) => { const s = new Set(prev); if (on) s.add(cell); else s.delete(cell); return s; });
    setBusy(cell); flip(next);
    try {
      const res = await apiFetch("/api/admin/roles", { method: "PATCH", body: JSON.stringify({ kind: "toggle", role_key: role.key, permission_key: p.key, granted: next }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(next ? t(`${role.label} ได้สิทธิ์ “${p.label}” แล้ว`, `${role.label} can now: ${p.label}`) : t(`ปิดสิทธิ์ “${p.label}” ของ ${role.label} แล้ว`, `Removed “${p.label}” from ${role.label}`));
    } catch (e) {
      flip(!next);
      toast.error(`${t("บันทึกไม่สำเร็จ", "Couldn't save")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); }
  };

  if (err) return <ErrorState title={t("โหลดสิทธิ์ไม่สำเร็จ", "Couldn't load permissions")} hint={err} onRetry={() => void load()} />;
  if (!data) return <LoadingState />;

  const permBy = new Map(data.perms.map((p) => [p.key, p]));
  const roles = data.roles;
  const term = q.trim().toLowerCase();
  const hit = (p: Perm) => !term || p.label.toLowerCase().includes(term) || p.key.toLowerCase().includes(term);
  const shown = sections
    .map((s) => ({ ...s, rows: s.keys.map((k) => permBy.get(k)).filter((p): p is Perm => !!p && (hit(p) || s.label.toLowerCase().includes(term))) }))
    .filter((s) => !term || s.rows.length > 0);
  const allOpen = sections.length > 0 && sections.every((s) => open.has(s.id));
  const grid = { gridTemplateColumns: `minmax(220px,1fr) repeat(${roles.length}, 76px)`, minWidth: 260 + roles.length * 76 };
  const isOn = (role: Role, key: string) => role.key === "admin" || granted.has(`${role.key}|${key}`);
  const sectionIcon = (s: Section) => s.iconName ? <Icon name={s.iconName} size={18} /> : <Icon value={s.icon ?? "•"} size={18} />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-slate-100 space-y-2">
        <div>
          <h2 className="font-semibold text-slate-800">{t("สิทธิ์ตามเมนู", "Permissions by menu")}{data.app ? ` — ${data.app.label}` : ""}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t("กดชื่อเมนูเพื่อกาง · ติ๊กแล้วบันทึกทันที · ผู้ดูแลระบบทำได้ทุกอย่างเสมอ · สิทธิ์เดียวกันที่อยู่หลายเมนูติ๊กตามกัน และมีผลทุกแอป", "Click a menu to expand · Ticks save right away · Admins can always do everything · A permission shared by several menus is the same tick everywhere and applies in every app")}</p>
        </div>
        {!canEditRoles && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{t("ดูได้อย่างเดียว — แก้สิทธิ์ตามตำแหน่งต้องมีสิทธิ์ “จัดการตำแหน่ง”", "View only — changing role permissions needs the “manage roles” permission")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[180px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" size={15} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาสิทธิ์ เช่น ลบรูป", "Search permissions, e.g. delete image")}
              className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm focus:border-violet-400 focus:outline-none" />
          </label>
          <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((s) => s.id)))}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">{allOpen ? t("พับทั้งหมด", "Collapse all") : t("กางทั้งหมด", "Expand all")}</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: grid.minWidth }}>
          <div className="grid items-center border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-medium text-slate-500" style={grid}>
            <span>{t("เมนู / สิทธิ์", "Menu / permission")}</span>
            {roles.map((r) => <span key={r.key} className="text-center truncate" title={r.label}>{r.label}</span>)}
          </div>
          {shown.map((s) => {
            const isOpen = !!term || open.has(s.id);
            return (
              <div key={s.id} className="border-b border-slate-100 last:border-b-0">
                <button type="button" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                  className="grid w-full items-center px-4 py-2.5 text-left hover:bg-slate-50" style={grid}>
                  <span className="flex min-w-0 items-center gap-2">
                    {chevron(isOpen)}
                    {sectionIcon(s)}
                    <span className="truncate font-medium text-slate-800">{s.label}</span>
                    {s.badge && <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{s.badge}</span>}
                  </span>
                  {s.keys.length > 0
                    ? roles.map((r) => <span key={r.key} className="text-center text-[11px] text-slate-400">{s.keys.filter((k) => isOn(r, k)).length}/{s.keys.length}</span>)
                    : null}
                </button>
                {isOpen && (s.rows.length === 0 ? (
                  <p className="px-4 pb-3 pl-11 text-xs text-slate-500">
                    {s.sameAsLabel ? t(`ใช้สิทธิ์ชุดเดียวกับ “${s.sameAsLabel}”`, `Uses the same permissions as “${s.sameAsLabel}”`)
                      : t("ไม่มีสิทธิ์ย่อย — ใครเข้าแอปได้ก็เห็น (ซ่อนเมนูได้ที่ “ใครเห็นเมนูไหน”)", "No permissions of its own — anyone who can open the app sees it (hide it under “Who sees which menu”)")}
                  </p>
                ) : s.rows.map((p) => (
                  <div key={p.key} className="grid items-center border-t border-slate-50 px-4 py-2 pl-11 text-sm hover:bg-slate-50/50" style={grid}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-slate-800" title={p.key}>
                        {p.label}
                        {p.is_dangerous && <span className="rounded border border-red-200 bg-red-50 px-1 text-[10px] text-red-600">{t("อันตราย", "High impact")}</span>}
                      </div>
                      {p.description && <div className="text-xs text-slate-400">{p.description}</div>}
                      {canPerson && <div className="mt-1"><UserPermOverrideButton permissionKey={p.key} label={p.label} /></div>}
                    </div>
                    {roles.map((r) => {
                      const cell = `${r.key}|${p.key}`;
                      const on = isOn(r, p.key);
                      const fixed = r.key === "admin";
                      return (
                        <span key={r.key} className="text-center">
                          <button type="button" onClick={() => void toggle(r, p)} disabled={fixed || !canEditRoles || busy === cell}
                            aria-label={`${r.label} — ${p.label}`} aria-pressed={on}
                            title={fixed ? t("ผู้ดูแลระบบทำได้ทุกอย่างเสมอ", "Admins can always do everything") : on ? t("กดเพื่อปิด", "Click to remove") : t("กดเพื่อเปิด", "Click to grant")}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition-colors ${on ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-transparent hover:border-violet-300"} ${fixed || !canEditRoles ? "cursor-default opacity-60" : "cursor-pointer"}`}>✓</button>
                        </span>
                      );
                    })}
                  </div>
                )))}
              </div>
            );
          })}
          {shown.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("ไม่พบสิทธิ์ที่ค้นหา", "No permissions match your search")}</p>}
        </div>
      </div>
    </div>
  );
}
