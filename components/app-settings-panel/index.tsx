"use client";
/**
 * ⚙️ ตั้งค่าแอปเดี่ยว (ของกลาง) — เปิดจากแถบบนของ /app/<key> (แอดมิน)
 *   แท็บ 👁 ใครเห็นเมนูไหน: ติ๊กตำแหน่งต่อเมนู (ไม่ติ๊ก = ทุกคน) + 👤 รายคน (ให้เห็นเพิ่ม / ซ่อนจาก) + ดูแทนตำแหน่ง
 *     เก็บที่ erp_menu_items.audience (กฎ lib/menu-audience) · บันทึกแบบร่าง → 💾 · PATCH /api/menu (admin.users + ประวัติ)
 *     มีผลกับแถบเมนูแอปเดี่ยว · เมนูซ้าย · หน้ารวมแอป — "ซ่อน/โชว์" เท่านั้น กันเข้าจริงใช้สิทธิ์ตำแหน่ง
 *   แท็บ ↕️ จัดเรียง / ซ่อนเมนู: ลากเรียง · บนแถบ / รวมในปุ่ม "เพิ่มเติม ▾" / ซ่อน · ชื่อปุ่มรวมเมนู (./menu-layout · กฎ lib/app-menu-layout)
 *   แท็บ 🔧 ตั้งค่า<แอป>: หน้าตั้งค่าเฉพาะของแอปนั้น (ถ้ามี เช่น จัดการงาน → /tasks/settings + 🔔 รายงานและแจ้งเตือนอัตโนมัติ) ฝังในกรอบ · หลายแท็บได้
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth, type Permission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { cleanAudience, describeAudience, menuVisibleTo, type MenuAudience } from "@/lib/menu-audience";
import type { UserPickerValue } from "@/components/pickers";
import { MultiUserPicker } from "@/app/tasks/multi-user-picker";
import { MenuLayoutTab } from "./menu-layout";

export type AppSettingsMenuItem = { id: string; label: string; icon: string | null; href: string; permission_key: string | null; parent_id?: string | null; audience?: unknown; sort_order: number; app_overrides?: unknown };
type Role = { key: string; label: string; active?: boolean };

/** หน้าตั้งค่าเฉพาะของแต่ละแอป (ฝังเป็นแท็บ · หน้าต้องรองรับ ?embed=1 — PlaygroundShell ทำให้เอง) — เพิ่มแอปอื่นที่นี่ที่เดียว
 *  perm = โชว์แท็บเฉพาะคนที่มีสิทธิ์นี้ (ไม่ใส่ = ทุกคนที่เปิด ⚙️ ได้) */
type AppSettingsPage = { href: string; label: string; icon?: string; perm?: Permission };
const REPORTS_PAGE: AppSettingsPage = { href: "/admin/email-reports", label: "รายงานและแจ้งเตือนอัตโนมัติ", icon: "🔔", perm: "admin.email_reports" };
export const APP_SETTINGS_PAGES: Record<string, AppSettingsPage[]> = {
  tasks: [{ href: "/tasks/settings", label: "ตั้งค่างาน" }, REPORTS_PAGE],
  design: [REPORTS_PAGE],
  payroll: [{ href: "/payroll/settings", label: "ตั้งค่าเงินเดือน" }],
};

const same = (a: MenuAudience | null, b: MenuAudience | null) => JSON.stringify(a) === JSON.stringify(b);

export function AppSettingsPanel({ appKey, appLabel, appId, moreLabel, defaultHref, items, onSaved }: {
  appKey: string; appLabel: string;
  /** erp_app_groups.id / menu_more_label / default_href — ใช้ในแท็บจัดเรียง/ซ่อนเมนู */
  appId?: string | null; moreLabel?: string | null; defaultHref?: string | null;
  /** เมนูทั้งหมดของแอปนี้ (ไม่กรองตามคนดู) เรียงตามลำดับของแอป */
  items: AppSettingsMenuItem[];
  /** บันทึกแล้ว — ให้แถบเมนูโหลดใหม่ */
  onSaved: () => void;
}) {
  const { can } = useAuth();
  const pages = (APP_SETTINGS_PAGES[appKey] ?? []).filter((p) => !p.perm || can(p.perm));
  const [tab, setTab] = useState<"who" | "layout" | string>("who");   // "who" / "layout" หรือ href ของหน้าที่ฝัง
  const page = pages.find((p) => p.href === tab) ?? null;
  const tabCls = (on: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${on ? "border-violet-600 font-medium text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"}`;
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 pt-3">
        <h1 className="text-lg font-semibold text-slate-800">⚙️ ตั้งค่า {appLabel}</h1>
        <div className="mt-2 flex flex-wrap items-end gap-1">
          <button type="button" onClick={() => setTab("who")} className={tabCls(tab === "who")}>👁 ใครเห็นเมนูไหน</button>
          <button type="button" onClick={() => setTab("layout")} className={tabCls(tab === "layout")}>↕️ จัดเรียง / ซ่อนเมนู</button>
          {pages.map((p) => (
            <button key={p.href} type="button" onClick={() => setTab(p.href)} className={tabCls(tab === p.href)}>{p.icon ?? "🔧"} {p.label}</button>
          ))}
          <div className="ml-auto flex items-center gap-3 pb-2 text-xs">
            <a href={`/admin/menu`} target="_blank" rel="noopener" className="text-blue-600 hover:underline">จัดการเมนู/ไอคอน/ลำดับ ↗</a>
            <a href="/admin/role-board" target="_blank" rel="noopener" className="text-blue-600 hover:underline">สิทธิ์ตามตำแหน่ง ↗</a>
          </div>
        </div>
      </div>
      {page
        ? <iframe key={page.href} src={`${page.href}?embed=1`} title={page.label} className="flex-1 w-full border-0 bg-white" />
        : tab === "layout"
          ? <MenuLayoutTab appKey={appKey} appId={appId} moreLabel={moreLabel} defaultHref={defaultHref} items={items} onSaved={onSaved} />
          : <WhoSeesWhat items={items} onSaved={onSaved} />}
    </div>
  );
}

function WhoSeesWhat({ items, onSaved }: { items: AppSettingsMenuItem[]; onSaved: () => void }) {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [rolesErr, setRolesErr] = useState<string | null>(null);
  const orig = useMemo(() => Object.fromEntries(items.map((it) => [it.id, cleanAudience(it.audience)])), [items]);
  const [draft, setDraft] = useState<Record<string, MenuAudience | null>>(orig);
  useEffect(() => setDraft(orig), [orig]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [personFor, setPersonFor] = useState<AppSettingsMenuItem | null>(null);
  const [preview, setPreview] = useState<string>("");   // ดูแทนตำแหน่ง
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/roles").then((r) => r.json()).then((j) => {
      if (j.error) { setRolesErr(j.error); return; }
      setRoles(((j.roles ?? []) as Role[]).filter((r) => r.active !== false && r.key !== "admin"));
    }).catch(() => setRolesErr("โหลดรายชื่อตำแหน่งไม่สำเร็จ"));
  }, []);
  // ชื่อคนที่ตั้งไว้รายคน (ดึงเฉพาะ id ที่ใช้)
  useEffect(() => {
    const ids = [...new Set(Object.values(orig).flatMap((a) => [...(a?.users ?? []), ...(a?.hide_users ?? [])]))].filter((id) => !names[id]);
    if (!ids.length) return;
    apiFetch(`/api/creative-users?ids=${encodeURIComponent(ids.join(","))}`).then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {};
      for (const u of (j.data ?? []) as { id: string; name: string }[]) m[u.id] = u.name;
      setNames((p) => ({ ...p, ...m }));
    }).catch(() => { /* ไม่มีชื่อก็ยังตั้งได้ */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orig]);

  const roleLabel = (k: string) => roles?.find((r) => r.key === k)?.label ?? k;
  const changed = items.filter((it) => !same(cleanAudience(draft[it.id]), orig[it.id]));
  const setAud = (id: string, a: MenuAudience | null) => setDraft((d) => ({ ...d, [id]: cleanAudience(a) }));
  const toggleRole = (it: AppSettingsMenuItem, role: string) => {
    const a = draft[it.id] ?? {};
    const rs = a.roles ?? [];
    setAud(it.id, { ...a, roles: rs.includes(role) ? rs.filter((x) => x !== role) : [...rs, role] });
  };
  const setEveryone = (it: AppSettingsMenuItem) => { const a = draft[it.id]; setAud(it.id, a?.hide_users?.length ? { hide_users: a.hide_users } : null); };

  const save = async () => {
    if (!changed.length || saving) return;
    setSaving(true);
    let ok = 0; const errs: string[] = [];
    for (const it of changed) {
      try {
        const r = await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, patch: { audience: cleanAudience(draft[it.id]) } }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
        ok++;
      } catch (e) { errs.push(`${it.label}: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"}`); }
    }
    setSaving(false);
    if (errs.length) toast.error(errs.slice(0, 3).join(" · "));
    if (ok) { toast.success(`บันทึกแล้ว ${ok} เมนู — คนที่เปิดแอปอยู่จะเห็นเมื่อรีเฟรช`); onSaved(); }
  };

  const ids = new Set(items.map((i) => i.id));
  const ordered = items.filter((i) => !i.parent_id || !ids.has(i.parent_id)).flatMap((p) => [p, ...items.filter((k) => k.parent_id === p.id)]);
  const cols = roles ?? [];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-3 p-4 pb-24">
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-slate-600">
          ติ๊กตำแหน่งที่ให้เห็นแต่ละเมนู — <b>ไม่ติ๊กเลย = ทุกคนเห็น</b> · 👤 รายคน = ให้บางคนเห็นเพิ่ม หรือซ่อนจากบางคน · แอดมินเห็นทุกเมนูเสมอ
          <br />เป็นการซ่อน/โชว์ในเมนูเท่านั้น — ถ้าต้องกันไม่ให้เข้าหน้านั้นจริง ตั้งที่ “สิทธิ์ตามตำแหน่ง”
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">👀 ดูแทนตำแหน่ง:</span>
          <select value={preview} onChange={(e) => setPreview(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            <option value="">— ไม่ดูแทน —</option>
            {cols.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          {preview && <span className="text-xs text-slate-500">เห็น {ordered.filter((it) => menuVisibleTo(draft[it.id], { id: "__preview", role: preview })).length}/{ordered.length} เมนู (ยังไม่นับสิทธิ์ตำแหน่ง)</span>}
        </div>
        {rolesErr && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{rolesErr}</div>}
        {!roles && !rolesErr ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">เมนู</th>
                  <th className="px-2 py-2 font-medium">ทุกคน</th>
                  {cols.map((r) => <th key={r.key} className="px-2 py-2 font-medium whitespace-nowrap">{r.label}</th>)}
                  <th className="px-2 py-2 font-medium">รายคน</th>
                  <th className="px-3 py-2 text-left font-medium">สรุป</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((it) => {
                  const a = draft[it.id] ?? null;
                  const everyone = !a?.roles?.length && !a?.users?.length;
                  const dirty = !same(cleanAudience(a), orig[it.id]);
                  const hiddenInPreview = !!preview && !menuVisibleTo(a, { id: "__preview", role: preview });
                  const personN = (a?.users?.length ?? 0) + (a?.hide_users?.length ?? 0);
                  return (
                    <tr key={it.id} className={`border-t border-slate-100 ${dirty ? "bg-amber-50/60" : ""} ${hiddenInPreview ? "opacity-40" : ""}`}>
                      <td className={`px-3 py-2 ${it.parent_id && ids.has(it.parent_id) ? "pl-8" : ""}`}>
                        <span className="mr-1.5">{it.icon ?? "•"}</span><span className="font-medium text-slate-800">{it.label}</span>
                        {hiddenInPreview && <span className="ml-1.5 rounded bg-slate-200 px-1 text-[10px] text-slate-600">ไม่เห็น</span>}
                        {it.permission_key && <div className="text-[10px] text-slate-400">ต้องมีสิทธิ์ {it.permission_key} ด้วย</div>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={everyone} onChange={() => setEveryone(it)} title="ทุกคนเห็น (ล้างตำแหน่ง/คนที่เลือก)" className="h-4 w-4 accent-violet-600" />
                      </td>
                      {cols.map((r) => (
                        <td key={r.key} className="px-2 py-2 text-center">
                          <input type="checkbox" checked={!!a?.roles?.includes(r.key)} onChange={() => toggleRole(it, r.key)} title={`${r.label} เห็นเมนูนี้`} className="h-4 w-4 accent-violet-600" />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center">
                        <button type="button" onClick={() => setPersonFor(it)} className={`rounded-lg border px-2 py-1 text-xs ${personN ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>👤 {personN || "+"}</button>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{describeAudience(a, roleLabel)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* แถบบันทึก (โหมดร่าง) */}
      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}>
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <span className="flex-1 text-sm text-slate-700">แก้ไขแล้ว {changed.length} เมนู (ยังไม่บันทึก)</span>
            <button type="button" onClick={() => setDraft(orig)} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
          </div>
        </div>
      )}

      {personFor && (
        <PersonModal item={personFor} audience={draft[personFor.id] ?? null} names={names}
          onClose={() => setPersonFor(null)}
          onApply={(a, nm) => { setNames((p) => ({ ...p, ...nm })); setAud(personFor.id, a); setPersonFor(null); }} />
      )}
    </div>
  );
}

function PersonModal({ item, audience, names, onClose, onApply }: {
  item: AppSettingsMenuItem; audience: MenuAudience | null; names: Record<string, string>;
  onClose: () => void; onApply: (a: MenuAudience | null, names: Record<string, string>) => void;
}) {
  const toVals = (ids?: string[]) => (ids ?? []).map((id) => ({ id, code: null, name: names[id] ?? "(ผู้ใช้ที่ปิดบัญชีแล้ว)" } as UserPickerValue));
  const [allow, setAllow] = useState<UserPickerValue[]>(() => toVals(audience?.users));
  const [hide, setHide] = useState<UserPickerValue[]>(() => toVals(audience?.hide_users));
  const apply = () => {
    const nm = Object.fromEntries([...allow, ...hide].map((u) => [u.id, u.name]));
    onApply({ ...(audience ?? {}), users: allow.map((u) => u.id), hide_users: hide.map((u) => u.id).filter((id) => !allow.some((u) => u.id === id)) }, nm);
  };
  return (
    <ERPModal open onClose={onClose} title={`👤 รายคน — ${item.icon ?? ""} ${item.label}`} size="md"
      description="ให้บางคนเห็นเพิ่ม (นอกจากตำแหน่งที่ติ๊ก) หรือซ่อนจากบางคน (ชนะทุกข้อ ยกเว้นแอดมิน)"
      footer={<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={apply} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">ตกลง</button>
      </>}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">✅ ให้เห็นเพิ่ม</p>
          <MultiUserPicker value={allow} onChange={setAllow} disableCreate />
          {!audience?.roles?.length && allow.length > 0 && <p className="mt-1 text-[11px] text-amber-700">ยังไม่ได้ติ๊กตำแหน่ง → เมนูนี้จะเห็นเฉพาะคนในรายชื่อนี้</p>}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">🚫 ซ่อนจาก</p>
          <MultiUserPicker value={hide} onChange={setHide} disableCreate />
        </div>
      </div>
    </ERPModal>
  );
}
