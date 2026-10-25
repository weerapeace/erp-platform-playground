/**
 * ↕️ จัดเรียง / ซ่อนเมนู "ต่อแอป" (ของกลาง) — erp_menu_items.app_overrides[appKey]
 * (ไฟล์ pure ห้ามใส่ "use client" — API route / เทสต์ import ได้)
 *
 *   app_overrides = { "<appKey>": { section?, label?, sort?, place? } }
 *     - sort  = ลำดับในแอปนั้น (ไม่ตั้ง = sort_order กลาง)
 *     - place = "more"   → ไปรวมในปุ่ม "เพิ่มเติม ▾" (dropdown)
 *               "hidden" → ไม่โชว์ในแอปนั้น (เมนูย่อยของมันหายตาม)
 *               ไม่ตั้ง   → อยู่บนแถบตามปกติ
 *   เมนูเดียวอยู่หลายแอปได้ (app_keys) → ค่าของแอปหนึ่งไม่กระทบอีกแอป
 * ชื่อปุ่มรวมเมนู = erp_app_groups.menu_more_label (ว่าง = "เพิ่มเติม")
 * เป็นค่ากลางทั้งทีม (แอดมินตั้งที่ ⚙️ ตั้งค่าแอป → จัดเรียง / ซ่อนเมนู) · จัดหน้าตาเมนูเท่านั้น — กันเข้าจริงใช้สิทธิ์ตำแหน่งเหมือนเดิม
 * ใช้ที่: แอปเดี่ยว /app/<key> (แถบบน/แถบล่าง/drawer) · เมนูซ้าย PlaygroundShell · PATCH /api/menu (app_override) · components/app-settings-panel
 */

export type AppMenuPlace = "bar" | "more" | "hidden";
export type AppMenuOverride = { section?: string; label?: string; sort?: number; place?: "more" | "hidden" };
export type AppOverrides = Record<string, AppMenuOverride>;
/** ค่าที่หน้าตั้งค่าส่งมาเปลี่ยน — place "bar" = ล้างออก (กลับไปอยู่บนแถบ) */
export type AppMenuOverrideSet = { sort?: number; place?: AppMenuPlace };

type MenuLike = { sort_order: number; label: string; section?: string | null; app_overrides?: unknown };

export const DEFAULT_MORE_LABEL = "เพิ่มเติม";

/** ชื่อปุ่มรวมเมนูของแอป (ว่าง = ค่าเริ่มต้น) */
export function moreLabelOf(app: { menu_more_label?: string | null } | null | undefined): string {
  return app?.menu_more_label?.trim() || DEFAULT_MORE_LABEL;
}

export function appOverride(item: { app_overrides?: unknown }, appKey: string): AppMenuOverride | null {
  const all = item.app_overrides;
  if (!all || typeof all !== "object" || Array.isArray(all)) return null;
  const ov = (all as Record<string, unknown>)[appKey];
  return ov && typeof ov === "object" && !Array.isArray(ov) ? (ov as AppMenuOverride) : null;
}

export function menuPlace(item: { app_overrides?: unknown }, appKey: string): AppMenuPlace {
  const p = appOverride(item, appKey)?.place;
  return p === "more" || p === "hidden" ? p : "bar";
}

export function effectiveSort(item: { sort_order: number; app_overrides?: unknown }, appKey: string): number {
  const s = appOverride(item, appKey)?.sort;
  return typeof s === "number" && Number.isFinite(s) ? s : item.sort_order;
}

/** ใช้ชื่อ/หมวด/ลำดับที่แอปนี้ตั้งไว้ แล้วเรียงตามลำดับของแอป (เท่ากัน = คงลำดับเดิม) */
export function applyAppOverrides<T extends MenuLike>(items: T[], appKey: string): T[] {
  return items
    .map((it) => {
      const ov = appOverride(it, appKey);
      if (!ov) return it;
      return { ...it, label: ov.label ?? it.label, section: ov.section ?? it.section, sort_order: effectiveSort(it, appKey) };
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** รวมค่าใหม่ของแอปนี้เข้า app_overrides เดิม — ไม่ทับค่าของแอปอื่น / ช่อง section,label เดิม · คืน {} ถ้าว่างหมด */
export function mergeAppOverride(raw: unknown, appKey: string, set: AppMenuOverrideSet): AppOverrides {
  const all: AppOverrides = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as AppOverrides) } : {};
  const next: AppMenuOverride = { ...(appOverride({ app_overrides: raw }, appKey) ?? {}) };
  if ("sort" in set) {
    if (typeof set.sort === "number" && Number.isFinite(set.sort)) next.sort = Math.round(set.sort);
    else delete next.sort;
  }
  if ("place" in set) {
    if (set.place === "more" || set.place === "hidden") next.place = set.place;
    else delete next.place;
  }
  if (Object.keys(next).length) all[appKey] = next;
  else delete all[appKey];
  return all;
}

/**
 * แผนบันทึกจากหน้าตั้งค่า: ลำดับใหม่ (id เรียงตามที่ลาก) + ที่อยู่ของแต่ละเมนู → เฉพาะเมนูที่ต้องเปลี่ยน
 * ลำดับ: ถ้าลำดับเดิมเรียงตรงอยู่แล้ว (เพิ่มขึ้นเรื่อย ๆ ไม่ซ้ำ) ไม่เขียน sort · ไม่งั้นให้เลขใหม่ 10, 20, 30… (เขียนเฉพาะตัวที่เลขเปลี่ยน)
 */
export function planLayoutSave(
  items: { id: string; sort_order: number; app_overrides?: unknown }[],
  appKey: string,
  order: string[],
  places: Record<string, AppMenuPlace>,
): { id: string; set: AppMenuOverrideSet }[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const seq = order.filter((id) => byId.has(id));
  const sorts = seq.map((id) => effectiveSort(byId.get(id)!, appKey));
  const inOrder = sorts.every((s, i) => i === 0 || s > sorts[i - 1]);
  const out: { id: string; set: AppMenuOverrideSet }[] = [];
  seq.forEach((id, i) => {
    const it = byId.get(id)!;
    const set: AppMenuOverrideSet = {};
    if (!inOrder && sorts[i] !== (i + 1) * 10) set.sort = (i + 1) * 10;
    const want = places[id] ?? "bar";
    if (want !== menuPlace(it, appKey)) set.place = want;
    if (Object.keys(set).length) out.push({ id, set });
  });
  return out;
}
