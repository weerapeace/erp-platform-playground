"use client";

/**
 * 🔐 WebsiteAccessSettings — ตั้ง "ใครทำอะไรได้" ในเว็บไซต์ (หน้า /website/access · แท็บ ⚙️ ของแอปจัดการงาน)
 *   แถว = ตำแหน่ง (ค่าเริ่มของทุกคนในตำแหน่ง) + รายคน (ยกเว้นเฉพาะคน · ชนะตำแหน่ง)
 *   คอลัมน์ = 6 กลุ่มงาน (กดสลับ ไม่เห็น → ดูได้ → แก้ได้) + ร้านที่เข้าได้ (ติ๊ก)
 *   website.access (เห็นเมนู) ตั้งให้เอง = เห็นอย่างน้อย 1 กลุ่ม
 *   👷 หน้าตาเว็บ "ดูได้" + ติ๊กหัวข้อดีไซน์ = พนักงานแก้ได้บางหัวข้อ (หน้าดีไซน์แบบง่าย · ส่งให้หัวหน้าเผยแพร่) — ส่วนล่างของหน้า
 *   ร่าง → SaveBar ทีเดียว (POST /api/website/access) · ผู้ดูแลระบบได้ทุกอย่างเสมอ
 * ของกลาง: lib/website-access · SaveBar · UserPicker · ระบบสิทธิ์เดิม (ตำแหน่ง/รายคน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { SaveBar } from "@/components/save-bar";
import { UserPicker } from "@/components/pickers";
import { DESIGN_GROUPS, DESIGN_PAGES } from "@/lib/website-design-nav";
import {
  designAccess,
  designTopicKeys,
  DESIGN_TAB_TOPIC_DEFS,
  DESIGN_TAB_TOPICS,
  DESIGN_TOPIC_PRESETS,
  isDesignTopic,
  type DesignTabTopic,
  websitePerm,
  type DesignTopic,
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

/** ระดับกลุ่ม → คีย์ (หน้าตาเว็บ ไม่ใช่ "ดูได้" = ล้างหัวข้อดีไซน์ — แก้ได้ = ทุกหัวข้ออยู่แล้ว) */
const levelKeys = (g: WebsiteGroup, lv: WebsiteLevel) => (g === "design" && lv !== "view" ? { ...websiteLevelKeys(g, lv), ...designTopicKeys([], false, false) } : websiteLevelKeys(g, lv));
const topicLabel = (t: DesignTopic) => DESIGN_PAGES[t].label;

/** 👷 ตั้งหัวข้อดีไซน์ + 🗂 แท็บอื่น (หน้าแรก/หน้าเว็บ/รูปบนเว็บ) ที่แก้ได้ของแถวหนึ่ง (ตำแหน่ง/คน) — ติ๊กแล้ว "หน้าตาเว็บ" เป็นดูได้ + บางหัวข้อ */
function DesignTopicsEditor({ has, onPatch }: { has: (k: string) => boolean; onPatch: (keys: Record<string, boolean>) => void }) {
  const t = useT();
  const acc = designAccess(has);
  const topics = acc.full ? [] : acc.topics;
  const tabs = acc.full ? [] : acc.tabs;
  const any = topics.length + tabs.length > 0;
  const set = (next: DesignTopic[], nextTabs: DesignTabTopic[] = tabs, publish = acc.full ? false : acc.publish, advanced = acc.full ? false : acc.advanced) =>
    onPatch(
      next.length || nextTabs.length
        ? { ...designTopicKeys(next, publish, advanced, nextTabs), [websitePerm("design", "view")]: true, [websitePerm("design", "edit")]: false }
        : designTopicKeys([], false, false)
    );
  const toggle = (t: DesignTopic) => set(topics.includes(t) ? topics.filter((x) => x !== t) : [...topics, t]);
  const toggleTab = (t: DesignTabTopic) => set(topics, tabs.includes(t) ? tabs.filter((x) => x !== t) : [...tabs, t]);
  return (
    <div className="space-y-2" data-design-topics-editor>
      {acc.full && <p className="text-[11px] text-blue-700">{t("ตอนนี้แก้ได้ทุกหัวข้อ (ช่อง “หน้าตาเว็บ” = แก้ได้) — ติ๊กหัวข้อด้านล่างเพื่อจำกัดให้แก้ได้เฉพาะบางหัวข้อ", "Can edit all topics now (“Design” = Edit) — tick topics below to limit editing to some topics")}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500">{t("ชุดสำเร็จรูป:", "Presets:")}</span>
        {DESIGN_TOPIC_PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => set(p.topics, p.tabs ?? [])} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-700">
            {p.label}
          </button>
        ))}
        {any && (
          <button type="button" onClick={() => set([], [])} className="rounded-full px-2 py-0.5 text-[11px] text-slate-400 hover:text-red-600">
            {t("ล้าง", "Clear")}
          </button>
        )}
      </div>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-6">
        {DESIGN_GROUPS.map((g) => {
          const pages = g.pages.filter(isDesignTopic);
          if (!pages.length) return null;
          return (
            <div key={g.key}>
              <p className="text-[11px] font-medium text-slate-400">{g.label}</p>
              {pages.map((t) => (
                <label key={t} className="flex items-center gap-1.5 py-0.5 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={topics.includes(t)} onChange={() => toggle(t)} className="h-3.5 w-3.5 accent-blue-600" />
                  {topicLabel(t)}
                </label>
              ))}
            </div>
          );
        })}
        {/* 🗂 แท็บอื่นในกลุ่มหน้าตาเว็บ — ติ๊กแล้วแท็บนั้นแก้ได้ (เผยแพร่ตามช่อง "เผยแพร่เองได้") */}
        <div>
          <p className="text-[11px] font-medium text-slate-400">{t("แท็บอื่น (นอกหน้าดีไซน์)", "Other tabs (outside Design)")}</p>
          {DESIGN_TAB_TOPICS.map((t) => (
            <label key={t} className="flex items-center gap-1.5 py-0.5 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={tabs.includes(t)} onChange={() => toggleTab(t)} className="h-3.5 w-3.5 accent-blue-600" />
              {DESIGN_TAB_TOPIC_DEFS[t].label}
            </label>
          ))}
        </div>
      </div>
      <div className={`flex flex-wrap gap-x-5 gap-y-1 text-xs ${any ? "text-slate-700" : "text-slate-400"}`}>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" disabled={!any} checked={!acc.full && acc.publish} onChange={(e) => set(topics, tabs, e.target.checked, acc.advanced)} className="h-3.5 w-3.5 accent-blue-600" />
          {t("เผยแพร่เองได้ (ไม่ติ๊ก = บันทึกร่างแล้วส่งให้หัวหน้าเผยแพร่)", "Can publish (unticked = save draft and send to a lead to publish)")}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" disabled={!topics.length} checked={!acc.full && acc.advanced} onChange={(e) => set(topics, tabs, acc.publish, e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />
          {t("โชว์การตั้งค่าละเอียด (ไม่ติ๊ก = แบบง่าย)", "Show advanced settings (unticked = simple)")}
        </label>
      </div>
    </div>
  );
}

/** สรุปบรรทัดเดียวของแถว */
function designSummary(has: (k: string) => boolean): { text: string; tone: string } {
  const acc = designAccess(has);
  if (acc.full) return { text: tr("แก้ได้ทุกหัวข้อ", "Can edit all topics"), tone: "text-blue-700" };
  if (!acc.topics.length && !acc.tabs.length) return { text: tr("ไม่ได้แก้หน้าดีไซน์", "No Design editing"), tone: "text-slate-400" };
  return {
    text: `${tr("แก้ได้", "Can edit")}: ${[...acc.topics.map(topicLabel), ...acc.tabs.map((x) => tr(`แท็บ${DESIGN_TAB_TOPIC_DEFS[x].label}`, `${DESIGN_TAB_TOPIC_DEFS[x].label} tab`))].join(", ")} · ${acc.publish ? tr("เผยแพร่เองได้", "can publish") : tr("ส่งให้หัวหน้าเผยแพร่", "sends to a lead to publish")}${acc.advanced ? "" : tr(" · แบบง่าย", " · simple")}`,
    tone: "text-amber-800",
  };
}

const cloneSets = (s: RoleSets): RoleSets => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, new Set(v)]));
const cloneOv = (o: Overrides): Overrides => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v }]));
const anyGroup = (has: (k: string) => boolean) => WEBSITE_GROUPS.some((g) => websiteLevel(has, g.key) !== "none");

/** สิทธิ์จริงของคน = ตำแหน่ง ∪ เปิดรายคน − ปิดรายคน */
const effOf = (role: Set<string> | undefined, ov: Record<string, Mode> | undefined) => (k: string) => (ov?.[k] ? ov[k] === "grant" : !!role?.has(k));

export function WebsiteAccessSettings() {
  const toast = useToast();
  const t = useT();
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
  const [topicsOpen, setTopicsOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await apiFetch("/api/website/access").then((r) => r.json()).catch(() => ({ error: tr("โหลดไม่สำเร็จ", "Failed to load") }));
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
        toast.success(t("บันทึกสิทธิ์เว็บไซต์แล้ว — มีผลภายใน ~1 นาที (คนนั้นรีเฟรชหน้า)", "Website permissions saved — takes effect within ~1 minute (that person refreshes the page)"));
        setSavedAt(new Date());
      }
      await load();
    } catch {
      setSaveErr(t("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", "Save failed, please try again"));
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
    const nTopics = g === "design" && lv === "view" ? (({ topics, tabs }) => topics.length + tabs.length)(designAccess(has)) : 0;
    return (
      <td key={g} className="px-1 py-1">
        <button
          type="button"
          disabled={!onSet}
          onClick={() => onSet?.(nextWebsiteLevel(g, lv))}
          className={`w-full min-w-[64px] rounded-md border px-1.5 py-1 text-xs ${nTopics ? "border-amber-300 bg-amber-50 text-amber-800" : LEVEL_CLS[lv]} ${onSet ? "hover:brightness-95" : "cursor-default opacity-80"}`}
          data-website-level={nTopics ? "topics" : lv}
          title={nTopics ? t("ดูได้ + แก้บางหัวข้อ (ตั้งที่ส่วน “หน้าดีไซน์แบบง่าย” ด้านล่าง)", "View + edit some topics (set in “Simple design page” below)") : undefined}
        >
          {nTopics ? t(`แก้บางหัวข้อ (${nTopics})`, `Some topics (${nTopics})`) : WEBSITE_LEVEL_LABEL[lv]}
        </button>
      </td>
    );
  };
  const shopCell = (has: (k: string) => boolean, s: Shop, onSet: ((on: boolean) => void) | null) => {
    const on = has(websiteShopPerm(s.slug));
    return (
      <td key={s.id} className="px-1 py-1 text-center">
        <input type="checkbox" checked={on} disabled={!onSet} onChange={(e) => onSet?.(e.target.checked)} className="h-4 w-4 accent-blue-600" aria-label={t(`เข้าร้าน ${s.name}`, `Access shop ${s.name}`)} />
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
          {t("กดช่องเพื่อสลับ", "Click a cell to cycle")} <b className="font-medium">{t("ไม่เห็น → ดูได้ → แก้ได้", "Hidden → View → Edit")}</b> · {t("ติ๊กร้านที่เข้าได้", "tick the shops they can open")} · <b className="font-medium">{t("ตำแหน่ง", "Role")}</b> = {t("ค่าเริ่มของทุกคนในตำแหน่งนั้น", "default for everyone in that role")} ·{" "}
          <b className="font-medium">{t("รายคน", "Per person")}</b> = {t("ยกเว้นเฉพาะคน (ชนะตำแหน่ง)", "individual exception (overrides role)")}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {WEBSITE_GROUPS.map((g) => (
            <span key={g.key}>
              {g.icon} <span className="text-slate-700">{g.label}</span> = {g.hint}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400">{t("ผู้ดูแลระบบได้ทุกอย่างเสมอ · ไม่เห็นกลุ่มไหนเลย = เมนูเว็บไซต์หายไปเอง · บันทึกแล้วมีผลภายใน ~1 นาที (คนนั้นรีเฟรชหน้า)", "Admins can always do everything · No visible groups = the Website menu disappears · Changes take effect within ~1 minute (that person refreshes the page)")}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" data-website-access-table>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium">{t("ใคร", "Who")}</th>
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
                {t("ตามตำแหน่ง", "By role")}{!data.canRoles && t(" (ดูอย่างเดียว — แก้ต้องมีสิทธิ์จัดการตำแหน่ง)", " (view only — editing needs role-management permission)")}
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                {t("ผู้ดูแลระบบ", "Admin")} <span className="text-[11px] text-slate-400">{t("ทุกอย่างเสมอ", "always everything")}</span>
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
                      <span className="ml-1 text-[11px] text-slate-400">{t(`${data.users.filter((u) => u.role === r.key && u.active).length} คน`, `${data.users.filter((u) => u.role === r.key && u.active).length} people`)}</span>
                    </td>
                    {rowCells(
                      has,
                      editable ? (g, lv) => patchRole(r.key, levelKeys(g, lv)) : null,
                      editable ? (slug, on) => patchRole(r.key, { [websiteShopPerm(slug)]: on }) : null
                    )}
                  </tr>
                );
              })}

            <tr className="border-b border-slate-100 bg-slate-50/50">
              <td colSpan={1 + WEBSITE_GROUPS.length + shops.length} className="px-3 pt-2 pb-1 text-[11px] font-medium text-slate-400">
                {t("ยกเว้นรายคน", "Per-person exceptions")}
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
                      <span className={n ? "text-amber-700" : "text-slate-400"}>{n ? t(`ต่างจากตำแหน่ง ${n} ข้อ`, `${n} differences from role`) : t("ตามตำแหน่ง", "Same as role")}</span>
                      {n > 0 && (
                        <button type="button" onClick={() => resetUser(id)} className="text-slate-500 hover:text-blue-600">
                          {t("↺ ตามตำแหน่ง", "↺ Reset to role")}
                        </button>
                      )}
                      {n === 0 && (
                        <button type="button" onClick={() => setPeople((p) => p.filter((x) => x !== id))} className="text-slate-400 hover:text-red-600">
                          {t("เอาออก", "Remove")}
                        </button>
                      )}
                    </div>
                  </td>
                  {rowCells(has, (g, lv) => patchUser(id, levelKeys(g, lv)), (slug, on) => patchUser(id, { [websiteShopPerm(slug)]: on }))}
                </tr>
              );
            })}
            <tr>
              <td colSpan={1 + WEBSITE_GROUPS.length + shops.length} className="px-3 py-2">
                <div className="max-w-xs">
                  <UserPicker
                    value={null}
                    placeholder={t("＋ เพิ่มคนที่ต้องตั้งต่างจากตำแหน่ง...", "＋ Add a person with different settings from their role...")}
                    onChange={(v) => {
                      const id = v?.id;
                      if (!id) return;
                      if (userById.get(id)?.role === "admin") return toast.info(t("ผู้ดูแลระบบได้ทุกอย่างเสมอ ไม่ต้องตั้ง", "Admins can always do everything — no need to set"));
                      setPeople((p) => (p.includes(id) ? p : [...p, id]));
                    }}
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 👷 หน้าดีไซน์แบบง่ายสำหรับพนักงาน — แก้ได้บางหัวข้อ */}
      <div className="rounded-xl border border-slate-200 bg-white" data-design-topics>
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">{t("หน้าดีไซน์แบบง่ายสำหรับพนักงาน — เลือกหัวข้อที่แก้ได้", "Simple design page for staff — choose editable topics")}</p>
          <p className="text-xs text-slate-500">
            {t("ติ๊กหัวข้อแล้วคนนั้นเปิดแท็บดีไซน์จะเห็นแค่หัวข้อนั้น · บันทึกได้เฉพาะหัวข้อที่ติ๊ก (ระบบกันฝั่งเซิร์ฟเวอร์) · ไม่ให้เผยแพร่เอง = แก้แล้วกด “ส่งให้หัวหน้าตรวจ” (เด้งกระดิ่งถึงคนที่แก้ดีไซน์ได้ทุกหัวข้อ)", "Tick topics and that person only sees those topics in the Design tab · Only ticked topics can be saved (enforced on the server) · No publish = they edit, then click “Send to lead for review” (notifies people who can edit all design topics)")}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            ...roles.filter((r) => r.key !== "admin").map((r) => ({ id: `role:${r.key}`, name: r.label, sub: t("ตำแหน่ง", "Role"), has: (k: string) => !!roleSets[r.key]?.has(k), patch: data.canRoles ? (keys: Record<string, boolean>) => patchRole(r.key, keys) : null })),
            ...people.flatMap((id) => {
              const u = userById.get(id);
              return u ? [{ id: `user:${id}`, name: u.name, sub: roleLabel(u.role), has: effOf(roleSets[u.role ?? ""], ov[id]), patch: (keys: Record<string, boolean>) => patchUser(id, keys) }] : [];
            }),
          ].map((row) => {
            const sum = designSummary(row.has);
            const open = topicsOpen === row.id;
            return (
              <div key={row.id} className="px-4 py-2" data-design-topics-row={row.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-800">{row.name}</span>
                  <span className="text-[11px] text-slate-400">{row.sub}</span>
                  <span className={`min-w-0 flex-1 truncate text-xs ${sum.tone}`}>{sum.text}</span>
                  {row.patch ? (
                    <button type="button" onClick={() => setTopicsOpen(open ? null : row.id)} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-700">
                      {open ? t("ปิด", "Close") : t("ตั้งหัวข้อ", "Set topics")}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">{t("ดูอย่างเดียว", "View only")}</span>
                  )}
                </div>
                {open && row.patch && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <DesignTopicsEditor has={row.has} onPatch={row.patch} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="px-4 py-2 text-[11px] text-slate-400">{t("ตั้งรายคน: เพิ่มคนในตารางด้านบน (“＋ เพิ่มคนที่ต้องตั้งต่างจากตำแหน่ง”) แล้วเขาจะขึ้นในรายการนี้", "Per person: add people in the table above (“＋ Add a person…”) and they will appear in this list")}</p>
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onDiscard={discard}
        error={saveErr}
        savedAt={savedAt}
        note={dirty ? t(`${diff.roleChanges.length + diff.userChanges.length} จุดที่เปลี่ยน`, `${diff.roleChanges.length + diff.userChanges.length} changes`) : undefined}
      />
    </div>
  );
}
