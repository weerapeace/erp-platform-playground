"use client";
/**
 * 👤 ตามพนักงาน — แท็บใน ⚙️ ตั้งค่าแอปเดี่ยว (เจ้าของขอ 2026-10-30: "ตั้งได้ว่าพนักงานจะเห็นเมนูอะไรบ้างใน APP" แบบ ก)
 *   เลือกพนักงาน → ติ๊กเมนูที่คนนี้เห็น · ติ๊กต่างจากตำแหน่ง = ตั้งเฉพาะคนนี้ (คนอื่นตำแหน่งเดียวกันเห็นเหมือนเดิม)
 *   ข้อมูลชุดเดียวกับแท็บ 👁 ใครเห็นเมนูไหน (erp_menu_items.audience · กฎ lib/menu-audience: explainMenuFor / setMenuVisibleFor / resetMenuFor)
 *   เห็นจริงบนแถบ = ไม่ถูกซ่อนทั้งแอป (↕️ จัดเรียง) + มีสิทธิ์ permission_key + ติ๊กเห็น — กฎเดียวกับแถบเมนู app/app/[appKey]
 *   ซ่อนเมนู ≠ ห้ามเข้า → เมนูที่ซ่อนแต่คนนี้ยังมีสิทธิ์ ขึ้นป้าย "ยังเข้าได้ด้วยลิงก์" (กันจริงที่แท็บ สิทธิ์ตามเมนู)
 */
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { cleanAudience, explainMenuFor, resetMenuFor, setMenuVisibleFor, type MenuAudience, type MenuReason } from "@/lib/menu-audience";
import { menuPlace } from "@/lib/app-menu-layout";
import type { AdminUser } from "@/app/api/admin/users/route";
import type { AppSettingsMenuItem } from "./index";
import { saveMenuAudiences, sameAudience } from "./audience-save";

type Person = { id: string; name: string; role: string };
type Role = { key: string; label: string };

const REASON_TEXT: Record<MenuReason, string> = {
  admin: "แอดมินเห็นทุกเมนู",
  everyone: "ทุกคนเห็น",
  role: "ตำแหน่งนี้เห็น",
  role_no: "ตำแหน่งนี้ไม่เห็น",
  list_only: "เห็นเฉพาะคนที่เลือก",
  user_show: "ตั้งเฉพาะคนนี้",
  user_hide: "ตั้งเฉพาะคนนี้",
};
const pill = "rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap";

export function MenuByUserTab({ appKey, items, onSaved }: { appKey: string; items: AppSettingsMenuItem[]; onSaved: () => void }) {
  const toast = useToast();
  const orig = useMemo(() => Object.fromEntries(items.map((it) => [it.id, cleanAudience(it.audience)])), [items]);
  const [draft, setDraft] = useState<Record<string, MenuAudience | null>>(orig);
  useEffect(() => setDraft(orig), [orig]);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [perms, setPerms] = useState<{ uid: string; set: Set<string> } | null>(null);   // สิทธิ์จริงของคนที่เลือก (ตำแหน่ง + ให้/ปิดรายคน)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch("/api/admin/users").then((r) => r.json()), apiFetch("/api/admin/roles").then((r) => r.json())])
      .then(([u, r]) => {
        if (u.error) throw new Error(u.error);
        const list = ((u.data ?? []) as AdminUser[]).filter((x) => x.active)
          .map((x) => ({ id: x.id, name: (x.display_name || x.username || x.email || "").trim(), role: x.role }))
          .sort((a, b) => a.name.localeCompare(b.name, "th"));
        setPeople(list);
        setRoles((r.roles ?? []) as Role[]);
        setUserId((cur) => cur || list.find((p) => p.role !== "admin")?.id || list[0]?.id || "");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดรายชื่อพนักงานไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    apiFetch(`/api/admin/user-permissions?user_id=${encodeURIComponent(userId)}`).then((r) => r.json()).then((j) => {
      if (!alive || j.error) return;
      const set = new Set<string>((j.role_perms ?? []) as string[]);
      for (const o of (j.overrides ?? []) as { permission_key: string; mode: string }[]) {
        if (o.mode === "grant") set.add(o.permission_key); else set.delete(o.permission_key);
      }
      setPerms({ uid: userId, set });
    }).catch(() => { /* ไม่รู้สิทธิ์ = ไม่ขึ้นป้ายเตือน */ });
    return () => { alive = false; };
  }, [userId]);

  const person = people?.find((p) => p.id === userId) ?? null;
  const roleLabel = (k: string) => roles.find((r) => r.key === k)?.label ?? k;
  const isAdmin = person?.role === "admin";
  const permsKnown = !!perms && perms.uid === userId;
  const hasPerm = (it: AppSettingsMenuItem) => isAdmin || !it.permission_key || !permsKnown || perms!.set.has(it.permission_key);   // แอดมินมีทุกสิทธิ์ (เหมือน can())

  const ids = new Set(items.map((i) => i.id));
  const ordered = items.filter((i) => !i.parent_id || !ids.has(i.parent_id)).flatMap((p) => [p, ...items.filter((k) => k.parent_id === p.id)]);
  const hiddenInApp = new Set(items.filter((m) => menuPlace(m, appKey) === "hidden").map((m) => m.id));
  const appHidden = (it: AppSettingsMenuItem) => hiddenInApp.has(it.id) || (!!it.parent_id && hiddenInApp.has(it.parent_id));

  const rows = person ? ordered.map((it) => {
    const ex = explainMenuFor(draft[it.id], person);
    const perm = hasPerm(it);
    const shown = ex.visible && perm && !appHidden(it);   // เห็นจริงบนแถบเมนู
    return { it, ex, perm, shown, own: ex.reason === "user_show" || ex.reason === "user_hide" };
  }) : [];
  const ownCount = rows.filter((r) => r.own).length;
  const changed = items.filter((it) => !sameAudience(cleanAudience(draft[it.id]), orig[it.id]));
  const setAud = (id: string, a: MenuAudience | null) => setDraft((d) => ({ ...d, [id]: cleanAudience(a) }));

  const save = async () => {
    if (!changed.length || saving) return;
    setSaving(true);
    const { ok, errs } = await saveMenuAudiences(changed, draft);
    setSaving(false);
    if (errs.length) toast.error(errs.slice(0, 3).join(" · "));
    if (ok) { toast.success(`บันทึกแล้ว ${ok} เมนู — คนที่เปิดแอปอยู่จะเห็นเมื่อรีเฟรช`); onSaved(); }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-3 p-4 pb-24">
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-slate-600">
          เลือกพนักงาน แล้วติ๊กเมนูที่คนนี้เห็น — ติ๊กต่างจากตำแหน่ง = <b>ตั้งเฉพาะคนนี้</b> (คนอื่นตำแหน่งเดียวกันเห็นเหมือนเดิม) · ข้อมูลชุดเดียวกับแท็บ “ใครเห็นเมนูไหน”
          <br />เป็นการซ่อน/โชว์ในเมนูเท่านั้น — ถ้าต้องกันไม่ให้เข้าหน้านั้นจริง ตั้งที่แท็บ “สิทธิ์ตามเมนู”
        </div>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        {!people && !err ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : people && people.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">ยังไม่มีพนักงานที่ใช้งานอยู่</div>
        ) : people && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="menu-by-user" className="text-slate-500"><Icon name="user" /> เลือกพนักงาน</label>
              <select id="menu-by-user" value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 min-w-[14rem] rounded-lg border border-slate-200 bg-white px-2 text-sm">
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
              </select>
              {person && <span className={`${pill} bg-slate-100 text-slate-600`}>ตำแหน่ง: {roleLabel(person.role)}</span>}
              {person && <span className="ml-auto text-xs text-slate-500">เห็น {rows.filter((r) => r.shown).length}/{rows.length} เมนู</span>}
            </div>

            {isAdmin && <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">แอดมินเห็นทุกเมนูเสมอ (ไว้จัดการระบบ) — ตั้งซ่อนรายคนให้แอดมินไม่ได้</div>}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {rows.map(({ it, ex, perm, shown, own }) => {
                const dirty = !!person && explainMenuFor(orig[it.id], person).visible !== ex.visible;   // ไฮไลต์เฉพาะเมนูที่คนนี้เห็นเปลี่ยนไป (แก้ให้คนอื่นไม่นับ)
                const blocked = appHidden(it) || !perm;
                return (
                  <label key={it.id} className={`flex items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-sm first:border-t-0 ${dirty ? "bg-amber-50/60" : ""} ${blocked || isAdmin ? "cursor-default" : "cursor-pointer hover:bg-slate-50"} ${it.parent_id && ids.has(it.parent_id) ? "pl-9" : ""}`}>
                    <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={shown} disabled={blocked || isAdmin || !person}
                      onChange={(e) => person && setAud(it.id, setMenuVisibleFor(draft[it.id], person, e.target.checked))} />
                    <span className={`min-w-0 flex-1 ${shown ? "text-slate-800" : "text-slate-400"}`}>
                      <span className="mr-1.5"><Icon value={it.icon ?? "•"} /></span>{it.label}
                    </span>
                    {appHidden(it)
                      ? <span className={`${pill} bg-slate-100 text-slate-500`} title="ซ่อนจากแถบของแอปนี้สำหรับทุกคน — เปลี่ยนได้ที่แท็บจัดเรียง / ซ่อนเมนู">ซ่อนทั้งแอป</span>
                      : !perm
                        ? <span className={`${pill} bg-slate-100 text-slate-500`} title={`คนนี้ไม่มีสิทธิ์ ${it.permission_key} — ให้สิทธิ์ได้ที่แท็บสิทธิ์ตามเมนู`}>ไม่มีสิทธิ์เข้า</span>
                        : <>
                            {!ex.visible && permsKnown && <span className={`${pill} bg-amber-50 text-amber-700`} title="ซ่อนเมนูแล้ว แต่คนนี้ยังมีสิทธิ์ — ถ้ารู้ลิงก์ก็เปิดหน้านี้ได้ (กันจริงที่แท็บสิทธิ์ตามเมนู)"><Icon name="warning" /> ยังเข้าได้ด้วยลิงก์</span>}
                            <span className={`${pill} ${own ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>{REASON_TEXT[ex.reason]}</span>
                          </>}
                  </label>
                );
              })}
            </div>

            {person && !isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={!ownCount}
                  onClick={() => setDraft((d) => Object.fromEntries(items.map((it) => [it.id, cleanAudience(resetMenuFor(d[it.id], person))])))}
                  title="ล้างค่าที่ตั้งเฉพาะคนนี้ทุกเมนูในแอปนี้ — กลับไปเห็นตามตำแหน่ง"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  <Icon name="refresh" /> ตั้งกลับเป็นตามตำแหน่ง{ownCount ? ` (${ownCount})` : ""}
                </button>
              </div>
            )}

            {person && (
              <div>
                <p className="mb-1 text-xs text-slate-500"><Icon name="view" /> แถบเมนูที่ {person.name} จะเห็น</p>
                <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-2 text-xs">
                  {rows.filter((r) => r.shown && !(r.it.parent_id && ids.has(r.it.parent_id))).map((r) => (
                    <span key={r.it.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700"><Icon value={r.it.icon ?? "•"} /> {r.it.label}</span>
                  ))}
                  {!rows.some((r) => r.shown) && <span className="px-1 py-1 text-slate-500">ไม่เห็นเมนูไหนเลย</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* แถบบันทึก (โหมดร่าง — สลับดูหลายคนแล้วบันทึกทีเดียวได้) */}
      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}>
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <span className="flex-1 text-sm text-slate-700">แก้ไขแล้ว {changed.length} เมนู (ยังไม่บันทึก)</span>
            <button type="button" onClick={() => setDraft(orig)} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : <><Icon name="save" /> บันทึก</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
