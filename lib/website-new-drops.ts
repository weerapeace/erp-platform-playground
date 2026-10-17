/**
 * 🆕 มาใหม่เป็นชุด (Drop) — pure · ไม่มี import
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/new-drops.ts — แก้ที่นี่แล้วคัดลอก (คงหัวไฟล์ storefront)
 * ข้อมูล: ตาราง store_new_drops (1 แถว = 1 ชุด) · ERP แท็บ 🆕 มาใหม่ · เว็บ /new + ป้าย "ใหม่" + Section หน้าแรก
 * สถานะ: upcoming (ยังไม่ถึงเวลาเปิด) → live (เปิดแล้ว · ยังเป็น "ใหม่") → ended (หมดช่วงใหม่ — ยังอยู่ในหน้า /new ส่วนชุดก่อนหน้า)
 */
export type DropStatus = "upcoming" | "live" | "ended";

export interface NewDrop {
  id: string;
  title: string;
  title_en: string;
  subtitle: string;
  subtitle_en: string;
  /** รูปปก คอม (16:9) / มือถือ (4:5 · ว่าง = ใช้ของคอม) — r2 key */
  imageKey: string | null;
  imageMobileKey: string | null;
  /** รหัสรุ่น (parent code ตัวใหญ่) เรียงตามที่เลือก */
  codes: string[];
  /** ISO — เวลาเปิดชุด */
  startAt: string;
  /** ISO — หมดช่วง "ใหม่" (ป้ายหาย · ย้ายไปชุดก่อนหน้า) · null = ไม่หมด */
  endAt: string | null;
  /** ซ่อนสินค้าในชุดจากทั้งเว็บจนถึงเวลาเปิด */
  hideUntilStart: boolean;
}

/** ช่วง "ใหม่" ตั้งต้นของชุดใหม่ (วัน) */
export const DROP_DEFAULT_DAYS = 30;
export const DROP_MAX_CODES = 60;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function dropStatus(d: Pick<NewDrop, "startAt" | "endAt">, now = Date.now()): DropStatus {
  const s = ms(d.startAt);
  if (!Number.isFinite(s) || now < s) return "upcoming";
  const e = ms(d.endAt);
  return Number.isFinite(e) && now >= e ? "ended" : "live";
}

export const DROP_STATUS_LABEL: Record<DropStatus, { th: string; en: string }> = {
  upcoming: { th: "เร็ว ๆ นี้", en: "Coming soon" },
  live: { th: "เปิดอยู่", en: "Now live" },
  ended: { th: "จบช่วงใหม่แล้ว", en: "Ended" },
};

/** แบ่งชุดสำหรับหน้า /new: ใกล้เปิดก่อน (upcoming เรียงเวลาเปิดใกล้สุด) · เปิดแล้ว (live+ended เรียงเปิดล่าสุดก่อน) */
export function orderDrops<T extends Pick<NewDrop, "startAt" | "endAt">>(drops: T[], now = Date.now()): { upcoming: T[]; started: T[] } {
  const upcoming = drops.filter((d) => dropStatus(d, now) === "upcoming").sort((a, b) => ms(a.startAt) - ms(b.startAt));
  const started = drops.filter((d) => dropStatus(d, now) !== "upcoming").sort((a, b) => ms(b.startAt) - ms(a.startAt));
  return { upcoming, started };
}

/**
 * รหัสรุ่นที่ต้องซ่อนจากทั้งเว็บตอนนี้ = อยู่ในชุดที่ยังไม่เปิด + ตั้งซ่อนไว้
 * (ถ้ารุ่นเดียวกันอยู่ในชุดที่เปิดแล้วด้วย = ไม่ซ่อน)
 */
export function hiddenDropCodes(drops: Pick<NewDrop, "startAt" | "endAt" | "codes" | "hideUntilStart">[], now = Date.now()): Set<string> {
  const started = new Set(drops.filter((d) => dropStatus(d, now) !== "upcoming").flatMap((d) => d.codes.map((c) => c.toUpperCase())));
  const out = new Set<string>();
  for (const d of drops) if (d.hideUntilStart && dropStatus(d, now) === "upcoming") for (const c of d.codes) if (!started.has(c.toUpperCase())) out.add(c.toUpperCase());
  return out;
}

/** รุ่นที่อยู่ในชุดที่ "เปิดอยู่" ตอนนี้ → ชุดนั้น (อยู่หลายชุด = ชุดที่เปิดล่าสุด) — ใช้ทำป้าย "ใหม่" + Section */
export function liveDropByCode<T extends Pick<NewDrop, "id" | "startAt" | "endAt" | "codes">>(drops: T[], now = Date.now()): Map<string, T> {
  const out = new Map<string, T>();
  for (const d of [...drops].sort((a, b) => ms(b.startAt) - ms(a.startAt))) {
    if (dropStatus(d, now) !== "live") continue;
    for (const c of d.codes) if (!out.has(c.toUpperCase())) out.set(c.toUpperCase(), d);
  }
  return out;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const KEY_RE = /^[\w\-./%()]{1,300}$/;
const keyOrNull = (v: unknown) => (typeof v === "string" && KEY_RE.test(v.trim()) ? v.trim() : null);
const isoOrNull = (v: unknown) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** ตรวจ + ทำความสะอาดค่าที่ส่งมาจากหน้าจัดการ (ไม่ผ่าน = บอกเหตุผลเป็นภาษาคน) */
export function normalizeDropInput(raw: unknown): { ok: true; value: Omit<NewDrop, "id"> } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = str(r.title, 80);
  if (!title) return { ok: false, error: "ตั้งชื่อชุดก่อน (เช่น ชุดปลาย ต.ค.)" };
  const startAt = isoOrNull(r.startAt);
  if (!startAt) return { ok: false, error: "ตั้งเวลาเปิดชุด" };
  const endAt = isoOrNull(r.endAt);
  if (endAt && Date.parse(endAt) <= Date.parse(startAt)) return { ok: false, error: "เวลาหมดช่วงใหม่ต้องหลังเวลาเปิดชุด" };
  const codes = Array.isArray(r.codes)
    ? [...new Set((r.codes as unknown[]).map((c) => String(c ?? "").trim().toUpperCase()).filter((c) => /^[A-Z0-9._-]{1,40}$/.test(c)))].slice(0, DROP_MAX_CODES)
    : [];
  return {
    ok: true,
    value: {
      title,
      title_en: str(r.title_en, 120),
      subtitle: str(r.subtitle, 240),
      subtitle_en: str(r.subtitle_en, 360),
      imageKey: keyOrNull(r.imageKey),
      imageMobileKey: keyOrNull(r.imageMobileKey),
      codes,
      startAt,
      endAt,
      hideUntilStart: r.hideUntilStart !== false,
    },
  };
}

/** แถวในฐานข้อมูล → NewDrop */
export function dropFromRow(r: Record<string, unknown>): NewDrop {
  return {
    id: String(r.id ?? ""),
    title: String(r.title ?? ""),
    title_en: String(r.title_en ?? ""),
    subtitle: String(r.subtitle ?? ""),
    subtitle_en: String(r.subtitle_en ?? ""),
    imageKey: (r.image_key as string | null) ?? null,
    imageMobileKey: (r.image_mobile_key as string | null) ?? null,
    codes: Array.isArray(r.codes) ? (r.codes as string[]) : [],
    startAt: String(r.start_at ?? ""),
    endAt: (r.end_at as string | null) ?? null,
    hideUntilStart: r.hide_until_start !== false,
  };
}

/** NewDrop (ไม่มี id) → คอลัมน์ในฐานข้อมูล */
export function dropToRow(d: Omit<NewDrop, "id">): Record<string, unknown> {
  return {
    title: d.title,
    title_en: d.title_en || null,
    subtitle: d.subtitle || null,
    subtitle_en: d.subtitle_en || null,
    image_key: d.imageKey,
    image_mobile_key: d.imageMobileKey,
    codes: d.codes,
    start_at: d.startAt,
    end_at: d.endAt,
    hide_until_start: d.hideUntilStart,
  };
}
