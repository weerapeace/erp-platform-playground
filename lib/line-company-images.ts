/**
 * รูปเมนูไลน์บริษัทที่ออกแบบเอง (แทนรูปที่ระบบวาด) — กติกาล้วน · เจ้าของเลือกข้อ 3.1-3.4 (2026-11-23)
 *   ต่อหน้าเมนู (guest/employee/customer/admin + แท็บแอดมิน 2 หน้า) เก็บรูปปัจจุบัน + รูปก่อน ๆ 5 รูป (ย้อนกลับได้)
 *   รูปผูกกับ "จำนวนปุ่มตอนอัป" — ปุ่มเปลี่ยนจำนวน = ช่องกดเปลี่ยนตำแหน่ง → ตอนสร้างเมนูใช้รูปที่ระบบวาดแทน (ไม่ให้กดผิดปุ่ม)
 *   กฎ LINE: กว้าง 2500 · สูง 843 (แถวเดียว) / 1686 (2 แถว) · JPG/PNG ไม่เกิน 1MB
 * ที่เก็บ: line_config.company_images · ไฟล์จริงใน R2 (line-richmenu/…) · API /api/admin/line-company/menu-image · สร้างเมนู lib/line-company-menu
 */
import {
  ADMIN_TABS, adminTabOf, buttonsKindOf, richMenuCell, richMenuSize, richMenuTabCell, visibleButtons,
  type CompanyMenuLayout, type MenuBox, type PublishedMenuKey,
} from "@/lib/line-company";

export const MENU_IMAGE_MAX_BYTES = 1024 * 1024;
export const MENU_IMAGE_HISTORY_MAX = 5;
export const MENU_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export type MenuImage = { r2_key: string; width: number; height: number; count: number; bytes: number; uploaded_at: string; uploaded_by: string | null; name: string };
export type MenuImageSlot = { current: MenuImage | null; history: MenuImage[] };
export type MenuImagesState = { slots: Partial<Record<PublishedMenuKey, MenuImageSlot>>; saved_at: string | null };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function imageOf(raw: unknown): MenuImage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const r2_key = str(o.r2_key);
  if (!r2_key) return null;
  return { r2_key, width: num(o.width), height: num(o.height), count: num(o.count), bytes: num(o.bytes), uploaded_at: str(o.uploaded_at), uploaded_by: str(o.uploaded_by) || null, name: str(o.name) };
}

/** อ่านค่าจาก line_config.company_images (ข้อมูลเสีย/ไม่มี = ว่าง) */
export function menuImagesOf(raw: unknown): MenuImagesState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const src = (o.slots && typeof o.slots === "object" ? o.slots : {}) as Record<string, unknown>;
  const slots: MenuImagesState["slots"] = {};
  for (const [k, v] of Object.entries(src)) {
    const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const history = (Array.isArray(s.history) ? s.history : []).map(imageOf).filter((x): x is MenuImage => !!x).slice(0, MENU_IMAGE_HISTORY_MAX);
    const current = imageOf(s.current);
    if (current || history.length) slots[k as PublishedMenuKey] = { current, history };
  }
  return { slots, saved_at: str(o.saved_at) || null };
}

/** จำนวนปุ่มที่โชว์ของหน้าเมนูนี้ตามเลย์เอาต์ */
export const menuButtonCount = (key: PublishedMenuKey, layout: CompanyMenuLayout) => visibleButtons(layout[buttonsKindOf(key)]).length;

/** ขนาดรูปที่ LINE ต้องการสำหรับหน้านี้ */
export const menuImageTarget = (count: number) => { const { width, height } = richMenuSize(count); return { width, height }; };

/** รูปนี้ใช้กับเมนูตอนนี้ได้ไหม (จำนวนปุ่ม + ขนาดตรง) */
export const menuImageFits = (img: MenuImage | null | undefined, count: number): boolean => {
  if (!img) return false;
  const t = menuImageTarget(count);
  return img.count === count && img.width === t.width && img.height === t.height;
};

/** ช่องกดทั้งหมดของหน้านี้ (แถบแท็บแอดมิน + ปุ่ม) — ใช้วาดเส้นแบ่งทับรูป + แบบเปล่า */
export function menuImageAreas(key: PublishedMenuKey, layout: CompanyMenuLayout): { label: string; box: MenuBox; tab: boolean; on?: boolean }[] {
  const buttons = visibleButtons(layout[buttonsKindOf(key)]);
  const withTabs = !!adminTabOf(key);
  const out: { label: string; box: MenuBox; tab: boolean; on?: boolean }[] = [];
  if (withTabs) ADMIN_TABS.forEach((t, i) => out.push({ label: t.label, box: richMenuTabCell(i), tab: true, on: t.key === key }));
  buttons.forEach((b, i) => out.push({ label: `${i + 1} ${b.label}`, box: richMenuCell(i, buttons.length, withTabs), tab: false }));
  return out;
}

/** ปรับสัดส่วนรูปที่ผู้ใช้เลือกให้เป็นขนาดเป้าหมาย: ตัดขอบกลางรูป (cover) — คืนกรอบที่ตัด · off = สัดส่วนต่างกี่ % */
export function coverCrop(src: { width: number; height: number }, target: { width: number; height: number }): { sx: number; sy: number; sw: number; sh: number; off: number } {
  const want = target.width / target.height;
  const have = src.width / Math.max(1, src.height);
  if (have > want) { const sw = Math.round(src.height * want); return { sx: Math.round((src.width - sw) / 2), sy: 0, sw, sh: src.height, off: Math.abs(have - want) / want }; }
  const sh = Math.round(src.width / want);
  return { sx: 0, sy: Math.round((src.height - sh) / 2), sw: src.width, sh, off: Math.abs(have - want) / want };
}
/** สัดส่วนต่างเกินนี้ = ถามก่อนตัดขอบ */
export const MENU_IMAGE_CROP_WARN = 0.03;

/** ใส่รูปใหม่ (null = กลับไปใช้รูปที่ระบบวาด) — รูปเดิมเก็บเข้าประวัติ (ใหม่สุดก่อน · ไม่ซ้ำ) */
export function setMenuImage(state: MenuImagesState, key: PublishedMenuKey, img: MenuImage | null, now = new Date().toISOString()): MenuImagesState {
  const slot = state.slots[key] ?? { current: null, history: [] };
  const history = [...(slot.current ? [slot.current] : []), ...slot.history].filter((h, i, a) => (!img || h.r2_key !== img.r2_key) && a.findIndex((x) => x.r2_key === h.r2_key) === i).slice(0, MENU_IMAGE_HISTORY_MAX);
  return { slots: { ...state.slots, [key]: { current: img, history } }, saved_at: now };
}

/** ย้อนไปใช้รูปในประวัติลำดับที่ index (รูปปัจจุบันเข้าประวัติแทน) · ไม่มีรูปนั้น = null */
export function revertMenuImage(state: MenuImagesState, key: PublishedMenuKey, index: number, now?: string): MenuImagesState | null {
  const pick = state.slots[key]?.history[index];
  return pick ? setMenuImage(state, key, pick, now) : null;
}
