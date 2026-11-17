// ============================================================
// form-draft — "กู้ข้อมูลที่พิมพ์ค้าง" (ของกลาง · แกน pure เทสต์ได้)
// พิมพ์ฟอร์มค้างแล้วเผลอปิด/รีเฟรช/ไฟดับ → เปิดใหม่มีแถบ "มีข้อมูลที่พิมพ์ค้างไว้ [กู้คืน] [ทิ้ง]"
// เก็บในเครื่องผู้ใช้ (localStorage) เท่านั้น · ไม่ส่งขึ้นเซิร์ฟเวอร์
// ⚠️ ไม่เก็บช่องลับ: ช่องที่ตั้ง sensitive + ชื่อช่องแนวรหัสผ่าน/บัญชีธนาคาร/เลขบัตร/โทเคน · เก็บได้ 7 วัน
// hook: useFormDraft (components/form/use-form-draft.ts) · ใช้แล้วที่ลิ้นชัก MasterCRUD
// ============================================================

export const DRAFT_PREFIX = "erp:draft:";
export const DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;

/** ชื่อช่องที่ห้ามเก็บเด็ดขาด (ไม่สนว่าตั้ง sensitive ไหม) */
const SECRET_KEY = /pass(word)?|pin\b|^pin|otp|token|secret|api_?key|bank_?acc|account_?no|card_?(no|number)|cvv|citizen|national_?id|personal_?id|id_?card|tax_?id|salary|ssn/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** ตัดช่องลับ + ค่าที่ไม่ใช่ข้อมูลธรรมดา (ฟังก์ชัน/ไฟล์) ออก */
export function sanitizeDraft(values: Record<string, unknown>, sensitiveKeys: string[] = []): Record<string, unknown> {
  const skip = new Set(sensitiveKeys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (skip.has(k) || isSecretKey(k)) continue;
    if (typeof v === "function") continue;
    if (typeof File !== "undefined" && v instanceof File) continue;
    out[k] = v;
  }
  return out;
}

export type StoredDraft = { at: number; values: Record<string, unknown> };

export function encodeDraft(values: Record<string, unknown>, sensitiveKeys: string[] = [], now = Date.now()): string {
  return JSON.stringify({ at: now, values: sanitizeDraft(values, sensitiveKeys) } satisfies StoredDraft);
}

/** อ่านร่าง · หมดอายุ/เสีย = null */
export function decodeDraft(raw: string | null, now = Date.now()): StoredDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as StoredDraft;
    if (!o || typeof o.at !== "number" || !o.values || typeof o.values !== "object") return null;
    if (now - o.at > DRAFT_TTL_MS) return null;
    return o;
  } catch { return null; }
}

/** ร่างต่างจากค่าเดิมจริงไหม (ไม่ต่าง = ไม่ต้องถามกู้) */
export function draftDiffers(draft: Record<string, unknown>, base: Record<string, unknown>): boolean {
  const norm = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return Object.keys(draft).some((k) => norm(draft[k]) !== norm(base[k]));
}
