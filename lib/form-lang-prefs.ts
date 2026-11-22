/**
 * ภาษาที่ "แสดง" ในลิ้นชัก/ฟอร์มกลาง (MasterCRUD) — ปุ่ม ⚙ ท้ายแถบภาษา · pure + เทสต์ lib/__tests__/form-lang-prefs.test.ts
 *
 * เจ้าของขอ 2026-11-22: "อยากได้ปุ่มตั้งค่า ว่าจะโชว์ภาษาไหนบ้างจะได้ดูไม่รก" (เลือกข้อเสนอ 1-5 ครบ)
 *   • ไทย = ภาษาหลัก แสดงเสมอ (ปิดไม่ได้) · ภาษาอื่น (en / ja …) ติ๊กเปิด/ปิดได้
 *   • ปิดแล้ว "แค่ซ่อน" — คำแปลที่บันทึกไว้ไม่หาย (ปุ่มภาษา + ป้าย TH/EN ข้างหัวข้อทุกช่องหายไปด้วย)
 *   • ลำดับที่ใช้: ค่าของฉัน (user_ui_prefs key = formLangsKey(scope) ผ่าน useUserPref → ตามไปทุกเครื่อง)
 *       → ค่าเริ่มต้นที่แอดมินตั้ง (ui_config FORM_LANG_TEAM_KEY = { [scope]: string[] } แก้ได้เฉพาะ admin.users)
 *       → ทุกภาษาที่ฟอร์มมี
 *   • "คืนค่าเริ่มต้น" = ล้างค่าของฉัน (เก็บ null) → กลับไปใช้ค่าแอดมิน/ทุกภาษา
 */
export const formLangsKey = (scope: string) => `form_langs:${scope}`;
/** ui_config — ขึ้นต้น admin_ = แอดมินเท่านั้นที่แก้ได้ (อ่านได้ทุกคนที่ล็อกอิน: LOGIN_READ_KEYS ใน /api/ui-config) */
export const FORM_LANG_TEAM_KEY = "admin_form_langs";

const CODE_RE = /^[a-z]{2}$/;

/** อ่านรายการภาษาที่เก็บไว้ — ผิดรูป/ไม่เคยตั้ง = null (ใช้ค่าถัดไป) · ไทยไม่ต้องเก็บ (แสดงเสมอ) */
export function parseLangList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return Array.from(new Set(raw.filter((x): x is string => typeof x === "string" && CODE_RE.test(x) && x !== "th")));
}

/** ค่าเริ่มต้นของทีมสำหรับฟอร์มนี้ (จากก้อน ui_config) — ไม่มี = null */
export function teamLangsFor(teamValue: unknown, scope: string): string[] | null {
  if (!teamValue || typeof teamValue !== "object" || Array.isArray(teamValue)) return null;
  return parseLangList((teamValue as Record<string, unknown>)[scope]);
}

/**
 * ภาษาอื่นที่จะแสดง (คงลำดับของ available) — ไม่รวมไทย
 *   mine (ค่าของฉัน) > team (ค่าแอดมิน) > ทุกภาษาที่ฟอร์มมี · ภาษาที่ฟอร์มไม่มีแล้วถูกตัดทิ้ง
 */
export function resolveShownLangs(available: string[], mine: string[] | null, team: string[] | null): string[] {
  const pick = mine ?? team;
  const others = available.filter((l) => l !== "th");
  if (!pick) return others;
  const set = new Set(pick);
  return others.filter((l) => set.has(l));
}

/** โหมดที่เลือกไว้ ("th" / "en" / "th|ja") ยังใช้ได้ไหม — ถ้าภาษาในโหมดถูกซ่อน = กลับเป็น "th" (ไม่เปลี่ยนค่าที่จำไว้) */
export function effectiveLangMode(mode: string, shown: string[]): string {
  const langs = mode.split("|");
  return langs.every((l) => l === "th" || shown.includes(l)) ? mode : "th";
}

/** สลับเปิด/ปิด 1 ภาษา → รายการใหม่ (คงลำดับ available) */
export function toggleLang(available: string[], shown: string[], lang: string): string[] {
  const set = new Set(shown);
  if (set.has(lang)) set.delete(lang); else set.add(lang);
  return available.filter((l) => l !== "th" && set.has(l));
}

/** เขียนค่าเริ่มต้นของทีม 1 ฟอร์มลงก้อนเดิม (null = ลบ → ทุกภาษา) — ไม่แตะฟอร์มอื่น */
export function withTeamLangs(teamValue: unknown, scope: string, langs: string[] | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (teamValue && typeof teamValue === "object" && !Array.isArray(teamValue)) {
    for (const [k, v] of Object.entries(teamValue as Record<string, unknown>)) { const p = parseLangList(v); if (p) out[k] = p; }
  }
  if (langs) out[scope] = langs; else delete out[scope];
  return out;
}
