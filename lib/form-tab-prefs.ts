/**
 * แท็บที่ "ฉัน" ซ่อนไว้ในลิ้นชัก/ฟอร์มกลาง (MasterCRUD → LayoutTabs) — pure + เทสต์ lib/__tests__/form-tab-prefs.test.ts
 *
 * เจ้าของขอ 2026-11-11: "Tabs อื่นๆ อยากให้สามารถซ่อนได้ด้วย"
 *   • เก็บต่อคน ต่อโมดูล ใน user_ui_prefs key = formHiddenTabsKey(moduleKey) (ผ่าน useUserPref → ตามไปทุกเครื่อง)
 *   • ค่าตั้งต้นของทั้งทีม (ลำดับ/ซ่อน) ยังตั้งที่ตัวออกแบบหน้า (Studio) เหมือนเดิม — อันนี้ซ่อนเพิ่มเฉพาะตัวเอง
 *   • ห้ามซ่อนจนไม่เหลือแท็บ: ถ้าซ่อนหมด → โชว์แท็บแรกไว้ 1 แท็บ
 */
export const formHiddenTabsKey = (scope: string) => `form_hidden_tabs:${scope}`;

/** อ่านค่าที่เก็บไว้ — ผิดรูป = null (ใช้ค่าตั้งต้น) */
export function parseHiddenTabs(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** แท็บที่จะโชว์ (คงลำดับ) — ไม่มีวันว่าง ถ้ามีแท็บอยู่อย่างน้อย 1 */
export function visibleTabKeys(keys: string[], hiddenMine: string[]): string[] {
  const hide = new Set(hiddenMine);
  const shown = keys.filter((k) => !hide.has(k));
  return shown.length > 0 ? shown : keys.slice(0, 1);
}

/** สลับซ่อน/โชว์ 1 แท็บ → ค่าที่จะเก็บใหม่ (ตัดคีย์ที่ไม่มีอยู่แล้วทิ้ง กันค่าค้างจากแท็บที่ถูกลบ) */
export function toggleHiddenTab(keys: string[], hiddenMine: string[], key: string): string[] {
  const set = new Set(hiddenMine.filter((k) => keys.includes(k)));
  if (set.has(key)) set.delete(key); else set.add(key);
  return keys.filter((k) => set.has(k));
}
