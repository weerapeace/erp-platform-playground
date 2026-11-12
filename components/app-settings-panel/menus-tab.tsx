"use client";
/**
 * เมนูและคนเห็น — แท็บหลักใน ⚙️ ตั้งค่าแอปเดี่ยว (เจ้าของขอ 2026-11-12: "หน้าจัดการแอป เพิ่มเมนู ลบเมนู ตั้งค่าใครเห็นอะไร")
 *   รอบ 1: รายการเมนูเดียว — ลาก ⠿ เรียง · ที่อยู่ (บนแถบ / ในปุ่ม "เพิ่มเติม" / ซ่อน) · "ใครเห็น" (ทุกคน / ตำแหน่ง / รายคน / ซ่อนจากบางคน)
 *          + แผง "ดูแบบคนนี้": ตำแหน่ง/พนักงาน → แถบเมนูแบบที่เขาเห็นจริง + เมนูที่ไม่เห็นเพราะอะไร (กฎ lib/menu-visibility) + ปุ่มให้สิทธิ์
 *   รอบ 2: ＋ เพิ่มเมนู — เลือกจากหน้าที่มีในระบบ (เติม app_keys ไม่สร้างแถวซ้ำ) หรือลิงก์ใหม่ (POST /api/menu · ลิงก์ซ้ำ = ใช้เมนูเดิมแทน)
 *          🗑 เอาออกแบบปลอดภัย (ไม่ลบแถว — กู้คืนได้เสมอ · กฎ lib/app-menu-membership):
 *            เอาออกจากแอปนี้ (ถอด app_keys) · ซ่อนไว้ในแอปนี้ (place hidden) · ปิดทั้งระบบ (is_active false)
 *            เมนูหน้าแรกของแอป → ต้องเลือกหน้าแรกใหม่ก่อน (erp_app_groups.default_href) · เมนูแม่ → เมนูย่อยออกตาม
 *          ส่วน "เอาออก / ปิดอยู่" ท้ายหน้า: เอากลับ (ร่าง) · เปิดกลับเมนูที่ปิดทั้งระบบ
 *   บันทึกแบบร่าง → 💾 ทีเดียว · ทุกการแก้ผ่าน API เดิมที่มีประวัติ (menu.create / menu.update / menu_app.update)
 *     ให้สิทธิ์ = มีผลทันที (POST /api/admin/user-permissions · PATCH /api/admin/roles toggle ต้อง admin.roles)
 *   ลบถาวรไม่มีในหน้านี้ · แก้ชื่อ/ไอคอน/หมวด ยังทำที่ /admin/menu
 */
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { IconPicker } from "@/components/icon-picker";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { cleanAudience, describeAudience, type MenuAudience } from "@/lib/menu-audience";
import { DEFAULT_MORE_LABEL, effectiveSort, menuPlace, planLayoutSave, type AppMenuPlace } from "@/lib/app-menu-layout";
import { previewMenusFor, hiddenReasonText, type MenuViewer } from "@/lib/menu-visibility";
import { addToAppPatch, removeFromAppPatch, otherAppsOf, checkNewMenuLink, type MenuRemoveMode } from "@/lib/app-menu-membership";
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
/** แถวเมนูเต็มจาก GET /api/menu?all=1 (รวมที่ปิดอยู่ / อยู่แอปอื่น) */
type FullMenu = AppSettingsMenuItem & { is_active?: boolean | null; show_in_sidebar?: boolean | null };

const pill = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap";
const NEW_PREFIX = "new:";
const isNewId = (id: string) => id.startsWith(NEW_PREFIX);
const jsonOf = async (r: Response) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ"); return j; };

export function MenusAudienceTab({ appKey, appId, moreLabel, defaultHref, items, onSaved }: {
  appKey: string;
  appId?: string | null;
  moreLabel?: string | null;
  defaultHref?: string | null;
  /** เมนูทั้งหมดของแอปนี้ (ไม่กรองตามคนดู) */
  items: AppSettingsMenuItem[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const canRoles = can("admin.roles");
  const shownMore = (moreLabel ?? "").trim() || DEFAULT_MORE_LABEL;

  // ── ข้อมูลประกอบ: ตำแหน่ง + สิทธิ์ของแต่ละตำแหน่ง · พนักงาน · ชื่อแอป · เมนูทั้งระบบ ──
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());   // "role|perm"
  const [permDefs, setPermDefs] = useState<Map<string, PermDef>>(new Map());
  const [people, setPeople] = useState<Person[] | null>(null);
  const [appLabels, setAppLabels] = useState<Record<string, string>>({});
  const [allMenus, setAllMenus] = useState<FullMenu[] | null>(null);
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
  // เมนูทั้งระบบ (ใช้ตอนเพิ่มเมนู / เปิดกลับ / ตรวจลิงก์ซ้ำ) — โหลดใหม่หลังบันทึก (items เปลี่ยน) · ข้ามแคช 30 วิ
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/menu?all=1&_=${Date.now()}`).then((r) => r.json()).then((j) => { if (alive && !j.error) setAllMenus((j.data ?? []) as FullMenu[]); })
      .catch(() => { if (alive) setAllMenus([]); });
    return () => { alive = false; };
  }, [items]);
  const roleLabel = (k: string) => roles?.find((r) => r.key === k)?.label ?? (k === "admin" ? "แอดมิน" : k);
  const permName = (k: string) => permDefs.get(k)?.label ?? k;
  const appName = (k: string) => appLabels[k] ?? k;
  const editRoles = (roles ?? []).filter((r) => r.key !== "admin");
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? "(ผู้ใช้ที่ปิดบัญชีแล้ว)";

  // ── ร่าง: ลำดับ / ที่อยู่ / ใครเห็น / เพิ่ม / เอาออก / หน้าแรก ──
  const itemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const top = useMemo(() => items.filter((i) => !i.parent_id || !itemIds.has(i.parent_id)).sort((a, b) => effectiveSort(a, appKey) - effectiveSort(b, appKey)), [items, itemIds, appKey]);
  const origOrder = useMemo(() => top.map((i) => i.id), [top]);
  const origPlaces = useMemo(() => Object.fromEntries(top.map((i) => [i.id, menuPlace(i, appKey)])) as Record<string, AppMenuPlace>, [top, appKey]);
  const origAud = useMemo(() => Object.fromEntries(items.map((it) => [it.id, cleanAudience(it.audience)])) as Record<string, MenuAudience | null>, [items]);
  const [order, setOrder] = useState(origOrder);
  const [places, setPlaces] = useState(origPlaces);
  const [aud, setAudState] = useState(origAud);
  const [adds, setAdds] = useState<Record<string, FullMenu>>({});          // เมนูที่มีอยู่แล้ว → เพิ่มเข้าแอปนี้ / เปิดกลับ
  const [news, setNews] = useState<AppSettingsMenuItem[]>([]);              // ลิงก์ใหม่ (id ชั่วคราว "new:n")
  const [removes, setRemoves] = useState<Record<string, MenuRemoveMode>>({});
  const [home, setHome] = useState<string | null>(defaultHref ?? null);
  const [newSeq, setNewSeq] = useState(1);
  const reset = () => { setOrder(origOrder); setPlaces(origPlaces); setAudState(origAud); setAdds({}); setNews([]); setRemoves({}); setHome(defaultHref ?? null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [origOrder, origPlaces, origAud, defaultHref]);
  const setAud = (id: string, a: MenuAudience | null) => setAudState((d) => ({ ...d, [id]: cleanAudience(a) }));

  // เมนูทั้งหมดบนหน้านี้ = ของแอปนี้ + ที่เพิ่ม (ร่าง) + ลิงก์ใหม่ (ร่าง)
  const pool = useMemo(() => [...items, ...Object.values(adds), ...news], [items, adds, news]);
  const byId = useMemo(() => new Map(pool.map((i) => [i.id, i])), [pool]);
  const poolIds = useMemo(() => new Set(pool.map((i) => i.id)), [pool]);
  const isTopId = (it: AppSettingsMenuItem) => !it.parent_id || !poolIds.has(it.parent_id);
  const rows = order.map((id) => byId.get(id)).filter((x): x is AppSettingsMenuItem => !!x && !removes[x.id]);
  const kidsOf = (id: string) => pool.filter((k) => k.parent_id === id && !removes[k.id]);
  const placeOf = (id: string): AppMenuPlace => places[id] ?? "bar";
  const baseAud = (id: string) => (id in origAud ? origAud[id] : adds[id] ? cleanAudience(adds[id].audience) : null);
  const audDirty = (id: string) => !sameAudience(cleanAudience(aud[id] ?? null), baseAud(id));
  const homeDirty = (home ?? null) !== (defaultHref ?? null);
  const layoutDirty = order.join() !== origOrder.join() || order.some((id) => !adds[id] && !isNewId(id) && placeOf(id) !== (origPlaces[id] ?? "bar"));
  const changedIds = new Set<string>([
    ...pool.filter((it) => !removes[it.id] && audDirty(it.id)).map((it) => it.id),
    ...order.filter((id, i) => !removes[id] && (adds[id] || isNewId(id) || placeOf(id) !== (origPlaces[id] ?? "bar") || origOrder[i] !== id)),
    ...Object.keys(removes),
  ]);
  const changeCount = changedIds.size + (homeDirty ? 1 : 0);
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setOrder((o) => {
    // ลากใน "แถวที่โชว์" (ไม่นับที่เอาออก) → แปลงเป็นตำแหน่งในลำดับเต็ม
    const shown = o.filter((id) => byId.has(id) && !removes[id]);
    const a = o.indexOf(shown[from]), b = o.indexOf(shown[to]);
    return a < 0 || b < 0 ? o : moveItem(o, a, b);
  }));

  // ── เพิ่มเมนู ──
  const [addOpen, setAddOpen] = useState(false);
  const addExisting = (m: FullMenu) => {
    if (poolIds.has(m.id)) { toast.error(`“${m.label}” อยู่ในแอปนี้แล้ว`); return; }
    const parentHere = !!m.parent_id && poolIds.has(m.parent_id);
    setAdds((a) => ({ ...a, [m.id]: m }));
    setAudState((d) => ({ ...d, [m.id]: cleanAudience(m.audience) }));
    // ที่อยู่เดิมในแอปนี้ (เช่น เคยอยู่ใน "เพิ่มเติม") คงไว้ · เคยซ่อน = กลับมาบนแถบ (เพิ่มแล้วต้องเห็น)
    const was = menuPlace(m, appKey);
    if (!parentHere) { setOrder((o) => [...o.filter((x) => x !== m.id), m.id]); setPlaces((p) => ({ ...p, [m.id]: was === "hidden" ? "bar" : was })); }
    toast.success(`เพิ่ม “${m.label}” แล้ว — กดบันทึกด้านล่างเพื่อให้มีผล`);
  };
  const addNew = (v: { label: string; icon: string; href: string }) => {
    const id = `${NEW_PREFIX}${newSeq}`;
    setNewSeq((n) => n + 1);
    setNews((ns) => [...ns, { id, label: v.label, icon: v.icon || "📄", href: v.href, permission_key: null, parent_id: null, audience: null, sort_order: 0, app_overrides: null, app_keys: [appKey] }]);
    setOrder((o) => [...o, id]);
    setPlaces((p) => ({ ...p, [id]: "bar" }));
    toast.success(`เพิ่ม “${v.label}” แล้ว — กดบันทึกด้านล่างเพื่อให้มีผล`);
  };
  // เมนูที่เพิ่มได้ = ทั้งระบบที่ยังไม่อยู่บนหน้านี้ (รวมที่ปิดอยู่ / ไม่อยู่แอปไหน / อยู่ในแอปนี้แต่ไม่โชว์ในเมนู)
  const candidates = (allMenus ?? []).filter((m) => !poolIds.has(m.id));
  // ปิดทั้งระบบ แต่เคยอยู่แอปนี้ → ส่วน "เปิดกลับ"
  const offHere = candidates.filter((m) => m.is_active === false && (m.app_keys ?? []).includes(appKey));

  // ── เอาออก ──
  const [openRm, setOpenRm] = useState<string | null>(null);
  const discardDraft = (id: string) => {
    if (isNewId(id)) setNews((ns) => ns.filter((n) => n.id !== id));
    else setAdds((a) => { const n = { ...a }; delete n[id]; return n; });
    setOrder((o) => o.filter((x) => x !== id));
  };
  const onTrash = (it: AppSettingsMenuItem) => {
    if (isNewId(it.id) || adds[it.id]) { discardDraft(it.id); return; }   // ยังไม่บันทึก = ยกเลิกการเพิ่มเฉย ๆ
    setOpenRm((o) => (o === it.id ? null : it.id)); setOpenWho(null);
  };
  const applyRemove = (it: AppSettingsMenuItem, mode: MenuRemoveMode | "hide") => {
    if (mode === "hide") setPlaces((p) => ({ ...p, [it.id]: "hidden" }));
    else setRemoves((r) => ({ ...r, [it.id]: mode, ...Object.fromEntries(kidsOf(it.id).filter((k) => !isNewId(k.id) && !adds[k.id]).map((k) => [k.id, mode])) }));
    setOpenRm(null);
  };
  const undoRemove = (id: string) => setRemoves((r) => {
    const n = { ...r }; delete n[id];
    for (const k of pool) if (k.parent_id === id) delete n[k.id];
    return n;
  });

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
  const previewPool = pool.filter((it) => !removes[it.id]);
  const placeForPreview = (it: AppSettingsMenuItem): AppMenuPlace => (it.id in places ? placeOf(it.id) : menuPlace(it, appKey));
  const preview = viewer ? previewMenusFor(previewPool, rows, appKey, viewer, { audienceOf: (it) => aud[it.id], placeOf: placeForPreview }) : null;
  const [showMore, setShowMore] = useState(false);

  // ── ให้สิทธิ์ (มีผลทันที ไม่ใช่ร่าง) ──
  const [grant, setGrant] = useState<Grant | null>(null);
  const [granting, setGranting] = useState(false);
  const doGrant = async () => {
    if (!grant || granting) return;
    setGranting(true);
    try {
      if (grant.kind === "user") {
        await jsonOf(await apiFetch("/api/admin/user-permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: grant.userId, permission_key: grant.perm, mode: "grant" }) }));
        setUserPerms((m) => (m[grant.userId] ? { ...m, [grant.userId]: new Set([...m[grant.userId], grant.perm]) } : m));
        toast.success(`ให้สิทธิ์ “${permName(grant.perm)}” แก่ ${grant.name} แล้ว`);
      } else {
        const done: string[] = [];
        for (const role of grant.roles) {
          try { await jsonOf(await apiFetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "toggle", role_key: role, permission_key: grant.perm, granted: true }) })); }
          catch (e) { throw new Error(`${roleLabel(role)}: ${e instanceof Error ? e.message : "ให้สิทธิ์ไม่สำเร็จ"}`); }
          done.push(role);
          setRolePerms((s) => new Set([...s, `${role}|${grant.perm}`]));
        }
        setUserPerms({});   // คนที่โหลดสิทธิ์ไว้แล้ว → โหลดใหม่ตอนดูอีกครั้ง
        toast.success(`ให้สิทธิ์ “${permName(grant.perm)}” แก่ ${done.map(roleLabel).join(", ")} แล้ว`);
      }
      setGrant(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ให้สิทธิ์ไม่สำเร็จ"); }
    finally { setGranting(false); }
  };

  // ── บันทึก ──
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!changeCount || saving) return;
    setSaving(true);
    let ok = 0; const errs: string[] = [];
    const step = async (label: string, run: () => Promise<unknown>) => {
      try { await run(); ok++; return true; } catch (e) { errs.push(`${label}: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"}`); return false; }
    };
    const patchMenu = (id: string, patch: Record<string, unknown>) =>
      apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch }) }).then(jsonOf);
    const fresh = (id: string): FullMenu => (allMenus ?? []).find((m) => m.id === id) ?? (byId.get(id) as FullMenu);

    // 1) หน้าแรกของแอป
    if (homeDirty) await step("หน้าแรกของแอป", async () => {
      if (!appId) throw new Error("ไม่พบแอปนี้ในทะเบียนแอป");
      await jsonOf(await apiFetch("/api/menu/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: appId, patch: { default_href: home } }) }));
    });
    // 2) ลิงก์ใหม่ → id จริง
    const realId = new Map<string, string>();
    for (const n of news) {
      await step(n.label, async () => {
        const j = await jsonOf(await apiFetch("/api/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: {
          section: "อื่น ๆ", section_order: 999, sort_order: 999, icon: n.icon || "📄", label: n.label, href: n.href,
          show_in_sidebar: true, show_in_launcher: true, permission_key: null, is_active: true, app_keys: [appKey], audience: cleanAudience(aud[n.id] ?? null),
        } }) }));
        if (j.data?.id) realId.set(n.id, j.data.id as string);
      });
    }
    // 3) เพิ่มเมนูที่มีอยู่ / เปิดกลับ
    for (const a of Object.values(adds)) {
      const p = addToAppPatch(fresh(a.id), appKey);
      if (Object.keys(p).length) await step(a.label, () => patchMenu(a.id, p));
    }
    // 4) เอาออก (ไม่ลบแถว)
    for (const [id, mode] of Object.entries(removes)) {
      const m = fresh(id);
      if (!m) continue;
      const p = removeFromAppPatch(m, appKey, mode);
      if (Object.keys(p).length) await step(m.label, () => patchMenu(id, p));
    }
    // 5) ลำดับ / ที่อยู่ (รวมเมนูที่เพิ่งเพิ่ม)
    if (layoutDirty || news.length || Object.keys(adds).length) {
      const live = rows.filter((r) => !isNewId(r.id) || realId.has(r.id));
      const rid = (id: string) => realId.get(id) ?? id;
      const planItems = live.map((r) => ({ id: rid(r.id), sort_order: isNewId(r.id) ? 0 : r.sort_order, app_overrides: isNewId(r.id) ? null : r.app_overrides }));
      const planPlaces = Object.fromEntries(live.map((r) => [rid(r.id), placeOf(r.id)])) as Record<string, AppMenuPlace>;
      for (const p of planLayoutSave(planItems, appKey, live.map((r) => rid(r.id)), planPlaces)) {
        await step(byId.get(p.id)?.label ?? live.find((r) => rid(r.id) === p.id)?.label ?? "ลำดับเมนู", () =>
          apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, app_override: { app_key: appKey, set: p.set } }) }).then(jsonOf));
      }
    }
    // 6) ใครเห็น (เมนูเดิม + ที่เพิ่ม · ลิงก์ใหม่ส่งไปพร้อมตอนสร้างแล้ว)
    const changedAud = pool.filter((it) => !isNewId(it.id) && !removes[it.id] && audDirty(it.id));
    if (changedAud.length) {
      const r = await saveMenuAudiences(changedAud, aud);
      ok += r.ok; errs.push(...r.errs);
    }
    setSaving(false);
    if (errs.length) toast.error(errs.slice(0, 3).join(" · ") + (errs.length > 3 ? ` (+${errs.length - 3})` : ""));
    if (ok) { toast.success(`บันทึกแล้ว ${changeCount} รายการ — คนที่เปิดแอปอยู่จะเห็นเมื่อรีเฟรช`); onSaved(); }
  };

  const [openWho, setOpenWho] = useState<string | null>(null);
  const whoEditor = (it: AppSettingsMenuItem) => (
    <WhoEditor key={it.id} item={it} a={aud[it.id] ?? null} setAud={setAud} roles={roles} editRoles={editRoles} rolePerms={rolePerms}
      permName={permName} nameOf={nameOf} canRoles={canRoles} onGrant={setGrant} onClose={() => setOpenWho(null)} />
  );
  const rmPanel = (it: AppSettingsMenuItem) => (
    <RemovePanel key={`rm-${it.id}`} item={it} others={otherAppsOf(it, appKey).map(appName)} kids={kidsOf(it.id).length}
      isHome={!!home && it.href === home}
      homeOptions={rows.filter((r) => r.id !== it.id && placeOf(r.id) !== "hidden" && !isNewId(r.id)).map((r) => ({ href: r.href, label: r.label }))}
      onSetHome={(h) => setHome(h)} onApply={(mode) => applyRemove(it, mode)} onClose={() => setOpenRm(null)} />
  );
  const homeHidden = rows.some((r) => placeOf(r.id) === "hidden" && home && r.href === home);

  const menuRow = (it: AppSettingsMenuItem, opts: { child?: boolean; index?: number }) => {
    const a = aud[it.id] ?? null;
    const restricted = !!(a?.roles?.length || a?.users?.length || a?.hide_users?.length);
    const p = opts.child ? null : placeOf(it.id);
    const dirty = changedIds.has(it.id);
    const draftNew = isNewId(it.id) || !!adds[it.id];
    const otherApps = otherAppsOf(it, appKey);
    const kids = opts.child ? 0 : kidsOf(it.id).length;
    return (
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${opts.child ? "pl-10 bg-slate-50/60" : ""} ${draftNew ? "bg-emerald-50/70" : dirty ? "bg-amber-50/70" : ""}`}>
        {opts.index != null ? <DragHandle {...handleProps(opts.index)} className="text-lg" /> : <span className="w-4 text-center text-slate-300">↳</span>}
        <span className="w-6 text-center"><Icon value={it.icon ?? "•"} /></span>
        <div className="min-w-[9rem] flex-1">
          <div className={`truncate text-sm ${p === "hidden" ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}>{it.label}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {draftNew && <span className={`${pill} bg-emerald-100 text-emerald-800`}><Icon name="new" /> เพิ่มใหม่ (ยังไม่บันทึก)</span>}
            {home && it.href === home && <span className={`${pill} bg-blue-50 text-blue-700`}><Icon name="home" /> หน้าแรก</span>}
            {kids > 0 && <span className={`${pill} bg-slate-100 text-slate-500`}>▾ เมนูย่อย {kids}</span>}
            {otherApps.length > 0 && <span className={`${pill} bg-slate-100 text-slate-500`} title={`ใช้ร่วมกับ: ${otherApps.map(appName).join(", ")} — "ใครเห็น" ใช้ค่าเดียวกันทุกแอป`}><Icon name="link" /> อยู่อีก {otherApps.length} แอป</span>}
            {it.permission_key && <span className={`${pill} bg-slate-100 text-slate-500`} title="ต้องมีสิทธิ์นี้ถึงเห็นและเข้าหน้าได้"><Icon name="permission" /> {permName(it.permission_key)}</span>}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => { setOpenWho((o) => (o === it.id ? null : it.id)); setOpenRm(null); }} title="ตั้งว่าใครเห็นเมนูนี้"
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
          <button type="button" onClick={() => onTrash(it)} aria-label={draftNew ? `ยกเลิกการเพิ่ม ${it.label}` : `เอา ${it.label} ออก`} title={draftNew ? "ยกเลิกการเพิ่ม" : "เอาเมนูออก (กู้คืนได้)"}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${openRm === it.id ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-500 hover:border-rose-300 hover:text-rose-600"}`}>
            <Icon name={draftNew ? "cancel" : "delete"} />
          </button>
        </div>
      </div>
    );
  };

  const removedList = Object.keys(removes).map((id) => byId.get(id)).filter((x): x is AppSettingsMenuItem => !!x);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-3 p-4 pb-24">
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-slate-600">
          จัดเมนูของแอปนี้ในที่เดียว: <b>＋ เพิ่มเมนู</b> · ลาก ⠿ เรียง · เลือก <b>บนแถบ / ใน “{shownMore}” / ซ่อน</b> · ปุ่ม <b>ใครเห็น</b> เลือกตำแหน่งหรือรายคน · ปุ่มถังขยะ = เอาออก (ไม่ลบจริง กู้คืนได้เสมอ) · ดูผลแบบที่แต่ละคนเห็นก่อนกดบันทึก
          <br />ซ่อนเมนู ≠ ห้ามเข้า — คนที่มีสิทธิ์ยังเปิดหน้านั้นได้ถ้ารู้ลิงก์ (กันจริงที่แท็บ “สิทธิ์ตามเมนู”) · แก้ชื่อ/ไอคอน/หมวดของเมนู ทำที่ <a href="/admin/menu" target="_blank" rel="noopener" className="text-blue-600 hover:underline">จัดการเมนู ↗</a>
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
                        <div key={h.id} className={`flex flex-wrap items-center gap-1.5 text-sm ${!isTopId(h) ? "pl-5" : ""}`}>
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
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="flex-1">เมนูของแอปนี้ ({rows.length + rows.reduce((n, r) => n + kidsOf(r.id).length, 0)})</span>
            <span className="hidden sm:inline">ใครเห็น · ที่อยู่</span>
            <button type="button" onClick={() => setAddOpen((v) => !v)}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium ${addOpen ? "border border-emerald-300 bg-emerald-50 text-emerald-800" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
              <Icon name="add" /> เพิ่มเมนู
            </button>
          </div>
          {addOpen && (
            <AddMenuPanel appKey={appKey} appName={appName} permName={permName} candidates={candidates} loading={!allMenus}
              allMenus={allMenus ?? []} pendingHrefs={news.map((n) => n.href)} inPool={(id) => poolIds.has(id)}
              onPick={addExisting} onCreate={addNew} onClose={() => setAddOpen(false)} />
          )}
          {rows.map((it, i) => (
            <div key={it.id} {...rowProps(i)} className={`border-t border-slate-100 first:border-t-0 ${rowCls(i)}`}>
              {menuRow(it, { index: i })}
              {openWho === it.id && whoEditor(it)}
              {openRm === it.id && rmPanel(it)}
              {kidsOf(it.id).map((k) => (
                <div key={k.id} className="border-t border-slate-100">
                  {menuRow(k, { child: true })}
                  {openWho === k.id && whoEditor(k)}
                  {openRm === k.id && rmPanel(k)}
                </div>
              ))}
            </div>
          ))}
          {!rows.length && <div className="p-6 text-center text-sm text-slate-400">แอปนี้ยังไม่มีเมนู — กด <b>เพิ่มเมนู</b> ด้านบน</div>}
        </section>

        {/* ── เอาออก / ปิดอยู่ (กู้คืนได้) ── */}
        {(removedList.length > 0 || offHere.length > 0) && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500"><Icon name="history" /> เมนูที่เอาออก / ปิดอยู่ — กู้คืนได้</div>
            {removedList.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-rose-50/40 px-3 py-2 text-sm first:border-t-0">
                <span className="w-6 text-center text-slate-400"><Icon value={m.icon ?? "•"} /></span>
                <span className="min-w-0 flex-1 truncate text-slate-500 line-through">{m.label}</span>
                <span className={`${pill} ${removes[m.id] === "off" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                  {removes[m.id] === "off" ? `ปิดทั้งระบบ${otherAppsOf(m, appKey).length ? ` (+${otherAppsOf(m, appKey).length} แอป)` : ""}` : "เอาออกจากแอปนี้"} · ยังไม่บันทึก
                </span>
                <button type="button" onClick={() => undoRemove(m.id)} className="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"><Icon name="back" /> เอากลับ</button>
              </div>
            ))}
            {offHere.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm first:border-t-0">
                <span className="w-6 text-center text-slate-400"><Icon value={m.icon ?? "•"} /></span>
                <span className="min-w-0 flex-1 truncate text-slate-500">{m.label}</span>
                <span className={`${pill} bg-rose-50 text-rose-700`} title={`อยู่ใน: ${(m.app_keys ?? []).map(appName).join(", ")}`}>ปิดทั้งระบบ · {(m.app_keys ?? []).length} แอป</span>
                <button type="button" onClick={() => addExisting(m)} title="เปิดกลับ = กลับมาในทุกแอปที่เคยอยู่" className="h-7 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-800 hover:bg-emerald-100"><Icon name="refresh" /> เปิดกลับ</button>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* แถบบันทึก (โหมดร่าง) */}
      {changeCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}>
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <span className="flex-1 text-sm text-slate-700">แก้ไขแล้ว {changeCount} รายการ (ยังไม่บันทึก) — มีผลกับทุกคนในแอปนี้{Object.values(removes).includes("off") ? " · มีเมนูที่ปิดทั้งระบบ (กระทบแอปอื่นด้วย)" : ""}</span>
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

/** ＋ เพิ่มเมนู — เลือกจากหน้าที่มีในระบบ (เติม app_keys) หรือลิงก์ใหม่ · ลิงก์ซ้ำ = ชี้ไปเมนูเดิม (ไม่สร้างซ้ำ) */
function AddMenuPanel({ appKey, appName, permName, candidates, loading, allMenus, pendingHrefs, inPool, onPick, onCreate, onClose }: {
  appKey: string;
  appName: (k: string) => string;
  permName: (k: string) => string;
  candidates: FullMenu[];
  loading: boolean;
  allMenus: FullMenu[];
  pendingHrefs: string[];
  inPool: (id: string) => boolean;
  onPick: (m: FullMenu) => void;
  onCreate: (v: { label: string; icon: string; href: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"pick" | "new">("pick");
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [icon, setIcon] = useState("📄");
  const [errs, setErrs] = useState<{ label?: string; href?: string; existing?: FullMenu }>({});
  const norm = (s: string) => s.toLowerCase().trim();
  const list = candidates
    .filter((m) => !q.trim() || norm(m.label).includes(norm(q)) || norm(m.href).includes(norm(q)))
    .sort((a, b) => Number(a.is_active === false) - Number(b.is_active === false) || a.label.localeCompare(b.label, "th"))
    .slice(0, 60);
  const create = () => {
    const r = checkNewMenuLink({ label, href }, allMenus, pendingHrefs);
    if (!r.ok) {
      if (r.field === "label") setErrs({ label: r.error });
      else setErrs({ href: r.error, existing: r.existing ? allMenus.find((m) => m.id === r.existing!.id) : undefined });
      return;
    }
    onCreate({ label: r.label, icon, href: r.href });
    setLabel(""); setHref(""); setIcon("📄"); setErrs({});
  };
  const tabCls = (on: boolean) => `h-8 rounded-full border px-3 text-xs ${on ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;
  return (
    <div className="space-y-3 border-b border-emerald-100 bg-emerald-50/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTab("pick")} className={tabCls(tab === "pick")}>เลือกจากหน้าที่มีในระบบ</button>
        <button type="button" onClick={() => setTab("new")} className={tabCls(tab === "new")}>ลิงก์ใหม่</button>
        <button type="button" onClick={onClose} aria-label="ปิดตัวเพิ่มเมนู" className="ml-auto h-8 w-8 rounded-lg text-slate-500 hover:bg-white"><Icon name="cancel" /></button>
      </div>
      {tab === "pick" ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อหน้าหรือลิงก์ เช่น บอร์ดจ่ายงาน" aria-label="ค้นหาหน้าที่จะเพิ่ม"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none" />
          {loading ? <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-white" />)}</div>
            : !list.length ? <div className="rounded-lg bg-white px-3 py-4 text-center text-xs text-slate-500">{q.trim() ? "ไม่พบหน้าที่ตรงคำค้น — ลองแท็บ “ลิงก์ใหม่”" : "ทุกหน้าในระบบอยู่ในแอปนี้แล้ว"}</div>
            : (
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {list.map((m) => {
                  const keys = (m.app_keys ?? []).filter(Boolean);
                  const here = keys.includes(appKey);
                  return (
                    <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="w-6 text-center"><Icon value={m.icon ?? "•"} /></span>
                      <div className="min-w-[10rem] flex-1">
                        <div className="truncate text-sm text-slate-800">{m.label} <span className="font-mono text-[11px] text-slate-400">{m.href}</span></div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {keys.filter((k) => k !== appKey).length
                            ? <span className={`${pill} bg-slate-100 text-slate-500`}><Icon name="link" /> ตอนนี้อยู่ใน: {keys.filter((k) => k !== appKey).map(appName).join(", ")}</span>
                            : !here && <span className={`${pill} bg-slate-100 text-slate-500`}>ยังไม่อยู่แอปไหน</span>}
                          {m.is_active === false && <span className={`${pill} bg-rose-50 text-rose-700`}>ปิดทั้งระบบอยู่ — เพิ่มแล้วจะเปิดกลับทุกแอปที่เคยอยู่</span>}
                          {here && m.is_active !== false && m.show_in_sidebar === false && <span className={`${pill} bg-amber-50 text-amber-700`}>อยู่ในแอปนี้แต่ไม่โชว์ในเมนู</span>}
                          {m.permission_key && <span className={`${pill} bg-slate-100 text-slate-500`}><Icon name="permission" /> {permName(m.permission_key)}</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => onPick(m)} className="h-8 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50"><Icon name="add" /> เพิ่ม</button>
                    </div>
                  );
                })}
              </div>
            )}
          <p className="text-[11px] text-slate-500">เพิ่มแล้วเป็นเมนูเดียวกับในแอปเดิม (ไม่สร้างซ้ำ) · สิทธิ์ที่หน้านั้นต้องใช้ติดมาด้วย · “ใครเห็น” ใช้ค่าเดียวกันทุกแอป</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-2">
            <div>
              <div className="mb-1 text-xs text-slate-500">ไอคอน</div>
              <IconPicker value={icon} onChange={setIcon} />
            </div>
            <label className="min-w-[12rem] flex-1">
              <div className="mb-1 text-xs text-slate-500">ชื่อเมนู</div>
              <input value={label} onChange={(e) => { setLabel(e.target.value); setErrs((x) => ({ ...x, label: undefined })); }} placeholder="เช่น สรุปงานประจำวัน" maxLength={60}
                className={`h-10 w-full rounded-lg border bg-white px-3 text-sm focus:outline-none ${errs.label ? "border-rose-300" : "border-slate-200 focus:border-emerald-400"}`} />
              {errs.label && <div className="mt-0.5 text-xs text-rose-600">{errs.label}</div>}
            </label>
            <label className="min-w-[14rem] flex-1">
              <div className="mb-1 text-xs text-slate-500">ลิงก์</div>
              <input value={href} onChange={(e) => { setHref(e.target.value); setErrs((x) => ({ ...x, href: undefined, existing: undefined })); }} placeholder="/tasks/daily หรือ https://…"
                className={`h-10 w-full rounded-lg border bg-white px-3 font-mono text-sm focus:outline-none ${errs.href ? "border-rose-300" : "border-slate-200 focus:border-emerald-400"}`} />
              {errs.href && (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-rose-600">
                  {errs.href}
                  {errs.existing && (inPool(errs.existing.id)
                    ? <span className="text-slate-500">(อยู่ในแอปนี้แล้ว)</span>
                    : <button type="button" onClick={() => { onPick(errs.existing!); setErrs({}); setHref(""); }} className="h-6 rounded-full border border-emerald-200 bg-white px-2 text-[11px] text-emerald-700 hover:bg-emerald-50">เพิ่มเมนูเดิมแทน</button>)}
                </div>
              )}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[11px] text-slate-500">ทุกคนที่เข้าแอปนี้ได้จะเห็น — ตั้ง “ใครเห็น” ได้หลังเพิ่ม · หน้าในระบบที่ต้องมีสิทธิ์ หน้านั้นตรวจสิทธิ์เองอยู่แล้ว</p>
            <button type="button" onClick={create} className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"><Icon name="add" /> เพิ่มเมนู</button>
          </div>
        </>
      )}
    </div>
  );
}

/** 🗑 เอาเมนูออกแบบปลอดภัย — เลือกวิธี (ไม่มีลบถาวร) · เมนูหน้าแรกต้องเลือกหน้าแรกใหม่ก่อน */
function RemovePanel({ item, others, kids, isHome, homeOptions, onSetHome, onApply, onClose }: {
  item: AppSettingsMenuItem;
  others: string[];
  kids: number;
  isHome: boolean;
  homeOptions: { href: string; label: string }[];
  onSetHome: (href: string) => void;
  onApply: (mode: MenuRemoveMode | "hide") => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<MenuRemoveMode | "hide">("app");
  const [nextHome, setNextHome] = useState("");
  const [homeErr, setHomeErr] = useState("");
  const child = !!item.parent_id;
  const opt = (v: MenuRemoveMode | "hide", title: string, desc: string, danger = false) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${mode === v ? (danger ? "border-rose-300 bg-rose-50/60" : "border-violet-300 bg-white") : "border-transparent hover:bg-white/60"}`}>
      <input type="radio" checked={mode === v} onChange={() => setMode(v)} className={`mt-0.5 ${danger ? "accent-rose-600" : "accent-violet-600"}`} />
      <span><span className={`font-medium ${danger ? "text-rose-700" : "text-slate-800"}`}>{title}</span><br /><span className="text-xs text-slate-500">{desc}</span></span>
    </label>
  );
  if (isHome) return (
    <div className={`mx-3 mb-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 ${child ? "ml-10" : "ml-12"}`}>
      <div><Icon name="home" /> “{item.label}” เป็นหน้าแรกของแอปนี้ — เลือกหน้าแรกใหม่ก่อน แล้วค่อยเอาออก</div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={nextHome} onChange={(e) => { setNextHome(e.target.value); setHomeErr(""); }} aria-label="เลือกหน้าแรกใหม่" className="h-8 min-w-[12rem] rounded-lg border border-amber-200 bg-white px-2 text-sm">
          <option value="">— เลือกหน้าแรกใหม่ —</option>
          {homeOptions.map((h) => <option key={h.href} value={h.href}>{h.label}</option>)}
        </select>
        <button type="button" onClick={() => { if (!nextHome) { setHomeErr("เลือกหน้าแรกใหม่ก่อน"); return; } onSetHome(nextHome); }} className="h-8 rounded-lg border border-amber-300 bg-white px-3 text-xs font-medium hover:bg-amber-100">ตั้งเป็นหน้าแรก</button>
        <button type="button" onClick={onClose} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">ยกเลิก</button>
      </div>
      {homeErr && <div className="text-xs text-rose-600">{homeErr}</div>}
    </div>
  );
  return (
    <div className={`mx-3 mb-3 space-y-2 rounded-lg border border-rose-100 bg-rose-50/40 p-3 text-sm ${child ? "ml-10" : "ml-12"}`}>
      <div className="font-medium text-slate-800">เอา “{item.label}” ออก</div>
      {others.length > 0 && <div className="text-xs text-slate-600"><Icon name="link" /> เมนูนี้ใช้อยู่ในแอปอื่นอีก {others.length} แอป: {others.join(", ")}</div>}
      {kids > 0 && <div className="text-xs text-slate-600">เมนูย่อย {kids} ตัวจะออกตามไปด้วย</div>}
      <div className="space-y-1">
        {opt("app", "เอาออกจากแอปนี้ (แนะนำ)", others.length ? "แอปอื่นยังเห็นเหมือนเดิม · เพิ่มกลับได้จากปุ่ม “เพิ่มเมนู”" : "เมนูจะไม่อยู่แอปไหนเลย แต่ยังไม่ถูกลบ · เพิ่มกลับได้จากปุ่ม “เพิ่มเมนู”")}
        {!child && opt("hide", "ซ่อนไว้ในแอปนี้", "ยังอยู่ในรายการนี้ เปลี่ยนเป็น “บนแถบ” เพื่อแสดงกลับได้ทันที")}
        {opt("off", "ปิดทั้งระบบ", `${others.length ? `หายจากทุกแอป (${others.length + 1} แอป)` : "หายจากทุกที่"} · เปิดกลับได้ในส่วน “เมนูที่เอาออก / ปิดอยู่”`, true)}
      </div>
      <div className="text-[11px] text-slate-500"><Icon name="lock" /> ไม่มีการลบถาวรในหน้านี้ — ทุกแบบกู้คืนได้ และมีประวัติว่าใครทำ</div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => onApply(mode)} className={`h-8 rounded-lg px-3 text-xs font-medium text-white ${mode === "off" ? "bg-rose-600 hover:bg-rose-700" : "bg-violet-600 hover:bg-violet-700"}`}>ตกลง (ยังไม่บันทึก)</button>
      </div>
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
