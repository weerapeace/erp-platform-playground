/**
 * ตัว Pet ลอย (ของกลาง · ล้วน ๆ ไม่มี React — ใช้ได้ทั้งจอและเทสต์)
 * ตัว Pet แทนปุ่ม "งานค้าง" มุมจอ — กดแล้วเปิดศูนย์แจ้งเตือน (แท็บ งาน / GIF / แอปอื่นในอนาคต)
 * ที่มาของตัว: ตัวในระบบ (วาดด้วยโค้ด) · GIF (คลัง GIF ของ "ส่ง GIF ให้เพื่อน" หรืออัปเอง) · Lottie (ไฟล์ .json ขยับได้)
 * เก็บต่อคนใน user_ui_prefs (work_popup_float.pet / pet_size)
 */
export type BuiltinPetId = "cat" | "slime" | "bot";
export type PetSource =
  | { kind: "builtin"; id: BuiltinPetId }
  | { kind: "gif"; src: string; name?: string }      // src = ลิงก์ https หรือ R2 key
  | { kind: "lottie"; src: string; name?: string };  // src = ลิงก์ .json หรือ R2 key
export type PetSize = "s" | "m" | "l";
/** alert = มีงานใหม่/ถึงเวลา หรือ GIF ใหม่ (กระโดด + ฟองข้อความ) · idle = มีของค้างปกติ (ลอยเบา ๆ) · sleep = ไม่มีอะไร (นอน) */
export type PetMood = "alert" | "idle" | "sleep";

export const BUILTIN_PETS: { id: BuiltinPetId; th: string; en: string }[] = [
  { id: "cat", th: "แมว", en: "Cat" },
  { id: "slime", th: "สไลม์", en: "Slime" },
  { id: "bot", th: "หุ่นยนต์", en: "Robot" },
];
export const DEFAULT_PET: PetSource = { kind: "builtin", id: "cat" };
export const PET_PX: Record<PetSize, number> = { s: 56, m: 72, l: 96 };

const MAX_SRC = 1000;
export function parsePetSource(raw: unknown): PetSource | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { kind?: unknown; id?: unknown; src?: unknown; name?: unknown };
  if (r.kind === "builtin") return BUILTIN_PETS.some((p) => p.id === r.id) ? { kind: "builtin", id: r.id as BuiltinPetId } : null;
  if ((r.kind === "gif" || r.kind === "lottie") && typeof r.src === "string") {
    const src = r.src.trim();
    if (!src || src.length > MAX_SRC) return null;
    // ลิงก์ต้องเป็น https · ไม่ใช่ลิงก์ = R2 key (ห้ามมีช่องว่าง/ขึ้นต้นด้วย / หรือ ..)
    if (/^[a-z]+:/i.test(src) ? !/^https:\/\//i.test(src) : /\s|^\/|\.\./.test(src)) return null;
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 80) : undefined;
    return name ? { kind: r.kind, src, name } : { kind: r.kind, src };
  }
  return null;
}
export const parsePetSize = (v: unknown): PetSize => (v === "s" || v === "l" ? v : "m");

/** ลิงก์ไฟล์ของตัว Pet — https ใช้ตรง · R2 key ผ่าน proxy (ไม่ย่อ — ย่อแล้ว GIF หยุดขยับ) */
export function petFileUrl(src: string): string {
  return /^https:\/\//i.test(src) ? src : `/api/r2-image?key=${encodeURIComponent(src)}`;
}

/** อารมณ์ของ Pet จากของที่ค้าง */
export function petMood(o: { total: number; alert: boolean }): PetMood {
  if (o.total <= 0) return "sleep";
  return o.alert ? "alert" : "idle";
}

/** ค่าตั้งต่อคน (user_ui_prefs key floating_pet) */
export type FloatingPetPref = { source: PetSource; size: PetSize };
export const FLOATING_PET_KEY = "floating_pet";
export const FLOATING_PET_DEFAULT: FloatingPetPref = { source: DEFAULT_PET, size: "m" };
export function parseFloatingPetPref(raw: unknown): FloatingPetPref | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { source?: unknown; size?: unknown };
  return { source: parsePetSource(r.source) ?? DEFAULT_PET, size: parsePetSize(r.size) };
}

/** ตัวเลขบน Pet (เกิน 99 = 99+) · 0 = ไม่โชว์ */
export const petBadge = (n: number): string | null => (n <= 0 ? null : n > 99 ? "99+" : String(n));
