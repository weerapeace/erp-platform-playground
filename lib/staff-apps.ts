/**
 * 📱 แอปพนักงาน (Staff Apps) — กฎกลาง (ไฟล์ pure ห้ามใส่ "use client" — API route / เทสต์ import ได้)
 * เอกสาร: docs/staff-apps.md
 *
 * แอปพนักงาน = แถวใน erp_app_groups ที่ kind = 'staff' (ตารางแอปเดิม — ไม่มีตารางแอปที่ 2)
 *   - draft (jsonb)    = ร่างที่แอดมินแก้ในตัวช่วยสร้าง (ชื่อ TH/EN · ไอคอน · สี · หัวข้อ · เมนู · คนเห็น)
 *   - กด "เผยแพร่"     = เขียนร่างลงของจริงตามวิธีเดิมของทุกแอป:
 *        erp_menu_items.app_keys (เมนูอยู่แอปไหน) + app_overrides[appKey] (ชื่อในแอปนี้ TH/EN · หัวข้อ · ลำดับ)
 *        erp_app_groups (ชื่อ · ไอคอน · สี · audience · status='published')
 *     → หน้าแอปเดี่ยว /app/<key> · ตารางสิทธิ์ · "ดูแบบคนนี้" · ติดตั้ง/QR ใช้ของเดิมได้ทั้งหมด
 *   - ทุกครั้งที่เผยแพร่ เก็บร่างลง erp_app_versions → ย้อนกลับได้
 *   - status = 'draft' → พนักงานไม่เห็น (เห็นเฉพาะแอดมิน) · deleted_at มีค่า = อยู่ถังขยะ (กู้คืนได้)
 * ชื่อเมนูในแอปนี้ไม่กระทบชื่อเมนูกลาง (เก็บใน app_overrides ของแอปนี้เท่านั้น)
 */
import { cleanAudience, menuVisibleTo, type MenuAudience } from "@/lib/menu-audience";
import { appOverride, type AppMenuOverride, type AppOverrides } from "@/lib/app-menu-layout";
import { cleanLock, type AppLock } from "@/lib/app-lock";

export type StaffAppSection = { key: string; label: string; label_en?: string };
export type StaffAppMenu = {
  menu_id: string;
  /** key ของหัวข้อ (StaffAppSection.key) · ว่าง = หัวข้อ "ทั่วไป" */
  section?: string;
  /** ชื่อในแอปนี้ (ว่าง = ใช้ชื่อเมนูกลาง) */
  label?: string;
  label_en?: string;
  /** ตัวนับงานค้าง (รอบ 3 — lib/app-counters) */
  counter?: string;
};
export type StaffAppDraft = {
  label: string;
  label_en?: string;
  icon?: string;
  theme_color?: string;
  audience?: MenuAudience | null;
  sections: StaffAppSection[];
  menus: StaffAppMenu[];
  /** 🔒 ล็อกคนกลุ่มนี้ให้อยู่ในแอป (รอบ 2 — lib/app-lock) · ไม่ตั้ง = ไม่ล็อกใคร */
  lock?: AppLock | null;
  /** เมนูนอกแอปที่เปิดดูได้แบบอ่านอย่างเดียว (menu id) — มีผลกับคนที่ถูกล็อก */
  exceptions?: string[];
  /** สิทธิ์ที่แอดมินเพิ่มให้คนถูกล็อกเอง (เผื่อหน้าในแอปเรียกใช้สิทธิ์อื่น) */
  extra_perms?: string[];
};

export const STAFF_APP_LIMITS = { label: 40, menus: 60, sections: 12, sectionLabel: 30, menuLabel: 40 } as const;
export const DEFAULT_SECTION_KEY = "general";

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const KEY = /^[a-z0-9][a-z0-9_-]{0,30}$/;

/** ล้าง/ตรวจร่างที่ส่งมา — ค่าผิดรูปถูกตัดทิ้ง (ไม่ error) · เมนูซ้ำเอาตัวแรก · หัวข้อที่ไม่มีใครใช้ยังเก็บไว้ (แอดมินอาจกำลังจัด) */
export function cleanDraft(raw: unknown): StaffAppDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sections: StaffAppSection[] = [];
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const key = str(o.key, 31).toLowerCase();
    const label = str(o.label, STAFF_APP_LIMITS.sectionLabel);
    if (!KEY.test(key) || !label || sections.some((x) => x.key === key)) continue;
    const en = str(o.label_en, STAFF_APP_LIMITS.sectionLabel);
    sections.push({ key, label, ...(en ? { label_en: en } : {}) });
    if (sections.length >= STAFF_APP_LIMITS.sections) break;
  }
  const seen = new Set<string>();
  const menus: StaffAppMenu[] = [];
  for (const m of Array.isArray(r.menus) ? r.menus : []) {
    const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const id = str(o.menu_id, 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const section = str(o.section, 31).toLowerCase();
    const label = str(o.label, STAFF_APP_LIMITS.menuLabel);
    const en = str(o.label_en, STAFF_APP_LIMITS.menuLabel);
    const counter = str(o.counter, 60);
    menus.push({
      menu_id: id,
      ...(section && sections.some((s) => s.key === section) ? { section } : {}),
      ...(label ? { label } : {}),
      ...(en ? { label_en: en } : {}),
      ...(counter ? { counter } : {}),
    });
    if (menus.length >= STAFF_APP_LIMITS.menus) break;
  }
  const icon = str(r.icon, 64); // ไอคอนเส้นเก็บเป็น "i:<key>#rrggbb" ยาวได้ ~40 ตัว — เผื่อ 64
  const en = str(r.label_en, STAFF_APP_LIMITS.label);
  const color = str(r.theme_color, 7);
  const audience = cleanAudience(r.audience);
  const lock = cleanLock(r.lock);
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 80)).filter(Boolean))].slice(0, max) : []);
  const exceptions = ids(r.exceptions, 40).filter((id) => !seen.has(id));
  const extra = ids(r.extra_perms, 80);
  return {
    label: str(r.label, STAFF_APP_LIMITS.label),
    ...(en ? { label_en: en } : {}),
    ...(icon ? { icon } : {}),
    ...(COLOR.test(color) ? { theme_color: color } : {}),
    ...(audience ? { audience } : {}),
    sections,
    menus,
    ...(lock ? { lock } : {}),
    ...(exceptions.length ? { exceptions } : {}),
    ...(extra.length ? { extra_perms: extra } : {}),
  };
}

/** ตรวจก่อนเผยแพร่ — คืนรายการปัญหา (ภาษาคน) · ว่าง = เผยแพร่ได้ */
export function publishProblems(draft: StaffAppDraft, menuRows: { id: string; is_active?: boolean | null; show_in_sidebar?: boolean | null; label?: string }[]): string[] {
  const out: string[] = [];
  if (!draft.label) out.push("ยังไม่ได้ตั้งชื่อแอป");
  if (!draft.menus.length) out.push("ยังไม่ได้เลือกเมนู (ต้องมีอย่างน้อย 1 เมนู)");
  const byId = new Map(menuRows.map((m) => [m.id, m]));
  const gone = draft.menus.filter((m) => !byId.has(m.menu_id)).length;
  if (gone) out.push(`มี ${gone} เมนูที่ถูกลบออกจากระบบแล้ว — เอาออกจากแอปก่อน`);
  const off = draft.menus.map((m) => byId.get(m.menu_id)).filter((m) => m && (m.is_active === false || m.show_in_sidebar === false));
  if (off.length) out.push(`เมนูที่ปิดใช้ทั้งระบบอยู่: ${off.map((m) => m!.label ?? "").filter(Boolean).join(", ")} — เปิดที่ /admin/menu หรือเอาออก`);
  return out;
}

type MenuRowLike = { id: string; app_keys?: string[] | null; app_overrides?: unknown };
export type MenuPublishPatch = { id: string; app_keys?: string[]; app_overrides?: AppOverrides };

/**
 * แผนเขียนลงเมนูจริงตอนเผยแพร่ — เฉพาะแถวที่ต้องเปลี่ยน
 *   เมนูในร่าง     → ใส่ appKey ใน app_keys + app_overrides[appKey] = { label, label_en, section, section_en, sort, counter }
 *   เมนูนอกร่าง ที่เคยอยู่แอปนี้ → ถอด appKey + ลบ app_overrides[appKey] (แอปอื่นไม่กระทบ)
 */
export function planPublish(draft: StaffAppDraft, rows: MenuRowLike[], appKey: string): MenuPublishPatch[] {
  const secByKey = new Map(draft.sections.map((s) => [s.key, s]));
  const want = new Map(draft.menus.map((m, i) => [m.menu_id, { m, i }]));
  const out: MenuPublishPatch[] = [];
  for (const row of rows) {
    const keys = [...new Set((row.app_keys ?? []).filter(Boolean))];
    const all: AppOverrides = row.app_overrides && typeof row.app_overrides === "object" && !Array.isArray(row.app_overrides) ? { ...(row.app_overrides as AppOverrides) } : {};
    const w = want.get(row.id);
    const patch: MenuPublishPatch = { id: row.id };
    if (w) {
      if (!keys.includes(appKey)) patch.app_keys = [...keys, appKey];
      const sec = w.m.section ? secByKey.get(w.m.section) : undefined;
      const next: AppMenuOverride = { sort: (w.i + 1) * 10 };
      if (w.m.label) next.label = w.m.label;
      if (w.m.label_en) next.label_en = w.m.label_en;
      if (sec) { next.section = sec.label; if (sec.label_en) next.section_en = sec.label_en; }
      if (w.m.counter) next.counter = w.m.counter;
      if (JSON.stringify(appOverride(row, appKey) ?? null) !== JSON.stringify(next)) { all[appKey] = next; patch.app_overrides = all; }
    } else if (keys.includes(appKey) || appKey in all) {
      if (keys.includes(appKey)) patch.app_keys = keys.filter((k) => k !== appKey);
      if (appKey in all) { delete all[appKey]; patch.app_overrides = all; }
    }
    if (patch.app_keys || patch.app_overrides) out.push(patch);
  }
  return out;
}

/** ถอดแอปนี้ออกจากทุกเมนู (ใช้ตอนลบถาวรจากถังขยะ) */
export function planDetachAll(rows: MenuRowLike[], appKey: string): MenuPublishPatch[] {
  return planPublish({ label: "", sections: [], menus: [] }, rows, appKey);
}

type ModuleMenuRow = { id: string; parent_id?: string | null; section?: string | null; label: string; app_overrides?: unknown };

/** ร่างตั้งต้นจากเมนูของแอปเดิม (แม่แบบ / คัดลอก) — rows = เมนูของแอปนั้นเรียงตามแอปแล้ว (appMenuRows) · เมนูที่ซ่อนในแอปนั้นไม่เอามา */
export function draftFromMenus(label: string, rows: ModuleMenuRow[], appKey: string, extra: Partial<StaffAppDraft> = {}): StaffAppDraft {
  const visible = rows.filter((r) => appOverride(r, appKey)?.place !== "hidden");
  const sections: StaffAppSection[] = [];
  const keyOf = new Map<string, string>();
  for (const r of visible) {
    const name = (appOverride(r, appKey)?.section ?? r.section ?? "").trim();
    if (!name || keyOf.has(name) || sections.length >= STAFF_APP_LIMITS.sections) continue;
    const key = `s${sections.length + 1}`;
    keyOf.set(name, key);
    sections.push({ key, label: name.slice(0, STAFF_APP_LIMITS.sectionLabel) });
  }
  const menus: StaffAppMenu[] = visible.slice(0, STAFF_APP_LIMITS.menus).map((r) => {
    const ov = appOverride(r, appKey);
    const name = (ov?.section ?? r.section ?? "").trim();
    return {
      menu_id: r.id,
      ...(keyOf.get(name) ? { section: keyOf.get(name) } : {}),
      ...(ov?.label ? { label: ov.label } : {}),
      ...(ov?.label_en ? { label_en: ov.label_en } : {}),
      ...(ov?.counter ? { counter: ov.counter } : {}),
    };
  });
  return cleanDraft({ ...extra, label, sections, menus });
}

/** แม่แบบสำเร็จรูป = เมนูของแอปหลักเดิม (ตัด/เพิ่มทีหลังได้) */
export const STAFF_APP_TEMPLATES: { key: string; label: string; label_en: string; icon: string }[] = [
  { key: "production", label: "ผลิต", label_en: "Production", icon: "🏭" },
  { key: "inventory", label: "คลังสินค้า", label_en: "Inventory", icon: "📦" },
  { key: "qc", label: "QC", label_en: "QC", icon: "🔍" },
  { key: "purchasing", label: "จัดซื้อ", label_en: "Purchasing", icon: "🛒" },
];

/** key ของแอปใหม่ — "staff-" + เลขสุ่มสั้น ไม่ซ้ำของเดิม (key ใช้ใน URL /app/<key> เปลี่ยนไม่ได้หลังสร้าง) */
export function newStaffAppKey(existing: Iterable<string>, rand: () => number = Math.random): string {
  const taken = new Set(existing);
  for (let i = 0; i < 50; i++) {
    const k = `staff-${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!taken.has(k)) return k;
  }
  return `staff-${Date.now().toString(36)}`;
}

/** ร่างตรงกับเวอร์ชันที่เผยแพร่ล่าสุดไหม (ไม่ตรง = "มีแก้ที่ยังไม่เผยแพร่") */
export function draftChanged(draft: unknown, lastSnapshot: unknown): boolean {
  if (!lastSnapshot) return true;
  return JSON.stringify(cleanDraft(draft)) !== JSON.stringify(cleanDraft(lastSnapshot));
}

type AppRowLike = { kind?: string | null; status?: string | null; deleted_at?: string | null; audience?: unknown };

/**
 * พนักงานคนนี้เห็นแอปนี้ในรายชื่อแอปไหม (GET /api/menu/apps กรองด้วยตัวนี้)
 *   แอปหลักเดิม (module) = เห็นตามเดิม (ล็อกด้วย permission_key ที่หน้าแอป)
 *   แอปพนักงาน: ลบแล้ว / ยังเป็นร่าง = เห็นเฉพาะแอดมิน · ที่เหลือตาม audience (ตำแหน่ง/รายคน — กฎเดียวกับเมนู)
 */
export function appVisibleTo(app: AppRowLike, user: { id?: string | null; role?: string | null } | null | undefined): boolean {
  if (user?.role === "admin") return true;
  if (app.deleted_at) return false;
  if ((app.kind ?? "module") !== "staff") return true;
  if (app.status !== "published") return false;
  if (!user) return false;
  return menuVisibleTo(app.audience, user);
}

/** ชื่อเมนูในแอปนี้ตามภาษา — EN ไม่ได้ตั้ง = ใช้ชื่อไทย */
export function appMenuLabel(item: { label: string; app_overrides?: unknown }, appKey: string, lang: "th" | "en"): string {
  const ov = appOverride(item, appKey);
  if (lang === "en" && ov?.label_en) return ov.label_en;
  return ov?.label ?? item.label;
}

/** ชื่อหัวข้อในแอปนี้ตามภาษา */
export function appMenuSection(item: { section?: string | null; app_overrides?: unknown }, appKey: string, lang: "th" | "en"): string {
  const ov = appOverride(item, appKey);
  if (lang === "en" && ov?.section_en) return ov.section_en;
  return ov?.section ?? item.section ?? "";
}

/** ชื่อแอปตามภาษา */
export function appLabelFor(app: { label: string; label_en?: string | null }, lang: "th" | "en"): string {
  return lang === "en" && app.label_en ? app.label_en : app.label;
}
