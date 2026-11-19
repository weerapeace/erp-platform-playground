"use client";

/**
 * แอปพนักงาน รอบ 2 — แท็บในตัวช่วยสร้าง: 🔒 ล็อก + ข้อยกเว้นดูอย่างเดียว · 👀 ดูแทนพนักงาน
 * กฎ: lib/app-lock.ts (ล็อก/สิทธิ์ที่ใช้ได้) · lib/staff-apps.ts (ร่าง) · lib/menu-audience (ใครเห็นเมนู)
 * ทุกอย่างแก้ในร่าง → มีผลจริงเมื่อกด "เผยแพร่"
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { MultiUserPicker } from "@/app/tasks/multi-user-picker";
import type { UserPickerValue } from "@/components/pickers";
import { StaffAppHome, type StaffHomeItem } from "@/components/staff-app-home";
import { cleanLock, computeAllowedPerms, isViewPerm, lockIncludes, type AppLock } from "@/lib/app-lock";
import { menuVisibleTo } from "@/lib/menu-audience";
import { appVisibleTo, type StaffAppDraft } from "@/lib/staff-apps";
import type { BuilderMenu } from "./index";

type Role = { key: string; label: string; active?: boolean };
type Person = { id: string; name: string; role: string | null };
type Perm = { key: string; label: string; category: string | null; sort_order?: number | null };
export type AppGroupLite = { key: string; label: string; permission_key?: string | null; kind?: string | null };

/** รายชื่อตำแหน่ง / คน / สิทธิ์ทั้งหมด (โหลดครั้งเดียวต่อแท็บ) */
function useDirectory() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [perms, setPerms] = useState<Perm[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/roles").then((r) => r.json()).then((j) => {
      setRoles(((j.roles ?? []) as Role[]).filter((r) => r.active !== false && r.key !== "admin"));
      setPerms((j.permissions ?? []) as Perm[]);
    }).catch(() => setRoles([]));
    apiFetch("/api/admin/users").then((r) => r.json()).then((u) => {
      setPeople(((u.data ?? []) as { id: string; display_name?: string | null; username?: string | null; email?: string | null; role?: string | null; active?: boolean }[])
        .filter((x) => x.active !== false)
        .map((x) => ({ id: x.id, name: (x.display_name || x.username || x.email || "").trim() || "(ไม่มีชื่อ)", role: x.role ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, "th")));
    }).catch(() => setPeople([]));
  }, []);
  return { roles, people, perms };
}

const chip = (on: boolean) => `h-8 rounded-full border px-3 text-sm ${on ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;

// ── 🔒 ล็อก ──
export function LockStep({ draft, setDraft, menus, appGroups }: {
  draft: StaffAppDraft; setDraft: React.Dispatch<React.SetStateAction<StaffAppDraft>>; menus: BuilderMenu[]; appGroups: AppGroupLite[];
}) {
  const { roles, people, perms } = useDirectory();
  const [q, setQ] = useState("");
  const [permQ, setPermQ] = useState("");
  const lock = draft.lock ?? null;
  const setLock = (p: Partial<AppLock>) => setDraft((d) => ({ ...d, lock: cleanLock({ ...(d.lock ?? {}), ...p }) }));
  const toggleRole = (k: string) => { const rs = lock?.roles ?? []; setLock({ roles: rs.includes(k) ? rs.filter((x) => x !== k) : [...rs, k] }); };
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? id;
  const toVals = (list?: string[]) => (list ?? []).map((id) => ({ id, code: null, name: nameOf(id) } as UserPickerValue));
  const lockedPeople = (people ?? []).filter((p) => lockIncludes(lock, p));
  const inApp = new Set(draft.menus.map((m) => m.menu_id));
  const exc = new Set(draft.exceptions ?? []);
  const toggleExc = (id: string) => setDraft((d) => { const s = new Set(d.exceptions ?? []); if (s.has(id)) s.delete(id); else s.add(id); return { ...d, exceptions: [...s] }; });
  const extra = new Set(draft.extra_perms ?? []);
  const toggleExtra = (k: string) => setDraft((d) => { const s = new Set(d.extra_perms ?? []); if (s.has(k)) s.delete(k); else s.add(k); return { ...d, extra_perms: [...s] }; });

  const allowed = useMemo(() => computeAllowedPerms(
    { menuIds: draft.menus.map((m) => m.menu_id), readOnlyIds: draft.exceptions ?? [], extraPerms: draft.extra_perms ?? [] },
    menus.map((m) => ({ id: m.id, href: m.href, permission_key: m.permission_key ?? null, app_keys: m.app_keys ?? [] })),
    perms, appGroups,
  ), [draft.menus, draft.exceptions, draft.extra_perms, menus, perms, appGroups]);
  const permLabel = (k: string) => perms.find((p) => p.key === k)?.label ?? k;

  const query = q.trim().toLowerCase();
  const pool = menus.filter((m) => !inApp.has(m.id) && m.is_active !== false && m.href?.startsWith("/") && (!query || m.label.toLowerCase().includes(query) || m.href.toLowerCase().includes(query)));
  const pq = permQ.trim().toLowerCase();
  const permPool = pq ? perms.filter((p) => !allowed.includes(p.key) && (p.key.includes(pq) || p.label.toLowerCase().includes(pq))).slice(0, 30) : [];

  return (
    <div className="max-w-3xl space-y-6 text-sm">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-800"><Icon name="lock" /> ล็อกคนกลุ่มนี้ให้อยู่ในแอป</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          คนที่ถูกล็อกจะใช้ได้แค่เมนูในแอปนี้ (+ ข้อยกเว้นด้านล่าง) — พิมพ์ลิงก์หน้าอื่นเองก็เข้าไม่ได้ ข้อมูลกันจริงที่ฐานข้อมูล · แอดมินไม่ถูกล็อก · ไม่ติ๊กใคร = ไม่ล็อก
        </p>
        <div className="mb-1 text-xs text-slate-500">ล็อกทั้งตำแหน่ง</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(roles ?? []).map((r) => <button key={r.key} type="button" onClick={() => toggleRole(r.key)} className={chip(!!lock?.roles?.includes(r.key))}>{r.label}</button>)}
          {!roles && <span className="text-xs text-slate-400">กำลังโหลด…</span>}
        </div>
        <div className="mb-1 text-xs text-slate-500">หรือล็อกรายคน</div>
        <MultiUserPicker value={toVals(lock?.users)} onChange={(v) => setLock({ users: v.map((u) => u.id) })} disableCreate />
        {lockedPeople.length > 0 && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${lock?.roles?.length ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
            <Icon name="alert-triangle" /> ถ้าเผยแพร่ จะล็อก {lockedPeople.length} คน: {lockedPeople.slice(0, 12).map((p) => p.name).join(", ")}{lockedPeople.length > 12 ? " …" : ""}
            {!!lock?.roles?.length && <div className="mt-1">ล็อกทั้งตำแหน่ง = คนในตำแหน่งนั้นที่ใช้แอปอื่นอยู่จะเปิดแอปอื่นไม่ได้ — ถ้าไม่แน่ใจ ล็อกรายคนดีกว่า</div>}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-800"><Icon name="eye" /> ข้อยกเว้น: เปิดดูหน้านอกแอปได้แบบอ่านอย่างเดียว</h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">เช่น แอปผลิตกดดูรายละเอียดสินค้าได้ แต่แก้ไม่ได้ — ได้เฉพาะสิทธิ์ “ดู” ของหน้านั้น · มีผลกับคนที่ถูกล็อก</p>
        {exc.size > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[...exc].map((id) => { const m = menus.find((x) => x.id === id); return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-800">
                <Icon value={m?.icon ?? "📄"} /> {m?.label ?? "(เมนูถูกลบ)"} · ดูอย่างเดียว
                <button type="button" onClick={() => toggleExc(id)} aria-label="เอาข้อยกเว้นออก" className="text-sky-500 hover:text-rose-600"><Icon name="x" /></button>
              </span>
            ); })}
          </div>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="ค้นหาหน้าที่จะให้ดูได้…" className="h-9 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-violet-400" />
        {query && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-100">
            {pool.slice(0, 40).map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={exc.has(m.id)} onChange={() => toggleExc(m.id)} className="accent-sky-600" />
                <Icon value={m.icon ?? "📄"} /> <span className="min-w-0 flex-1 truncate">{m.label}</span><span className="truncate font-mono text-[11px] text-slate-400">{m.href}</span>
              </label>
            ))}
            {pool.length === 0 && <p className="p-3 text-center text-xs text-slate-500">ไม่พบ</p>}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-800"><Icon name="key" /> สิทธิ์ที่คนถูกล็อกยังใช้ได้ ({allowed.length})</h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">ระบบคิดให้จากเมนูในแอป + ข้อยกเว้น · ใช้ได้จริงเฉพาะที่คนนั้นมีสิทธิ์อยู่แล้ว (ไม่ได้ให้สิทธิ์เพิ่ม) · ถ้าหน้าในแอปเรียกใช้สิทธิ์อื่น เพิ่มเองได้</p>
        <div className="flex flex-wrap gap-1">
          {allowed.map((k) => (
            <span key={k} title={k} className={`rounded px-1.5 py-0.5 text-[11px] ${extra.has(k) ? "bg-violet-100 text-violet-800" : isViewPerm(k) ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-700"}`}>
              {permLabel(k)}{extra.has(k) && <button type="button" onClick={() => toggleExtra(k)} aria-label="เอาออก" className="ml-1 text-violet-500 hover:text-rose-600">×</button>}
            </span>
          ))}
        </div>
        <input value={permQ} onChange={(e) => setPermQ(e.target.value)} type="search" placeholder="+ เพิ่มสิทธิ์เอง (ค้นชื่อสิทธิ์)…" className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-violet-400" />
        {permPool.length > 0 && (
          <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-100">
            {permPool.map((p) => (
              <button key={p.key} type="button" onClick={() => { toggleExtra(p.key); setPermQ(""); }} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50">
                <span className="min-w-0 flex-1 truncate">{p.label}</span><span className="font-mono text-[11px] text-slate-400">{p.key}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── 👀 ดูแทน ──
export function ViewAsStep({ draft, menus, appGroups }: { draft: StaffAppDraft; menus: BuilderMenu[]; appGroups: AppGroupLite[] }) {
  const { people, perms } = useDirectory();
  const [uid, setUid] = useState("");
  const [userPerms, setUserPerms] = useState<{ uid: string; set: Set<string> } | null>(null);
  const [lang, setLang] = useState<"th" | "en">("th");
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    apiFetch(`/api/admin/user-permissions?user_id=${encodeURIComponent(uid)}`).then((r) => r.json()).then((j) => {
      if (!alive || j.error) return;
      const set = new Set<string>((j.role_perms ?? []) as string[]);
      for (const o of (j.overrides ?? []) as { permission_key: string; mode: string }[]) { if (o.mode === "grant") set.add(o.permission_key); else set.delete(o.permission_key); }
      setUserPerms({ uid, set });
    }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);
  const person = people?.find((p) => p.id === uid) ?? null;
  const byId = new Map(menus.map((m) => [m.id, m]));
  const locked = !!person && lockIncludes(draft.lock, person);
  const allowed = useMemo(() => new Set(computeAllowedPerms(
    { menuIds: draft.menus.map((m) => m.menu_id), readOnlyIds: draft.exceptions ?? [], extraPerms: draft.extra_perms ?? [] },
    menus.map((m) => ({ id: m.id, href: m.href, permission_key: m.permission_key ?? null, app_keys: m.app_keys ?? [] })), perms, appGroups,
  )), [draft, menus, perms, appGroups]);
  const ready = !!person && userPerms?.uid === uid;
  const isAdmin = person?.role === "admin";
  const has = (k: string | null | undefined) => !k || isAdmin || (!!userPerms?.set.has(k) && (!locked || allowed.has(k)));
  const seesApp = !!person && appVisibleTo({ kind: "staff", status: "published", audience: draft.audience ?? null }, person);

  const rows = draft.menus.map((m) => {
    const src = byId.get(m.menu_id);
    const sec = draft.sections.find((s) => s.key === m.section);
    const reason = !src ? "เมนูถูกลบจากระบบ" : !menuVisibleTo(src.audience, person) ? "เมนูนี้ตั้งไว้ไม่ให้คนนี้เห็น (ใครเห็นเมนู)" : !has(src.permission_key) ? `ยังไม่มีสิทธิ์ “${perms.find((p) => p.key === src.permission_key)?.label ?? src.permission_key}”` : null;
    const item: StaffHomeItem = {
      id: m.menu_id, label: (lang === "en" ? m.label_en : undefined) || m.label || src?.label || "?",
      section: sec ? ((lang === "en" && sec.label_en) || sec.label) : "", icon: src?.icon ?? null, icon_url: src?.icon_url ?? null,
    };
    return { item, reason };
  });
  const visible = rows.filter((r) => !r.reason).map((r) => r.item);
  const hidden = rows.filter((r) => r.reason);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-600">ดูแทน</span>
        <select value={uid} onChange={(e) => setUid(e.target.value)} className="h-9 min-w-[220px] rounded-lg border border-slate-200 bg-white px-2">
          <option value="">— เลือกพนักงาน —</option>
          {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` (${p.role})` : ""}</option>)}
        </select>
        <span className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white text-xs">
          {(["th", "en"] as const).map((l) => <button key={l} type="button" onClick={() => setLang(l)} className={`px-2 py-1 ${lang === l ? "bg-violet-600 text-white" : "text-slate-600"}`}>{l.toUpperCase()}</button>)}
        </span>
      </div>
      <p className="text-xs text-slate-500">ตามร่างที่กำลังแก้ (ยังไม่ต้องเผยแพร่) · ไม่ได้ล็อกอินเป็นคนนั้นจริง ไม่บันทึกอะไร</p>
      {!person ? <p className="py-8 text-center text-slate-500">เลือกพนักงานเพื่อดูว่าเขาจะเห็นอะไร</p> : !ready ? (
        <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="mx-auto flex h-[520px] w-full max-w-[340px] flex-shrink-0 flex-col overflow-hidden rounded-[28px] border-[6px] border-slate-800 bg-white shadow-lg">
            <div className="flex items-center gap-2 px-3 py-2.5 text-white" style={{ background: draft.theme_color || "#2563eb" }}>
              <Icon value={draft.icon ?? "📱"} /><span className="truncate text-sm font-semibold">{(lang === "en" && draft.label_en) || draft.label}</span>
            </div>
            {seesApp ? <StaffAppHome items={visible} onOpen={() => {}} preview /> : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500"><span><Icon name="lock" /> คนนี้ไม่อยู่ในรายชื่อ “ใครเห็นแอป” — จะเปิดแอปนี้ไม่ได้</span></div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className={`rounded-lg px-3 py-2 text-xs ${locked ? "bg-rose-50 text-rose-800" : "bg-slate-50 text-slate-600"}`}>
              {isAdmin ? "แอดมิน — เห็นทุกเมนู ไม่ถูกล็อก" : locked ? <><Icon name="lock" /> ถูกล็อกในแอปนี้ — เปิดหน้าอื่นนอกแอปไม่ได้</> : "ไม่ได้ถูกล็อก — ยังใช้แอปอื่นได้ตามสิทธิ์เดิม"}
            </div>
            <div className="text-xs text-slate-600">เห็น {visible.length} จาก {rows.length} เมนู</div>
            {hidden.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {hidden.map((r) => (
                  <div key={r.item.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <Icon value={r.item.icon ?? "📄"} /> <span className="min-w-0 flex-1 truncate text-slate-700">{r.item.label}</span>
                    <span className="text-amber-700">{r.reason}</span>
                  </div>
                ))}
              </div>
            )}
            {hidden.length > 0 && <p className="text-[11px] text-slate-500">ให้สิทธิ์ได้ที่แท็บ “สิทธิ์ตามเมนู” (หลังเผยแพร่ครั้งแรก)</p>}
          </div>
        </div>
      )}
    </div>
  );
}
