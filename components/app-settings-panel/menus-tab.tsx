"use client";
/**
 * เมนูและคนเห็น — แท็บหลักใน ⚙️ ตั้งค่าแอปเดี่ยว (เจ้าของขอ 2026-11-12: "หน้าจัดการแอป ตั้งค่าใครเห็นอะไร" · รอบ 1)
 *   รวมงานที่เคยแยกหลายแท็บไว้ในรายการเดียว:
 *     ลาก ⠿ เรียงเมนู · ที่อยู่ (บนแถบ / ในปุ่ม "เพิ่มเติม" / ซ่อน) · "ใครเห็น" (ทุกคน / ตำแหน่ง / รายคน / ซ่อนจากบางคน)
 *   + แผง "ดูแบบคนนี้": เลือกตำแหน่งหรือพนักงาน → แถบเมนูหน้าตาแบบที่เขาเห็นจริง + เมนูที่ไม่เห็น เพราะอะไร (กฎ lib/menu-visibility)
 *     ไม่มีสิทธิ์ของเมนู → ปุ่มให้สิทธิ์ (ถามก่อน · มีผลทันที · มีประวัติ) · ซ่อนแต่ยังมีสิทธิ์ → เตือน "ยังเข้าได้ถ้ามีลิงก์"
 *   บันทึกแบบร่าง → 💾 ทีเดียว · ที่เก็บเดิมทั้งหมด (ไม่มีตารางใหม่):
 *     ลำดับ/ที่อยู่ = PATCH /api/menu {app_override} (lib/app-menu-layout) · ใครเห็น = PATCH /api/menu {patch.audience} (./audience-save)
 *     ให้สิทธิ์รายคน = POST /api/admin/user-permissions · ให้สิทธิ์ทั้งตำแหน่ง = PATCH /api/admin/roles {kind:"toggle"} (ต้อง admin.roles)
 *   เพิ่ม/ลบเมนู ยังทำที่ /admin/menu (รอบ 2 จะย้ายมาหน้านี้)
 */
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { cleanAudience, describeAudience, type MenuAudience } from "@/lib/menu-audience";
import { DEFAULT_MORE_LABEL, effectiveSort, menuPlace, planLayoutSave, type AppMenuPlace } from "@/lib/app-menu-layout";
import { previewMenusFor, hiddenReasonText, type MenuViewer } from "@/lib/menu-visibility";
import type { UserPickerValue } from "@/components/pickers";
import { MultiUserPicker } from "@/app/tasks/multi-user-picker";
import type { AdminUser } from "@/app/api/admin/users/route";
import type { AppSettingsMenuItem } from "./index";
import { saveMenuAudiences, sameAudience } from "./audience-save";

type Role = { key: string; label: string; active?: boolean };
type Person = { id: string; name: string; role: string };
type PermDef = { key: string; label: string; is_dangerous?: boolean };
type Grant =
  | { kind: "user"; userId: string; name: string; perm: string; menu: string }
  | { kind: "roles"; roles: string[]; perm: string; menu: string };

const pill = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap";

export function MenusAudienceTab({ appKey, appId, moreLabel, defaultHref, items, onSaved }: {
  appKey: string;
  appId?: string | null;
  moreLabel?: string | null;
  defaultHref?: string | null;
  /** เมนูทั้งหมดของแอปนี้ (ไม่กรองตามคนดู) */
  items: AppSettingsMenuItem[];
  onSaved: () => void;
}) {
  void appId;
  const toast = useToast();
  const { can } = useAuth();
  const canRoles = can("admin.roles");
  const shownMore = (moreLabel ?? "").trim() || DEFAULT_MORE_LABEL;

  // ── ข้อมูลประกอบ: ตำแหน่ง + สิทธิ์ของแต่ละตำแหน่ง · พนักงาน · ชื่อแอป ──
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());   // "role|perm"
  const [permDefs, setPermDefs] = useState<Map<string, PermDef>>(new Map());
  const [people, setPeople] = useState<Person[] | null>(null);
  const [appLabels, setAppLabels] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiFetch("/api/admin/roles").then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error);
      setRoles(((j.roles ?? []) as Role[]).filter((r) => r.active !== false));
      setRolePerms(new Set(((j.matrix ?? []) as { role_key: string; permission_key: string }[]).map((m) => `${m.role_key}|${m.permission_key}`)));
      setPermDefs(new Map(((j.permissions ?? []) as PermDef[]).map((p) => [p.key, p])));
    }).catch((e) => setErr(e instanceof Error ? e.message : "โหลดรายชื่อตำแหน่งไม่สำเร็จ"));
    apiFetch("/api/admin/users").then((r) => r.json()).then((u) => {
      if (u.error) throw new Error(u.error);
      setPeople(((u.data ?? []) as AdminUser[]).filter((x) => x.active)
        .map((x) => ({ id: x.id, name: (x.display_name || x.username || x.email || "").trim() || "(ไม่มีชื่อ)", role: x.role }))
        .sort((a, b) => a.name.localeCompare(b.name, "th")));
    }).catch(() => setPeople([]));
    apiFetch("/api/menu/apps").then((r) => r.json()).then((j) => {
      setAppLabels(Object.fromEntries(((j.data ?? []) as { key: string; label: string }[]).map((a) => [a.key, a.label])));
    }).catch(() => { /* ไม่มีชื่อแอป = โชว์ key */ });
  }, []);
  const roleLabel = (k: string) => roles?.find((r) => r.key === k)?.label ?? (k === "admin" ? "แอดมิน" : k);
  const permName = (k: string) => permDefs.get(k)?.label ?? k;
  const editRoles = (roles ?? []).filter((r) => r.key !== "admin");
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? "(ผู้ใช้ที่ปิดบัญชีแล้ว)";

  // ── ร่าง: ลำดับ / ที่อยู่ / ใครเห็น ──
  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const top = useMemo(() => items.filter((i) => !i.parent_id || !ids.has(i.parent_id)).sort((a, b) => effectiveSort(a, appKey) - effectiveSort(b, appKey)), [items, ids, appKey]);
  const origOrder = useMemo(() => top.map((i) => i.id), [top]);
  const origPlaces = useMemo(() => Object.fromEntries(top.map((i) => [i.id, menuPlace(i, appKey)])) as Record<string, AppMenuPlace>, [top, appKey]);
  const origAud = useMemo(() => Object.fromEntries(items.map((it) => [it.id, cleanAudience(it.audience)])) as Record<string, MenuAudience | null>, [items]);
  const [order, setOrder] = useState(origOrder);
  const [places, setPlaces] = useState(origPlaces);
  const [aud, setAudState] = useState(origAud);
  const reset = () => { setOrder(origOrder); setPlaces(origPlaces); setAudState(origAud); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [origOrder, origPlaces, origAud]);
  const setAud = (id: string, a: MenuAudience | null) => setAudState((d) => ({ ...d, [id]: cleanAudience(a) }));

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const rows = order.map((id) => byId.get(id)).filter((x): x is AppSettingsMenuItem => !!x);
  const kidsOf = (id: string) => items.filter((k) => k.parent_id === id);
  const placeOf = (id: string): AppMenuPlace => places[id] ?? "bar";
  const audDirty = (id: string) => !sameAudience(cleanAudience(aud[id]), origAud[id] ?? null);
  const layoutDirty = order.join() !== origOrder.join() || order.some((id) => placeOf(id) !== (origPlaces[id] ?? "bar"));
  const changedIds = new Set<string>([
    ...items.filter((it) => audDirty(it.id)).map((it) => it.id),
    ...order.filter((id, i) => placeOf(id) !== (origPlaces[id] ?? "bar") || origOrder[i] !== id),
  ]);
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setOrder((o) => moveItem(o, from, to)));

  // ── ดูแบบคนนี้ ──
  const [viewerKey, setViewerKey] = useState("");
  useEffect(() => {
    if (viewerKey || !roles) return;
    const first = roles.find((r) => r.key === "staff") ?? roles.find((r) => r.key !== "admin");
    if (first) setViewerKey(`role:${first.key}`);
  }, [roles, viewerKey]);
  const [userPerms, setUserPerms] = useState<Record<string, Set<string>>>({});
  const viewerUser = viewerKey.startsWith("user:") ? people?.find((p) => p.id === viewerKey.slice(5)) ?? null : null;
  useEffect(() => {
    const uid = viewerUser?.id;
    if (!uid || userPerms[uid]) return;
    let alive = true;
    apiFetch(`/api/admin/user-permissions?user_id=${encodeURIComponent(uid)}`).then((r) => r.json()).then((j) => {
      if (!alive || j.error) return;
      const set = new Set<string>((j.role_perms ?? []) as string[]);
      for (const o of (j.overrides ?? []) as { permission_key: string; mode: string }[]) {
        if (o.mode === "grant") set.add(o.permission_key); else set.delete(o.permission_key);
      }
      setUserPerms((m) => ({ ...m, [uid]: set }));
    }).catch(() => { /* ไม่รู้สิทธิ์ = ข้ามชั้นสิทธิ์ */ });
    return () => { alive = false; };
  }, [viewerUser?.id, userPerms]);
  const viewer: MenuViewer | null = useMemo(() => {
    if (viewerKey.startsWith("role:")) {
      const role = viewerKey.slice(5);
      const perms = new Set([...rolePerms].filter((x) => x.startsWith(`${role}|`)).map((x) => x.slice(role.length + 1)));
      return { id: null, role, perms: roles ? perms : null };
    }
    if (viewerUser) return { id: viewerUser.id, role: viewerUser.role, perms: userPerms[viewerUser.id] ?? null };
    return null;
  }, [viewerKey, viewerUser, rolePerms, roles, userPerms]);
  const placeForPreview = (it: AppSettingsMenuItem): AppMenuPlace => (it.id in places ? placeOf(it.id) : menuPlace(it, appKey));
  const preview = viewer ? previewMenusFor(items, rows, appKey, viewer, { audienceOf: (it) => aud[it.id], placeOf: placeForPreview }) : null;
  const [showMore, setShowMore] = useState(false);

  // ── ให้สิทธิ์ (มีผลทันที ไม่ใช่ร่าง) ──
  const [grant, setGrant] = useState<Grant | null>(null);
  const [granting, setGranting] = useState(false);
  const doGrant = async () => {
    if (!grant || granting) return;
    setGranting(true);
    try {
      if (grant.kind === "user") {
        const r = await apiFetch("/api/admin/user-permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: grant.userId, permission_key: grant.perm, mode: "grant" }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || "ให้สิทธิ์ไม่สำเร็จ");
        setUserPerms((m) => (m[grant.userId] ? { ...m, [grant.userId]: new Set([...m[grant.userId], grant.perm]) } : m));
        toast.success(`ให้สิทธิ์ “${permName(grant.perm)}” แก่ ${grant.name} แล้ว`);
      } else {
        const done: string[] = [];
        for (const role of grant.roles) {
          const r = await apiFetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "toggle", role_key: role, permission_key: grant.perm, granted: true }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.error) throw new Error(`${roleLabel(role)}: ${j.error || "ให้สิทธิ์ไม่สำเร็จ"}`);
          done.push(role);
          setRolePerms((s) => new Set([...s, `${role}|${grant.perm}`]));
        }
        // คนที่โหลดสิทธิ์ไว้แล้ว → โหลดใหม่ตอนดูอีกครั้ง
        setUserPerms({});
        toast.success(`ให้สิทธิ์ “${permName(grant.perm)}” แก่ ${done.map(roleLabel).join(", ")} แล้ว`);
      }
      setGrant(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ให้สิทธิ์ไม่สำเร็จ"); }
    finally { setGranting(false); }
  };

  // ── บันทึก ──
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!changedIds.size || saving) return;
    setSaving(true);
    let ok = 0; const errs: string[] = [];
    if (layoutDirty) {
      for (const p of planLayoutSave(top, appKey, order, places)) {
        try {
          const r = await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, app_override: { app_key: appKey, set: p.set } }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
          ok++;
        } catch (e) { errs.push(`${byId.get(p.id)?.label ?? "เมนู"}: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"}`); }
      }
    }
    const changedAud = items.filter((it) => audDirty(it.id));
    if (changedAud.length) {
      const r = await saveMenuAudiences(changedAud, aud);
      ok += r.ok; errs.push(...r.errs);
    }
    setSaving(false);
    if (errs.length) toast.error(errs.slice(0, 3).join(" · "));
    if (ok) { toast.success(`บันทึกแล้ว ${changedIds.size} เมนู — คนที่เปิดแอปอยู่จะเห็นเมื่อรีเฟรช`); onSaved(); }
  };

  const [openWho, setOpenWho] = useState<string | null>(null);
  const whoEditor = (it: AppSettingsMenuItem) => (
    <WhoEditor key={it.id} item={it} a={aud[it.id] ?? null} setAud={setAud} roles={roles} editRoles={editRoles} rolePerms={rolePerms}
      permName={permName} nameOf={nameOf} canRoles={canRoles} onGrant={setGrant} onClose={() => setOpenWho(null)} />
  );
  const homeHidden = rows.some((r) => placeOf(r.id) === "hidden" && defaultHref && r.href === defaultHref);

  const menuRow = (it: AppSettingsMenuItem, opts: { child?: boolean; index?: number }) => {
    const a = aud[it.id] ?? null;
    const restricted = !!(a?.roles?.length || a?.users?.length || a?.hide_users?.length);
    const p = opts.child ? null : placeOf(it.id);
    const dirty = changedIds.has(it.id);
    const otherApps = (it.app_keys ?? []).filter((k) => k !== appKey);
    const kids = opts.child ? 0 : kidsOf(it.id).length;
    return (
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${opts.child ? "pl-10 bg-slate-50/60" : ""} ${dirty ? "bg-amber-50/70" : ""}`}>
        {opts.index != null ? <DragHandle {...handleProps(opts.index)} className="text-lg" /> : <span className="w-4 text-center text-slate-300">↳</span>}
        <span className="w-6 text-center"><Icon value={it.icon ?? "•"} /></span>
        <div className="min-w-[9rem] flex-1">
          <div className={`truncate text-sm ${p === "hidden" ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}>{it.label}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {defaultHref && it.href === defaultHref && <span className={`${pill} bg-blue-50 text-blue-700`}><Icon name="home" /> หน้าแรก</span>}
            {kids > 0 && <span className={`${pill} bg-slate-100 text-slate-500`}>▾ เมนูย่อย {kids}</span>}
            {otherApps.length > 0 && <span className={`${pill} bg-slate-100 text-slate-500`} title={`ใช้ร่วมกับ: ${otherApps.map((k) => appLabels[k] ?? k).join(", ")} — "ใครเห็น" ใช้ค่าเดียวกันทุกแอป`}><Icon name="link" /> อยู่อีก {otherApps.length} แอป</span>}
            {it.permission_key && <span className={`${pill} bg-slate-100 text-slate-500`} title="ต้องมีสิทธิ์นี้ถึงเห็นและเข้าหน้าได้"><Icon name="permission" /> {permName(it.permission_key)}</span>}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => setOpenWho((o) => (o === it.id ? null : it.id))} title="ตั้งว่าใครเห็นเมนูนี้"
          className={`inline-flex h-8 max-w-[13rem] items-center gap-1.5 rounded-full border px-3 text-xs ${openWho === it.id ? "border-violet-400 bg-violet-100 text-violet-800" : restricted ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
          <Icon name="users" /><span className="truncate">{describeAudience(a, roleLabel)}</span>
        </button>
        {p && (
          <select value={p} onChange={(e) => setPlaces((s) => ({ ...s, [it.id]: e.target.value as AppMenuPlace }))} aria-label={`ที่อยู่ของ ${it.label}`}
            className={`h-8 rounded-lg border px-2 text-xs ${p === "hidden" ? "border-red-200 bg-red-50 text-red-700" : p === "more" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700"}`}>
            <option value="bar">บนแถบ</option>
            <option value="more">ใน “{shownMore}”</option>
            <option value="hidden">ซ่อน</option>
          </select>
        )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-3 p-4 pb-24">
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-slate-600">
          จัดเมนูของแอปนี้ในที่เดียว: ลาก ⠿ เรียง · เลือก <b>บนแถบ / ใน “{shownMore}” / ซ่อน</b> · กดปุ่ม <b>ใครเห็น</b> เพื่อเลือกตำแหน่งหรือรายคน · ดูผลด้านล่างแบบที่แต่ละคนเห็นก่อนกดบันทึก
          <br />ซ่อนเมนู ≠ ห้ามเข้า — คนที่มีสิทธิ์ยังเปิดหน้านั้นได้ถ้ารู้ลิงก์ (กันจริงที่แท็บ “สิทธิ์ตามเมนู”) · เพิ่ม/ลบเมนู ตอนนี้ทำที่ <a href="/admin/menu" target="_blank" rel="noopener" className="text-blue-600 hover:underline">จัดการเมนู ↗</a>
        </div>
        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        {/* ── ดูแบบคนนี้ ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-800"><Icon name="view" /> ดูแบบคนนี้</span>
            <select value={viewerKey} onChange={(e) => { setViewerKey(e.target.value); setShowMore(false); }} aria-label="เลือกตำแหน่งหรือพนักงานที่จะดูแทน"
              className="h-8 min-w-[13rem] rounded-lg border border-slate-200 bg-white px-2 text-sm">
              {!roles && <option value="">กำลังโหลด…</option>}
              {editRoles.length > 0 && <optgroup label="ทั้งตำแหน่ง">{editRoles.map((r) => <option key={r.key} value={`role:${r.key}`}>{r.label}</option>)}</optgroup>}
              {!!people?.length && <optgroup label="พนักงาน">{people.map((p) => <option key={p.id} value={`user:${p.id}`}>{p.name} · {roleLabel(p.role)}</option>)}</optgroup>}
            </select>
            {preview && <span className="text-xs text-slate-500">เห็น {preview.shown}/{preview.total} เมนู</span>}
            {viewer && !viewer.perms && <span className="text-xs text-slate-400">กำลังโหลดสิทธิ์… (ยังไม่นับสิทธิ์)</span>}
          </div>
          {viewer?.role === "admin" && <div className="mb-2 text-xs text-slate-500">แอดมินเห็นทุกเมนู ยกเว้นเมนูที่ซ่อนไว้ในแอปนี้</div>}
          {!roles && !err ? <div className="h-10 animate-pulse rounded-lg bg-slate-100" /> : preview && (
            <>
              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-800 px-2.5 py-2 text-sm text-white/85">
                {preview.bar.map((r) => (
                  <span key={r.id} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 whitespace-nowrap">
                    <Icon value={r.icon ?? "•"} />{r.label}{preview.kidsShown[r.id] ? <span className="text-[11px] text-white/60">▾{preview.kidsShown[r.id]}</span> : null}
                  </span>
                ))}
                {preview.more.length > 0 && (
                  <button type="button" onClick={() => setShowMore((v) => !v)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/15 px-2 whitespace-nowrap hover:bg-white/25">
                    ⋯ {shownMore} ▾ <span className="text-[11px] text-white/60">({preview.more.length})</span>
                  </button>
                )}
                {!preview.bar.length && !preview.more.length && <span className="px-2 text-xs text-white/60">ไม่เห็นเมนูเลย</span>}
              </div>
              {showMore && preview.more.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-2 text-xs">
                  {preview.more.map((r) => <span key={r.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700"><Icon value={r.icon ?? "•"} /> {r.label}</span>)}
                </div>
              )}
              {preview.hidden.length > 0 ? (
                <div className="mt-2">
                  <div className="mb-1 text-xs text-slate-500">ไม่เห็น {preview.hidden.length} เมนู เพราะ:</div>
                  <div className="space-y-1">
                    {preview.hidden.map(({ item: h, vis }) => {
                      const canGrant = vis.reason === "no_perm" && vis.missingPerm && (viewerUser || (viewer?.id == null && canRoles));
                      return (
                        <div key={h.id} className={`flex flex-wrap items-center gap-1.5 text-sm ${h.parent_id && ids.has(h.parent_id) ? "pl-5" : ""}`}>
                          <span className="text-slate-400"><Icon value={h.icon ?? "•"} /></span>
                          <span className="text-slate-500">{h.label}</span>
                          <span className={`${pill} ${vis.reason === "no_perm" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{hiddenReasonText(vis, permName)}</span>
                          {vis.reachableByLink && viewer?.perms && <span className={`${pill} bg-amber-50 text-amber-700`} title="ซ่อนเมนูแล้ว แต่ยังมีสิทธิ์ — ถ้ารู้ลิงก์ก็เปิดหน้านี้ได้"><Icon name="warning" /> ยังเข้าได้ถ้ามีลิงก์</span>}
                          {canGrant && (
                            <button type="button" className="h-6 rounded-full border border-violet-200 bg-violet-50 px-2 text-[11px] text-violet-700 hover:bg-violet-100"
                              onClick={() => setGrant(viewerUser
                                ? { kind: "user", userId: viewerUser.id, name: viewerUser.name, perm: vis.missingPerm!, menu: h.label }
                                : { kind: "roles", roles: [viewer!.role!], perm: vis.missingPerm!, menu: h.label })}>
                              {viewerUser ? "ให้สิทธิ์คนนี้" : "ให้สิทธิ์ตำแหน่งนี้"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : <div className="mt-2 text-xs text-slate-500">เห็นครบทุกเมนู</div>}
            </>
          )}
        </section>

        {homeHidden && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="warning" /> ซ่อนเมนูที่เป็น “หน้าแรกของแอป” อยู่ — เปิดแอปแล้วจะไปเมนูแรกที่เห็นแทน</div>}

        {/* ── รายการเมนู ── */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="flex-1">เมนูของแอปนี้ ({items.length})</span><span>ใครเห็น · ที่อยู่</span>
          </div>
          {rows.map((it, i) => (
            <div key={it.id} {...rowProps(i)} className={`border-t border-slate-100 first:border-t-0 ${rowCls(i)}`}>
              {menuRow(it, { index: i })}
              {openWho === it.id && whoEditor(it)}
              {kidsOf(it.id).map((k) => (
                <div key={k.id} className="border-t border-slate-100">
                  {menuRow(k, { child: true })}
                  {openWho === k.id && whoEditor(k)}
                </div>
              ))}
            </div>
          ))}
          {!rows.length && <div className="p-6 text-center text-sm text-slate-400">แอปนี้ยังไม่มีเมนู — เพิ่มได้ที่ <a href="/admin/menu" target="_blank" rel="noopener" className="text-blue-600 hover:underline">จัดการเมนู ↗</a></div>}
        </section>
      </div>

      {/* แถบบันทึก (โหมดร่าง) */}
      {changedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}>
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <span className="flex-1 text-sm text-slate-700">แก้ไขแล้ว {changedIds.size} เมนู (ยังไม่บันทึก) — มีผลกับทุกคนในแอปนี้</span>
            <button type="button" onClick={reset} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : <><Icon name="save" /> บันทึก</>}
            </button>
          </div>
        </div>
      )}

      {grant && (
        <ConfirmDialog open onClose={() => !granting && setGrant(null)} onConfirm={() => void doGrant()} loading={granting}
          variant={permDefs.get(grant.perm)?.is_dangerous ? "danger" : "default"}
          title={grant.kind === "user" ? `ให้สิทธิ์ ${grant.name}` : `ให้สิทธิ์ตำแหน่ง ${grant.roles.map(roleLabel).join(", ")}`}
          confirmText="ให้สิทธิ์"
          message={<div className="space-y-2 text-sm">
            <p>เมนู <b>“{grant.menu}”</b> ต้องมีสิทธิ์ <b>“{permName(grant.perm)}”</b> — ยังไม่มีสิทธิ์ก็จะไม่เห็นเมนูนี้</p>
            <p>กดยืนยัน = ให้สิทธิ์นี้แก่ <b>{grant.kind === "user" ? `${grant.name} คนเดียว` : `ทุกคนในตำแหน่ง ${grant.roles.map(roleLabel).join(", ")}`}</b> · มีผลทันที (ไม่ต้องกดบันทึก) · มีบันทึกประวัติ</p>
            {permDefs.get(grant.perm)?.is_dangerous && <p className="text-rose-700">สิทธิ์นี้เป็นสิทธิ์สำคัญ — ตรวจให้แน่ใจก่อนให้</p>}
          </div>} />
      )}
    </div>
  );

}

/** ตัวตั้ง "ใครเห็น" ของเมนูหนึ่ง (กางใต้แถว) — แยกเป็น component ระดับไฟล์ กันกล่องรีเซ็ตทุกครั้งที่ร่างเปลี่ยน */
function WhoEditor({ item, a, setAud, roles, editRoles, rolePerms, permName, nameOf, canRoles, onGrant, onClose }: {
  item: AppSettingsMenuItem;
  a: MenuAudience | null;
  setAud: (id: string, a: MenuAudience | null) => void;
  roles: Role[] | null;
  editRoles: Role[];
  rolePerms: Set<string>;
  permName: (k: string) => string;
  nameOf: (id: string) => string;
  canRoles: boolean;
  onGrant: (g: Grant) => void;
  onClose: () => void;
}) {
    const restricted = !!(a?.roles?.length || a?.users?.length);
    const [mode, setMode] = useState<"all" | "some">(restricted ? "some" : "all");
    const toVals = (list?: string[]) => (list ?? []).map((id) => ({ id, code: null, name: nameOf(id) } as UserPickerValue));
    const setPart = (patch: Partial<MenuAudience>) => setAud(item.id, { ...(a ?? {}), ...patch });
    const toggleRole = (k: string) => { const rs = a?.roles ?? []; setPart({ roles: rs.includes(k) ? rs.filter((x) => x !== k) : [...rs, k] }); };
    // ตำแหน่งที่ควรเห็น (ติ๊กไว้ หรือทุกตำแหน่งถ้า "ทุกคน") แต่ยังไม่มีสิทธิ์ของเมนู → ไม่เห็นอยู่ดี
    const target = restricted ? editRoles.filter((r) => a?.roles?.includes(r.key)) : mode === "all" ? editRoles : [];
    const lacking = item.permission_key ? target.filter((r) => !rolePerms.has(`${r.key}|${item.permission_key}`)) : [];
    const roleBtn = (on: boolean) => `h-7 rounded-full border px-3 text-xs ${on ? "border-violet-300 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;
    return (
      <div className={`mx-3 mb-3 space-y-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3 text-sm ${item.parent_id ? "ml-10" : "ml-12"}`}>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={mode === "all"} onChange={() => { setMode("all"); setAud(item.id, a?.hide_users?.length ? { hide_users: a.hide_users } : null); }} className="accent-violet-600" /> ทุกคน
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={mode === "some"} onChange={() => setMode("some")} className="accent-violet-600" /> เฉพาะบางตำแหน่ง / บางคน
          </label>
        </div>
        {mode === "some" && (
          <>
            <div>
              <div className="mb-1 text-xs text-slate-500">ตำแหน่งที่เห็น</div>
              <div className="flex flex-wrap gap-1.5">
                {editRoles.map((r) => <button key={r.key} type="button" onClick={() => toggleRole(r.key)} className={roleBtn(!!a?.roles?.includes(r.key))}>{r.label}</button>)}
                {!roles && <span className="text-xs text-slate-400">กำลังโหลด…</span>}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">ให้เห็นเพิ่มรายคน</div>
              <MultiUserPicker value={toVals(a?.users)} onChange={(v) => setPart({ users: v.map((u) => u.id), hide_users: (a?.hide_users ?? []).filter((id) => !v.some((u) => u.id === id)) })} disableCreate />
            </div>
            {!restricted && <p className="text-[11px] text-amber-700">ยังไม่ได้เลือกใคร = ทุกคนยังเห็นอยู่</p>}
            {!a?.roles?.length && !!a?.users?.length && <p className="text-[11px] text-slate-500">ไม่ได้เลือกตำแหน่ง → เห็นเฉพาะคนในรายชื่อนี้</p>}
          </>
        )}
        <div>
          <div className="mb-1 text-xs text-slate-500">ซ่อนจากบางคน (ชนะทุกข้อ ยกเว้นแอดมิน)</div>
          <MultiUserPicker value={toVals(a?.hide_users)} onChange={(v) => setPart({ hide_users: v.map((u) => u.id), users: (a?.users ?? []).filter((id) => !v.some((u) => u.id === id)) })} disableCreate />
        </div>
        {item.permission_key && (
          <div className="border-t border-violet-100 pt-2 text-xs text-slate-500">
            เมนูนี้ต้องมีสิทธิ์ “{permName(item.permission_key)}” ด้วย
            {lacking.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-amber-700">
                <span><Icon name="warning" /> {lacking.map((r) => r.label).join(", ")} ยังไม่มีสิทธิ์นี้ — เลือกให้เห็นแล้วก็ยังไม่ขึ้น</span>
                {canRoles
                  ? <button type="button" onClick={() => onGrant({ kind: "roles", roles: lacking.map((r) => r.key), perm: item.permission_key!, menu: item.label })} className="h-6 rounded-full border border-violet-200 bg-white px-2 text-[11px] text-violet-700 hover:bg-violet-50">ให้สิทธิ์ด้วย (ถามก่อน)</button>
                  : <span className="text-slate-500">ให้สิทธิ์ได้ที่แท็บ “สิทธิ์ตามเมนู”</span>}
              </div>
            )}
          </div>
        )}
        <div className="text-right">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">เสร็จ</button>
        </div>
      </div>
    );
}
