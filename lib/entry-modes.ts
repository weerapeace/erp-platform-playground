/**
 * โหมดลงรายละเอียด (Entry Modes) — ของกลาง ใช้ได้ทุกโมดูลที่เปิดผ่าน drawer กลาง (MasterCRUD)
 *
 * โหมด = "ชุดช่องที่ต้องลงสำหรับงานหนึ่ง" เช่น ลงขายเว็บไซต์ / ลง Shopee-Lazada / วัดขนาด
 *   - กดเข้าโหมด → drawer โชว์เฉพาะช่องของโหมดนั้น + นับความครบ + เตือนช่องที่ยังว่าง + คำแนะนำต่อช่อง
 *   - เตือนอย่างเดียว ไม่กันบันทึก (เจ้าของเคาะ 2026-10-22)
 *
 * เก็บใน erp_modules.config.entry_modes (บันทึกผ่าน POST /api/admin/entry-modes · อ่านกลับผ่าน field-registry-v2)
 *   ไม่มีค่า (undefined/null) = ใช้ชุดตั้งต้นในโค้ด (ENTRY_MODE_DEFAULTS) · [] = ตั้งใจไม่มีโหมด
 * ช่องที่ประเภทสินค้า (Product Family) ซ่อน / เงื่อนไขโชว์ไม่ผ่าน / ไม่มีสิทธิ์เห็น → ไม่นับ (ตัดที่ผู้เรียกผ่าน opts.skip)
 */

export type EntryModeLevel = "required" | "recommended";

export type EntryModeItem = {
  /** field_key ในทะเบียนฟิลด์ */
  field: string;
  level: EntryModeLevel;
  /** คำแนะนำเฉพาะโหมดนี้ — ว่าง = ใช้ help_text ของทะเบียนฟิลด์ */
  hint?: string;
};

export type EntryMode = {
  key: string;
  label: string;
  icon?: string;
  /** role ที่เห็นโหมดนี้ — ว่าง = ทุกคน (admin เห็นเสมอ) */
  roles?: string[];
  /** ใช้เฉพาะสินค้าที่ติด Product Family เหล่านี้ (id) — ว่าง = ทุกประเภท */
  families?: string[];
  items: EntryModeItem[];
  /** เงื่อนไขพิเศษ: ต้องมีรูปในแกลเลอรีอย่างน้อย N รูป (0/ไม่มี = ไม่เช็ก) */
  imagesMin?: number;
  imagesLevel?: EntryModeLevel;
  imagesHint?: string;
};

/** key พิเศษของเงื่อนไข "จำนวนรูป" ในรายการที่ขาด */
export const IMAGES_KEY = "__images";

/** สรุปทั้งระบบต่อโหมด (คำนวณฝั่งเซิร์ฟเวอร์ lib/entry-modes-server · GET /api/entry-modes/stats) */
export type EntryModeStat = {
  key: string; label: string; icon?: string;
  /** total = รายการที่เปิดใช้อยู่ · incomplete = ยังขาดช่อง "ต้องมี" · recOnly = ช่องต้องมีครบแล้ว ขาดแค่ช่องแนะนำ */
  total: number; incomplete: number; recOnly: number;
  /** ขาดช่องไหนกี่ตัว (เรียงตามลำดับในโหมด · key = field_key หรือ __images) */
  byItem: { key: string; label: string; level: EntryModeLevel; missing: number }[];
};

/** โมดูลที่มีแกลเลอรีรูปสินค้า (นับรูปฝั่งเซิร์ฟเวอร์ได้) → entity_type ของรูปใน erp_playground_attachments */
export const ENTRY_MODE_IMAGE_ENTITY: Record<string, string> = { "parent-skus-v2": "parent_skus_v2", "skus-v2": "skus_v2" };
/** หน้าตารางของโมดูล (ลิงก์ "ดูรายการที่ยังไม่ครบ" จากป๊อปที่เปิดจากที่อื่น / รายงาน) */
export const ENTRY_MODE_LIST_HREF: Record<string, string> = { "parent-skus-v2": "/master/parent-skus", "skus-v2": "/master/skus" };
/** ลิงก์หน้าตารางที่กรองเฉพาะ "ยังไม่ครบโหมดนี้" / ลิงก์เปิดรายการนั้นแล้วเข้าโหมดเลย */
export function entryModeListHref(moduleKey: string, modeKey: string): string | null {
  const base = ENTRY_MODE_LIST_HREF[moduleKey];
  return base ? `${base}?mode_incomplete=${encodeURIComponent(modeKey)}` : null;
}
export function entryModeOpenHref(moduleKey: string, modeKey: string, id: string): string | null {
  const base = ENTRY_MODE_LIST_HREF[moduleKey];
  return base ? `${base}?open=${encodeURIComponent(id)}&entry_mode=${encodeURIComponent(modeKey)}` : null;
}

export type EntryModeMissing = { key: string; level: EntryModeLevel };

export type EntryModeProgress = {
  total: number; done: number;
  reqTotal: number; reqDone: number;
  recTotal: number; recDone: number;
  /** ช่องที่ยังไม่ลง เรียงตามลำดับในโหมด (key = field_key หรือ IMAGES_KEY) */
  missing: EntryModeMissing[];
  /** ช่องที่นับจริง (ตัดช่องที่ skip ออกแล้ว) */
  counted: Set<string>;
  pct: number;
};

// ข้อความ "ขีดไว้" ที่ข้อมูลนำเข้าเก่าใช้แทนค่าว่าง → ถือว่ายังไม่ลง
const PLACEHOLDER = new Set(["-", "--", "—", "–", ".", "_", "n/a", "na"]);

/** ช่องนี้ "ลงแล้ว" ไหม — ข้อความ/ตัวเลข/รายการ/ออบเจกต์ · ติ๊กใช่-ไม่ใช่ = ต้องติ๊ก "ใช่" ถึงนับว่าลงแล้ว */
export function isValueFilled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") { const s = v.trim(); return s !== "" && !PLACEHOLDER.has(s.toLowerCase()); }
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

export function computeModeProgress(
  mode: EntryMode,
  values: Record<string, unknown>,
  opts: { skip?: (field: string) => boolean; imageCount?: number | null } = {},
): EntryModeProgress {
  const missing: EntryModeMissing[] = [];
  const counted = new Set<string>();
  let reqTotal = 0, reqDone = 0, recTotal = 0, recDone = 0;
  const tally = (key: string, level: EntryModeLevel, ok: boolean) => {
    counted.add(key);
    if (level === "required") { reqTotal++; if (ok) reqDone++; } else { recTotal++; if (ok) recDone++; }
    if (!ok) missing.push({ key, level });
  };
  for (const it of mode.items) {
    if (opts.skip?.(it.field)) continue;
    tally(it.field, it.level, isValueFilled(values[it.field]));
  }
  // จำนวนรูป: ยังไม่รู้ (null/undefined) = ยังไม่นับ (กันขึ้นเตือนผิดระหว่างโหลด)
  if ((mode.imagesMin ?? 0) > 0 && opts.imageCount != null) {
    tally(IMAGES_KEY, mode.imagesLevel ?? "required", opts.imageCount >= (mode.imagesMin ?? 0));
  }
  const total = reqTotal + recTotal, done = reqDone + recDone;
  return { total, done, reqTotal, reqDone, recTotal, recDone, missing, counted, pct: total ? Math.round((done / total) * 100) : 100 };
}

/**
 * รายการนี้ "ยังไม่ครบโหมด" ไหม — นับเฉพาะช่อง "ต้องมี" (ช่องแนะนำขาดได้ ไม่นับว่าไม่ครบ)
 * โหมดที่ไม่มีช่องต้องมีเลย → ขาดอะไรก็ได้ = ไม่ครบ · ใช้ทุกที่: ตัวนับทั้งระบบ / ตัวกรองตาราง / รายงาน / ตัวถัดไปที่ยังไม่ครบ
 */
export function isModeIncomplete(p: EntryModeProgress): boolean {
  return p.reqTotal > 0 ? p.reqDone < p.reqTotal : p.missing.length > 0;
}

/** โหมดนี้ผู้ใช้ role นี้เห็นไหม (admin เห็นเสมอ) */
export function modeVisibleTo(mode: EntryMode, role: string | null | undefined): boolean {
  if (!mode.roles || mode.roles.length === 0) return true;
  return role === "admin" || (!!role && mode.roles.includes(role));
}

/** โหมดนี้ใช้กับสินค้าที่ติดแท็กเหล่านี้ไหม (ไม่จำกัด = ใช้ได้ทุกตัว) */
export function modeAppliesTo(mode: EntryMode, familyIds: string[]): boolean {
  if (!mode.families || mode.families.length === 0) return true;
  return familyIds.some((id) => mode.families!.includes(id));
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))] : [];
const level = (v: unknown): EntryModeLevel => (v === "recommended" ? "recommended" : "required");

/** ทำความสะอาดค่าที่รับมา (จาก DB หรือจากหน้าตั้งค่า) — ตัดของเสีย/ซ้ำ · ใช้ทั้งฝั่ง API และหน้าเว็บ */
export function normalizeEntryModes(raw: unknown): EntryMode[] {
  if (!Array.isArray(raw)) return [];
  const out: EntryMode[] = [];
  const keys = new Set<string>();
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const label = str(r.label, 60);
    if (!label) continue;
    let key = str(r.key, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `m${out.length + 1}`;
    while (keys.has(key)) key = `${key}_${out.length + 1}`;
    keys.add(key);
    const seen = new Set<string>();
    const items: EntryModeItem[] = [];
    for (const it of Array.isArray(r.items) ? r.items : []) {
      if (!it || typeof it !== "object") continue;
      const ir = it as Record<string, unknown>;
      const field = str(ir.field, 80);
      if (!field || seen.has(field)) continue;
      seen.add(field);
      const hint = str(ir.hint, 300);
      items.push({ field, level: level(ir.level), ...(hint ? { hint } : {}) });
    }
    const imagesMin = Math.max(0, Math.min(50, Math.round(Number(r.imagesMin) || 0)));
    const mode: EntryMode = { key, label, items };
    const icon = str(r.icon, 8); if (icon) mode.icon = icon;
    const roles = strList(r.roles); if (roles.length) mode.roles = roles;
    const families = strList(r.families); if (families.length) mode.families = families;
    if (imagesMin > 0) {
      mode.imagesMin = imagesMin;
      mode.imagesLevel = level(r.imagesLevel);
      const ih = str(r.imagesHint, 300); if (ih) mode.imagesHint = ih;
    }
    out.push(mode);
  }
  return out.slice(0, 30);
}

/** ชุดโหมดที่ใช้จริง: ที่ตั้งไว้ใน DB (มี key entry_modes) ชนะ · ไม่เคยตั้ง = ชุดตั้งต้นในโค้ด */
export function resolveEntryModes(moduleKey: string | undefined, stored: unknown): EntryMode[] {
  if (Array.isArray(stored)) return normalizeEntryModes(stored);
  return moduleKey ? (ENTRY_MODE_DEFAULTS[moduleKey] ?? []) : [];
}

// ── ชุดตั้งต้น (แก้/เพิ่ม/ลบได้ในหน้าตั้งค่า — บันทึกแล้วค่าใน DB ชนะ) ──
const SIZE_HINT = "วัดด้านนอกตัวสินค้า หน่วยเซนติเมตร (ไม่รวมสาย/ห่วง)";
export const ENTRY_MODE_DEFAULTS: Record<string, EntryMode[]> = {
  "parent-skus-v2": [
    {
      key: "web", label: "ลงขายเว็บไซต์", icon: "🛍",
      items: [
        { field: "name_th", level: "required", hint: "แบรนด์ + ประเภทสินค้า + ชื่อรุ่น + รหัส เช่น Louis Montini พวงกุญแจรูปหัวใจ รุ่น Pixie Duo Heart PIX19" },
        { field: "name_en", level: "required", hint: "ชื่อภาษาอังกฤษ — กด 🌐 แปลจากไทย แล้วค่อยเกลา เช่น Pixie Duo Heart Keychain PIX19" },
        { field: "platform_category_id", level: "required", hint: "หมวดที่ลูกค้าจะค้นเจอ — ระบบใช้จับคู่หมวดของแต่ละแพลตฟอร์มให้เอง" },
        { field: "introduction", level: "required", hint: "2–3 ประโยคเล่าเรื่อง/ความรู้สึกของสินค้า ไม่ต้องใส่สเปก (ปุ่ม ✨ ให้ AI คิดรายละเอียด ช่วยร่างได้)" },
        { field: "description", level: "required", hint: "เขียนเป็นข้อ ๆ: วัสดุ / ช่องใส่ของ / วิธีดูแล" },
        { field: "size_length_cm", level: "required", hint: SIZE_HINT },
        { field: "size_height_cm", level: "required", hint: SIZE_HINT },
        { field: "size_thickness_cm", level: "required", hint: SIZE_HINT },
        { field: "weight_g", level: "required", hint: "ชั่งตัวสินค้าเปล่า ไม่รวมกล่อง หน่วยกรัม" },
        { field: "english_description", level: "recommended", hint: "คำอธิบายภาษาอังกฤษ — กด 🌐 แปลจากไทย แล้วค่อยเกลา" },
        { field: "fits", level: "recommended", hint: "เลือกของที่ใส่ได้จากรายการกลาง เช่น มือถือ / กุญแจ / บัตร" },
        { field: "warranty", level: "recommended", hint: "ใส่ตามนโยบายแบรนด์ ปกติ 6 เดือน" },
      ],
      imagesMin: 3, imagesLevel: "required",
      imagesHint: "รูปหน้า / หลัง / ข้าง + รูปตอนใช้งานจริง — เพิ่ม/ลากรูปที่ช่อง \"รูปสินค้า\"",
    },
    {
      key: "marketplace", label: "ลง Shopee / Lazada", icon: "🏬",
      items: [
        { field: "name_th", level: "required", hint: "แบรนด์ + ประเภทสินค้า + ชื่อรุ่น + รหัส (ชื่อสำหรับแพลตฟอร์มประกอบจากช่องนี้ให้เอง)" },
        { field: "platform_category_id", level: "required", hint: "หมวดกลาง — ระบบแปลงเป็นหมวดของ Shopee / Lazada ให้เอง" },
        { field: "description", level: "required", hint: "เขียนเป็นข้อ ๆ: วัสดุ / ช่องใส่ของ / วิธีดูแล" },
        { field: "size_length_cm", level: "required", hint: SIZE_HINT },
        { field: "size_height_cm", level: "required", hint: SIZE_HINT },
        { field: "size_thickness_cm", level: "required", hint: SIZE_HINT },
        { field: "weight_g", level: "required", hint: "ชั่งตัวสินค้าเปล่า ไม่รวมกล่อง หน่วยกรัม — แพลตฟอร์มใช้คิดค่าส่ง" },
        { field: "parcel_size_id", level: "required", hint: "ขนาดกล่องที่ใช้ส่ง — แพลตฟอร์มใช้คิดค่าส่ง" },
        { field: "warranty", level: "recommended", hint: "ใส่ตามนโยบายแบรนด์ ปกติ 6 เดือน" },
        { field: "shopee_url", level: "recommended", hint: "ลิงก์หน้าสินค้าบน Shopee หลังลงขายแล้ว" },
        { field: "lazada_url", level: "recommended", hint: "ลิงก์หน้าสินค้าบน Lazada หลังลงขายแล้ว" },
      ],
      imagesMin: 3, imagesLevel: "required",
      imagesHint: "แพลตฟอร์มแนะนำ 5 รูปขึ้นไป — รูปแรกพื้นขาว เห็นตัวสินค้าชัด",
    },
    {
      key: "measure", label: "วัดขนาด + ชั่งน้ำหนัก", icon: "📏",
      items: [
        { field: "size_length_cm", level: "required", hint: SIZE_HINT },
        { field: "size_height_cm", level: "required", hint: SIZE_HINT },
        { field: "size_thickness_cm", level: "required", hint: SIZE_HINT },
        { field: "weight_g", level: "required", hint: "ชั่งตัวสินค้าเปล่า ไม่รวมกล่อง หน่วยกรัม" },
        { field: "parcel_size_id", level: "recommended", hint: "เลือกกล่องที่ใส่สินค้าได้พอดีที่สุด" },
        { field: "handle_drop_cm", level: "recommended" },
        { field: "strap_drop_cm", level: "recommended" },
        { field: "compartments", level: "recommended" },
      ],
    },
  ],
};
