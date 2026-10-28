"use client";

/**
 * 🔐 WebsiteAccessSettings — ตั้ง "ใครทำอะไรได้" ในเว็บไซต์ (หน้า /website/access · แท็บ ⚙️ ของแอปจัดการงาน)
 *   แถว = ตำแหน่ง (ค่าเริ่มของทุกคนในตำแหน่ง) + รายคน (ยกเว้นเฉพาะคน · ชนะตำแหน่ง)
 *   คอลัมน์ = 6 กลุ่มงาน (กดสลับ ไม่เห็น → ดูได้ → แก้ได้) + ร้านที่เข้าได้ (ติ๊ก)
 *   website.access (เห็นเมนู) ตั้งให้เอง = เห็นอย่างน้อย 1 กลุ่ม
 *   ร่าง → SaveBar ทีเดียว (POST /api/website/access) · ผู้ดูแลระบบได้ทุกอย่างเสมอ
 * ของกลาง: lib/website-access · SaveBar · UserPicker · ระบบสิทธิ์เดิม (ตำแหน่ง/รายคน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { SaveBar } from "@/components/save-bar";
import { UserPicker } from "@/components/pickers";
import {
  nextWebsiteLevel,
  websiteLevel,
  websiteLevelKeys,
  websiteShopPerm,
  WEBSITE_ACCESS_PERM,
  WEBSITE_GROUPS,
  WEBSITE_LEVEL_LABEL,
  type WebsiteGroup,
  type WebsiteLevel,
} from "@/lib/website-access";

type Shop = { id: string; slug: string; name: string };
type Role = { key: string; label: string; active: boolean | null };
type User = { id: string; name: string; email: string | null; role: string | null; active: boolean };
type Mode = "grant" | "revoke";
type Data = {
  shops: Shop[];
  roles: Role[];
  rolePerms: { role_key: string; permission_key: string }[];
  users: User[];
  overrides: { user_id: string; permission_key: string; mode: Mode }[];
  canRoles: boolean;
};
type RoleSets = Record<string, Set<string>>;
type Overrides = Record<string, Record<string, Mode>>;

const LEVEL_CLS: Record<WebsiteLevel, string> = {
  none: "border-dashed border-slate-300 text-slate-400 bg-white",
  view: "border-emerald-300 bg-emerald-50 text-emerald-800",
  edit: "border-blue-300 bg-blue-50 text-blue-800",
};

const cloneSets = (s: RoleSets): RoleSets => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, new Set(v)]));
const cloneOv = (o: Overrides): Overrides => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v }]));
const anyGroup = (has: (k: string) => boolean) => WEBSITE_GROUPS.some((g) => websiteLevel(has, g.key) !== "none");

/** สิทธิ์จริงของคน = ตำแหน่ง ∪ เปิดรายคน − ปิดรายคน */
const effOf = (role: Set<string> | undefined, ov: Record<string, Mode> | undefined) => (k: string) => (ov?.[k] ? ov[k] === "grant" : !!role?.has(k));

export function WebsiteAccessSettings() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [roles0, setRoles0] = useState<RoleSets>({});
  const [ov0, setOv0] = useState<Overrides>({});
  const [roleSets, setRoleSets] = useState<RoleSets>({});
  const [ov, setOv] = useState<Overrides>({});
  const [people, setPeople] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const j = await apiFetch("/api/website/access").then((r) => r.json()).catch(() => ({ error: "โหลดไม่สำเร็จ" }));
    if (j.error) return setErr(j.error);
    const d = j as Data;
    const rs: RoleSets = {};
    for (const r of d.roles) rs[r.key] = new Set();
    for (const p of d.rolePerms) (rs[p.role_key] ??= new Set()).add(p.permission_key);
    const o: Overrides = {};
    for (const x of d.overrides) (o[x.user_id] ??= {})[x.permission_key] = x.mode;
    setData(d);
    setRoles0(rs);
    setRoleSets(cloneSets(rs));
    setOv0(o);
    setOv(cloneOv(o));
    setPeople(d.users.filter((u) => o[u.id] && u.role !== "admin").map((u) => u.id));
    setErr(null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const shops = data?.shops ?? [];
  const roles = (data?.roles ?? []).filter((r) => r.active !== false);
  const userById = useMemo(() => new Map((data?.users ?? []).map((u) => [u.id, u])), [data]);
  const roleLabel = (key: string | null) => roles.find((r) => r.key === key)?.label ?? key ?? "—";

  // ── แก้ตำแหน่ง ──
  const patchRole = (roleKey: string, keys: Record<string, boolean>) =>
    setRoleSets((prev) => {
      const next = cloneSets(prev);
      const s = (next[roleKey] ??= new Set());
      for (const [k, on] of Object.entries(keys)) (on ? s.add(k) : s.delete(k));
      if (anyGroup((k) => s.has(k))) s.add(WEBSITE_ACCESS_PERM);
      else s.delete(WEBSITE_ACCESS_PERM);
      return next;
    });

  // ── แก้รายคน: ตั้ง "สิทธิ์จริง" ที่อยากได้ → เก็บเป็นยกเว้นเฉพาะช่องที่ต่างจากตำแหน่ง ──
  const patchUser = (userId: string, keys: Record<string, boolean>) =>
    setOv((prev) => {
      const u = userById.get(userId);
      const role = roleSets[u?.role ?? ""];
      const next = cloneOv(prev);
      const mine = { ...(next[userId] ?? {}) };
      const apply = (k: string, on: boolean) => {
        if (on === !!role?.has(k)) delete mine[k];
        else mine[k] = on ? "grant" : "revoke";
      };
      for (const [k, on] of Object.entries(keys)) apply(k, on);
      apply(WEBSITE_ACCESS_PERM, anyGroup(effOf(role, mine)));
      next[userId] = mine;
      return next;
    });

  const resetUser = (userId: string) => setOv((prev) => ({ ...prev, [userId]: {} }));

  // ── ส่วนต่างที่จะบันทึก ──
  const diff = useMemo(() => {
    const roleChanges: { role_key: string; permission_key: string; granted: boolean }[] = [];
    for (const r of roles) {
      if (r.key === "admin") continue;
      const a = roles0[r.key] ?? new Set<string>();
      const b = roleSets[r.key] ?? new Set<string>();
      for (const k of new Set([...a, ...b])) if (a.has(k) !== b.has(k)) roleChanges.push({ role_key: r.key, permission_key: k, granted: b.has(k) });
    }
    const userChanges: { user_id: string; permission_key: string; mode: Mode | "default" }[] = [];
    for (const id of new Set([...Object.keys(ov0), ...Object.keys(ov)])) {
      const a = ov0[id] ?? {};
      const b = ov[id] ?? {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) userChanges.push({ user_id: id, permission_key: k, mode: b[k] ?? "default" });
    }
    return { roleChanges, userChanges };
  }, [roles, roles0, roleSets, ov0, ov]);
  const dirty = diff.roleChanges.length + diff.userChanges.length > 0;

  const save = async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      const j = await apiFetch("/api/website/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: diff.roleChanges, users: diff.userChanges }),
      }).then((r) => r.json());
      if (j.error) setSaveErr(j.error);
      else {
        toast.success("บันทึกสิทธิ์เว็บไซต์แล้ว — มีผลภายใน ~1 นาที (คนนั้นรีเฟรชหน้า)");
        setSavedAt(new Date());
      }
      await load();
    } catch {
      setSaveErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    setRoleSets(cloneSets(roles0));
    setOv(cloneOv(ov0));
    setSaveErr(null);
  };

  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">⚠️ {err}</div>;
  if (!data) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;

  // ── ช่องในตาราง ──
  const levelCell = (has: (k: string) => boolean, g: WebsiteGroup, onSet: ((lv: WebsiteLevel) => void) | null) => {
    const lv = websiteLevel(has, g);
    return (
      <td key={g} className="px-1 py-1">
        <button
          type="button"
          disabled={!onSet}
          onClick={() => onSet?.(nextWebsiteLevel(g, lv))}
          className={`w-full min-w-[64px] rounded-md border px-1.5 py-1 text-xs ${LEVEL_CLS[lv]} ${onSet ? "hover:brightness-95" : "cursor-default opacity-80"}`}
          data-website-level={lv}
        >
          {WEBSITE_LEVEL_LABEL[lv]}
        </button>
      </td>
    );
  };
  const shopCell = (has: (k: string) => boolean, s: Shop, onSet: ((on: boolean) => void) | null) => {
    const on = has(websiteShopPerm(s.slug));
    return (
      <td key={s.id} className="px-1 py-1 text-center">
        <input type="checkbox" checked={on} disabled={!onSet} onChange={(e) => onSet?.(e.target.checked)} className="h-4 w-4 accent-blue-600" aria-label={`เข้าร้าน ${s.name}`} />
      </td>
    );
  };
  const rowCells = (has: (k: string) => boolean, setLevel: ((g: WebsiteGroup, lv: WebsiteLevel) => void) | null, setShop: ((slug: string, on: boolean) => void) | null) => (
    <>
      {WEBSITE_GROUPS.map((g) => levelCell(has, g.key, setLevel ? (lv) => setLevel(g.key, lv) : null))}
      {shops.map((s) => shopCell(has, s, setShop ? (on) => setShop(s.slug, on) : null))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 space-y-2">
        <p>
          กดช่องเพื่อสลับ <b className="font-medium">ไม่เห็น → ดูได้ → แก้ได้</b> · ติ๊กร้านที่เข้าได้ · <b className="font-medium">ตำแหน่ง</b> = ค่าเริ่มของทุกคนในตำแหน่งนั้น ·{" "}
          <b className="font-medium">รายคน</b> = ยกเว้นเฉพาะคน (ชนะตำแหน่ง)
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {WEBSITE_GROUPS.map((g) => (
            <span key={g.key}>
              {g.icon} <span className="text-slate-700">{g.label}</span> = {g.hint}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400">ผู้ดูแลระบบได้ทุกอย่างเสมอ · ไม่เห็นกลุ่มไหนเลย = เมนูเว็บไซต์หายไปเอง · บันทึกแล้วมีผลภายใน ~1 นาที (คนนั้นรีเฟรชหน้า)</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" data-website-access-table>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium">ใคร</th>
              {WEBSITE_GROUPS.map((g) => (
                <th key={g.key} className="px-1 py-2 font-medium" title={g.hint}>
                  {g.icon} {g.label}
                </th>
              ))}
              {shops.map((s, i) => (
                <th key={s.id} className={`px-1 py-2 font-medium ${i === 0 ? "border-l border-slate-200" : ""}`}>
                  🏪 {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <td colSpan={1 + WEBSITE_GROUPS.length + shops.length} className="px-3 pt-2 pb-1 text-[11px] font-medium text-slate-400">
                ตามตำแหน่ง{!data.canRoles && " (ดูอย่างเดียว — แก้ต้องมีสิทธิ์จัดการตำแหน่ง)"}
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                ผู้ดูแลระบบ <span className="text-[11px] text-slate-400">ทุกอย่างเสมอ</span>
              </td>
              {rowCells(() => true, null, null)}
            </tr>
            {roles
              .filter((r) => r.key !== "admin")
              .map((r) => {
                const has = (k: string) => !!roleSets[r.key]?.has(k);
                const editable = data.canRoles;
                return (
                  <tr key={r.key} className="border-b border-slate-100" data-role-row={r.key}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                      {r.label}
                      <span className="ml-1 text-[11px] text-slate-400">{data.users.filter((u) => u.role === r.key && u.active).length} คน</span>
                    </td>
                    {rowCells(
                      has,
                      editable ? (g, lv) => patchRole(r.key, websiteLevelKeys(g, lv)) : null,
                      editable ? (slug, on) => patchRole(r.key, { [websiteShopPerm(slug)]: on }) : null
                    )}
                  </tr>
                );
              })}

            <tr className="border-b border-slate-100 bg-slate-50/50">
              <td colSpan={1 + WEBSITE_GROUPS.length + shops.length} className="px-3 pt-2 pb-1 text-[11px] font-medium text-slate-400">
                ยกเว้นรายคน
              </td>
            </tr>
            {people.map((id) => {
              const u = userById.get(id);
              if (!u) return null;
              const mine = ov[id] ?? {};
              const has = effOf(roleSets[u.role ?? ""], mine);
              const n = Object.keys(mine).length;
              return (
                <tr key={id} className="border-b border-slate-100" data-user-row={id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate">👤 {u.name}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{roleLabel(u.role)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={n ? "text-amber-700" : "text-slate-400"}>{n ? `ต่างจากตำแหน่ง ${n} ข้อ` : "ตามตำแหน่ง"}</span>
                      {n > 0 && (
                        <button type="button" onClick={() => resetUser(id)} className="text-slate-500 hover:text-blue-600">
                          ↺ ตามตำแหน่ง
                        </button>
                      )}
                      {n === 0 && (
                        <button type="button" onClick={() => setPeople((p) => p.filter((x) => x !== id))} className="text-slate-400 hover:text-red-600">
                          เอาออก
                        </button>
                      )}
                    </div>
                  </td>
                  {rowCells(has, (g, lv) => patchUser(id, websiteLevelKeys(g, lv)), (slug, on) => patchUser(id, { [websiteShopPerm(slug)]: on }))}
                </tr>
              );
            })}
            <tr>
              <td colSpan={1 + WEBSITE_GROUPS.length + shops.length} className="px-3 py-2">
                <div className="max-w-xs">
                  <UserPicker
                    value={null}
                    placeholder="＋ เพิ่มคนที่ต้องตั้งต่างจากตำแหน่ง..."
                    onChange={(v) => {
                      const id = v?.id;
                      if (!id) return;
                      if (userById.get(id)?.role === "admin") return toast.info("ผู้ดูแลระบบได้ทุกอย่างเสมอ ไม่ต้องตั้ง");
                      setPeople((p) => (p.includes(id) ? p : [...p, id]));
                    }}
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onDiscard={discard}
        error={saveErr}
        savedAt={savedAt}
        note={dirty ? `${diff.roleChanges.length + diff.userChanges.length} จุดที่เปลี่ยน` : undefined}
      />
    </div>
  );
}
