"use client";
/**
 * /admin/app-manager — จัดการแอป (หน้ารวมทุกแอป · หน้าจัดการแอป รอบ 3 · เจ้าของขอ 2026-11-12)
 *   ซ้าย = รายชื่อแอปทั้งหมด (จำนวนเมนู · ล็อกสิทธิ์) + ถังขยะ · ขวา = แผงเดียวกับ ⚙️ ตั้งค่าในแอปเดี่ยว (AppSettingsPanel — ไม่ทำซ้ำ)
 *     → เพิ่ม/เอาออก/เรียงเมนู · ใครเห็น · ดูแบบคนนี้ · สิทธิ์ตามเมนู ได้ทุกแอปจากหน้าเดียว
 *   ถังขยะ (components/app-settings-panel/menu-trash) = เมนูที่ปิดทั้งระบบ / ไม่อยู่แอปไหน → กู้คืน หรือลบถาวร (ที่นี่ที่เดียว)
 *   📱 แอปพนักงาน (2026-11-19 · docs/staff-apps.md) = แอปที่แอดมินสร้างเอง → ตัวช่วยสร้าง components/staff-app-builder
 *     ร่าง → เผยแพร่ · ประวัติเวอร์ชัน · ถังขยะแอป · ลิงก์ ?staff=<id> / ?view=staff-trash
 *   ข้อมูล: GET /api/menu/apps + GET /api/menu?all=1 + GET /api/staff-apps · เมนูของแอป = appMenuRows (กฎเดียวกับแถบแอปเดี่ยว) · ลิงก์ ?app=<key> / ?view=trash
 *   สิทธิ์: admin.users (เหมือน /admin/menu และ ⚙️ ในแอปเดี่ยว)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { appMenuRows } from "@/lib/app-menu-layout";
import { trashReason } from "@/lib/app-menu-membership";
import { draftChanged } from "@/lib/staff-apps";
import { AppSettingsPanel, type AppSettingsMenuItem } from "@/components/app-settings-panel";
import { MenuTrash } from "@/components/app-settings-panel/menu-trash";
import { StaffAppBuilder, type StaffAppRow } from "@/components/staff-app-builder";
import { StaffAppCreateModal, StaffAppTrash } from "@/components/staff-app-builder/create-and-trash";
import { Icon } from "@/components/icon";

type AppRow = { id?: string; key: string; label: string; icon: string | null; sort_order?: number; permission_key?: string | null; menu_more_label?: string | null; default_href?: string | null; kind?: string | null };
type MenuRowFull = AppSettingsMenuItem & { is_active: boolean; show_in_sidebar: boolean; updated_at?: string | null; section?: string | null; icon_url?: string | null };
const TRASH = "__trash";
const STAFF_TRASH = "__staff_trash";
const STAFF = "staff:";

export default function AppManagerPage() {
  const allowed = usePermission("admin.users");
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [rows, setRows] = useState<MenuRowFull[] | null>(null);
  const [staffApps, setStaffApps] = useState<StaffAppRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState("");
  const [rev, setRev] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  // เปิดจากลิงก์ ?app=<key> / ?view=trash / ?staff=<id> / ?view=staff-trash
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const view = p.get("view");
      const v = view === "trash" ? TRASH : view === "staff-trash" ? STAFF_TRASH : p.get("staff") ? `${STAFF}${p.get("staff")}` : p.get("app") ?? "";
      if (v) setSel(v);
    } catch { /* noop */ }
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const bust = `_=${Date.now()}`;   // ข้ามแคช 30 วิ ของ /api/menu — เพิ่งบันทึกต้องเห็นทันที
      const [aj, mj, sj] = await Promise.all([
        apiFetch(`/api/menu/apps?${bust}`).then((r) => r.json()),
        apiFetch(`/api/menu?all=1&${bust}`).then((r) => r.json()),
        apiFetch(`/api/staff-apps?${bust}`).then((r) => r.json()),
      ]);
      if (aj.error || mj.error || sj.error) throw new Error(aj.error || mj.error || sj.error);
      setApps(((aj.data ?? []) as AppRow[]).filter((a) => a.kind !== "staff").sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      setRows((mj.data ?? []) as MenuRowFull[]);
      setStaffApps((sj.apps ?? []) as StaffAppRow[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดรายชื่อแอปไม่สำเร็จ"); }
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load, rev]);
  useEffect(() => { if (!sel && apps?.length) setSel(apps[0].key); }, [apps, sel]);

  const pick = (k: string) => {
    setSel(k);
    const q = k === TRASH ? "?view=trash" : k === STAFF_TRASH ? "?view=staff-trash" : k.startsWith(STAFF) ? `?staff=${encodeURIComponent(k.slice(STAFF.length))}` : `?app=${encodeURIComponent(k)}`;
    try { window.history.replaceState(null, "", q); } catch { /* noop */ }
  };
  const counts = useMemo(() => Object.fromEntries((apps ?? []).map((a) => [a.key, appMenuRows(rows ?? [], a.key).length])), [apps, rows]);
  const trash = useMemo(() => (rows ?? []).filter((r) => trashReason(r) !== null), [rows]);
  const liveStaff = staffApps.filter((a) => !a.deleted_at);
  const trashedStaff = staffApps.filter((a) => !!a.deleted_at);
  const app = apps?.find((a) => a.key === sel) ?? null;
  const staffApp = sel.startsWith(STAFF) ? staffApps.find((a) => a.id === sel.slice(STAFF.length) && !a.deleted_at) ?? null : null;
  const items = useMemo(() => (app ? appMenuRows(rows ?? [], app.key) : []), [app, rows]);
  // ชื่อแอปหลัก (ไว้จัดกลุ่มเมนูในตัวช่วยสร้าง)
  const appLabels = useMemo(() => Object.fromEntries((apps ?? []).map((a) => [a.key, a.label])), [apps]);

  if (!allowed) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const navBtn = (on: boolean) => `flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${on ? "bg-violet-100 font-medium text-violet-800" : "text-slate-700 hover:bg-slate-100"}`;
  const staffBadge = (a: StaffAppRow) => a.status !== "published"
    ? <span className="rounded bg-amber-50 px-1.5 text-[11px] text-amber-700">ร่าง</span>
    : draftChanged(a.draft, a.last_snapshot)
      ? <span className="rounded bg-blue-50 px-1.5 text-[11px] text-blue-700">แก้ค้าง</span>
      : <span className="rounded bg-emerald-50 px-1.5 text-[11px] text-emerald-700">ใช้งาน</span>;

  return (
    <PlaygroundShell>
      <div className="flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col md:h-[100dvh] md:flex-row">
        {/* ── รายชื่อแอป ── */}
        <aside className="flex-shrink-0 border-b border-slate-200 bg-white md:w-64 md:border-b-0 md:border-r md:overflow-y-auto">
          <div className="px-3 pt-3">
            <h1 className="text-lg font-semibold text-slate-800"><Icon name="settings" /> จัดการแอป</h1>
            <p className="mt-0.5 text-xs text-slate-500">เลือกแอป → เพิ่ม/เอาออกเมนู · ใครเห็น · ดูแบบคนนี้</p>
          </div>
          {/* มือถือ: เลือกจากรายการ */}
          <div className="flex gap-2 p-3 md:hidden">
            <select value={sel} onChange={(e) => pick(e.target.value)} aria-label="เลือกแอป" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm">
              <optgroup label="แอปพนักงาน">
                {liveStaff.map((a) => <option key={a.id} value={`${STAFF}${a.id}`}>{a.label}{a.status !== "published" ? " (ร่าง)" : ""}</option>)}
                <option value={STAFF_TRASH}>ถังขยะแอป ({trashedStaff.length})</option>
              </optgroup>
              <optgroup label="แอปหลัก">
                {(apps ?? []).map((a) => <option key={a.key} value={a.key}>{a.label} ({counts[a.key] ?? 0})</option>)}
                <option value={TRASH}>ถังขยะเมนู ({trash.length})</option>
              </optgroup>
            </select>
            <button type="button" onClick={() => setCreateOpen(true)} className="h-10 shrink-0 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white"><Icon name="plus" /> สร้างแอป</button>
          </div>
          <nav className="hidden space-y-0.5 p-2 md:block" aria-label="รายชื่อแอป">
            {!apps && !err && [0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}
            {apps && (
              <>
                <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">แอปพนักงาน</span>
                  <button type="button" onClick={() => setCreateOpen(true)} className="h-7 rounded-md bg-violet-600 px-2 text-xs font-medium text-white hover:bg-violet-700"><Icon name="plus" /> สร้างแอป</button>
                </div>
                {liveStaff.length === 0 && <p className="px-2.5 pb-1 text-xs text-slate-400">ยังไม่มี — กด “สร้างแอป”</p>}
                {liveStaff.map((a) => {
                  const k = `${STAFF}${a.id}`;
                  return (
                    <button key={a.id} type="button" onClick={() => pick(k)} className={navBtn(sel === k)} aria-current={sel === k ? "page" : undefined}>
                      <span className="w-6 text-center"><Icon value={a.icon ?? "📱"} /></span>
                      <span className="min-w-0 flex-1 truncate">{a.label}</span>
                      {staffBadge(a)}
                    </button>
                  );
                })}
                <button type="button" onClick={() => pick(STAFF_TRASH)} className={navBtn(sel === STAFF_TRASH)} aria-current={sel === STAFF_TRASH ? "page" : undefined}>
                  <span className="w-6 text-center"><Icon name="trash" /></span>
                  <span className="flex-1 text-xs">ถังขยะแอป</span>
                  <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">{trashedStaff.length}</span>
                </button>
                <div className="my-2 border-t border-slate-100" />
                <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">แอปหลัก</div>
              </>
            )}
            {(apps ?? []).map((a) => (
              <button key={a.key} type="button" onClick={() => pick(a.key)} className={navBtn(sel === a.key)} aria-current={sel === a.key ? "page" : undefined}>
                <span className="w-6 text-center"><Icon value={a.icon ?? "📱"} /></span>
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                {a.permission_key && <span className="text-slate-400" title={`ต้องมีสิทธิ์ “${a.permission_key}” ถึงเข้าแอปได้`}><Icon name="lock" /></span>}
                <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">{counts[a.key] ?? 0}</span>
              </button>
            ))}
            {apps && (
              <>
                <div className="my-2 border-t border-slate-100" />
                <button type="button" onClick={() => pick(TRASH)} className={navBtn(sel === TRASH)} aria-current={sel === TRASH ? "page" : undefined}>
                  <span className="w-6 text-center"><Icon name="delete" /></span>
                  <span className="flex-1">ถังขยะเมนู</span>
                  <span className={`rounded px-1.5 text-[11px] ${trash.length ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{trash.length}</span>
                </button>
                <a href="/admin/menu" className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-blue-600 hover:bg-slate-50">แก้ชื่อ/ไอคอน/หมวดเมนู · ตั้งค่าแอป/PWA ↗</a>
              </>
            )}
          </nav>
        </aside>

        {/* ── แผงของแอปที่เลือก ── */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {err ? (
            <div className="m-4 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              โหลดข้อมูลไม่สำเร็จ: {err}
              <button type="button" onClick={() => setRev((n) => n + 1)} className="h-8 rounded-lg border border-red-200 bg-white px-3 text-xs hover:bg-red-50"><Icon name="refresh" /> ลองใหม่</button>
            </div>
          ) : !apps || !rows ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div>
          ) : sel === TRASH ? (
            <MenuTrash menus={trash} allMenus={rows} apps={apps} onChanged={() => setRev((n) => n + 1)} />
          ) : sel === STAFF_TRASH ? (
            <StaffAppTrash apps={trashedStaff} onChanged={() => setRev((n) => n + 1)} />
          ) : staffApp ? (
            <StaffAppBuilder key={staffApp.id} app={staffApp} menus={rows} appLabels={appLabels} onChanged={() => setRev((n) => n + 1)} />
          ) : app ? (
            <AppSettingsPanel key={app.key} appKey={app.key} appLabel={app.label} appId={app.id ?? null} moreLabel={app.menu_more_label ?? null}
              defaultHref={app.default_href ?? null} items={items} inHub onSaved={() => setRev((n) => n + 1)} />
          ) : (
            <div className="p-6 text-center text-sm text-slate-500">ไม่พบแอปนี้ — เลือกแอปจากรายการ</div>
          )}
        </main>
      </div>
      <StaffAppCreateModal open={createOpen} onClose={() => setCreateOpen(false)} staffApps={staffApps}
        onCreated={(a) => { setRev((n) => n + 1); pick(`${STAFF}${a.id}`); }} />
    </PlaygroundShell>
  );
}
