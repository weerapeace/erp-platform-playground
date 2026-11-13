/**
 * ตัวเลือกการจัดส่งต่อสินค้าบน TikTok (แทนค่าเริ่มต้นของคลัง) — pure (ไม่เรียก API) ใช้ได้ทั้งหน้าเว็บและหลังบ้าน + เทสต์
 * เจ้าของสั่ง 2026-11-13 "ทำทั้ง 2 อย่าง" (ข้อ 3 ตัวเลือกการจัดส่งแบบกำหนดเอง)
 *
 * เอกสารทางการ (อ่าน 2026-11-13):
 *   Get Warehouse Delivery Options 202309 — GET /logistics/202309/warehouses/{warehouse_id}/delivery_options ?scope=PRODUCT|WAREHOUSE (สิทธิ์ seller.logistics — มีแล้ว)
 *     → data.delivery_options[{ id, name, type: STANDARD|EXPRESS|ECONOMY|SEND_BY_SELLER|INSTANT|SAMEDAY|NEXTDAY|CARGO, description,
 *        weight_limit{ max_weight, min_weight, unit }, dimension_limit{ max_length, max_width, max_height, unit }, platform }]
 *     scope=PRODUCT = แบบที่กำหนดให้สินค้าได้ (ไม่มีขีดจำกัดน้ำหนัก) · WAREHOUSE = แบบที่คลังใช้อยู่ตอนนี้ (ค่าเริ่มต้นของออเดอร์ · มีขีดจำกัด)
 *   สินค้า: delivery_option_ids[] (ไทยรองรับ · Create / Edit / Partial Edit) — ไม่ส่ง/ว่าง = ใช้ค่าของคลัง
 *     ⚠️ ไม่เก็บในร่างของสินค้าที่ขายอยู่ (AS_DRAFT) → ต้องไปกับการส่งปกติ (LISTING)
 *   Get Product: delivery_options[{ id, name, is_available }] = แบบที่กำหนดไว้ (ว่าง = ใช้ค่าของคลัง)
 */

export type TtsDeliveryOption = {
  id: string; name: string; type: string | null; typeLabel: string; description: string | null;
  maxWeightKg: number | null; platform: string | null;
};
/** ค่าในฟอร์ม: null = ใช้ค่าเริ่มต้นของร้าน (คลัง) · [ids] = กำหนดเองสำหรับสินค้านี้ */
export type TtsDeliveryValue = string[] | null;

export const TTS_DELIVERY_TYPE_LABEL: Record<string, string> = {
  STANDARD: "ส่งแบบมาตรฐาน", EXPRESS: "ส่งด่วน", ECONOMY: "ส่งแบบประหยัด", SEND_BY_SELLER: "ร้านส่งเอง",
  INSTANT: "ส่งทันที (ภายในไม่กี่ชั่วโมง)", SAMEDAY: "ส่งภายในวัน", NEXTDAY: "ส่งถึงวันถัดไป", CARGO: "ขนส่งของชิ้นใหญ่",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const num = (v: unknown): number | null => { const s = str(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const toKg = (v: number | null, unit: string) => (v == null ? null : unit === "GRAM" ? v / 1000 : unit === "POUND" ? Math.round(v * 0.45359237 * 100) / 100 : unit === "OUNCE" ? Math.round(v * 0.0283495 * 100) / 100 : v);

/** คำตอบ Get Warehouse Delivery Options → รายการ (เฉพาะ TikTok Shop) */
export function ttsDeliveryOptionsOf(data: unknown): TtsDeliveryOption[] {
  return arr(obj(data)?.delivery_options).map((d): TtsDeliveryOption | null => {
    const id = str(d.id);
    if (!id) return null;
    const type = str(d.type).toUpperCase() || null;
    const w = obj(d.weight_limit);
    return {
      id, name: str(d.name) || (type ? TTS_DELIVERY_TYPE_LABEL[type] ?? type : `#${id}`), type, typeLabel: type ? TTS_DELIVERY_TYPE_LABEL[type] ?? type : "",
      description: str(d.description) || null, maxWeightKg: toKg(num(w?.max_weight), str(w?.unit).toUpperCase()), platform: str(d.platform) || null,
    };
  }).filter((x): x is TtsDeliveryOption => !!x && (!x.platform || x.platform === "TIKTOK_SHOP"));
}

/** แบบที่สินค้ากำหนดไว้ (Get Product delivery_options) · ว่าง = ใช้ค่าของร้าน */
export function tiktokDeliveryOf(detail: unknown): { ids: string[]; names: Record<string, string> } {
  const names: Record<string, string> = {};
  const ids: string[] = [];
  for (const d of arr(obj(detail)?.delivery_options)) {
    const id = str(d.id); if (!id || ids.includes(id)) continue;
    ids.push(id); if (str(d.name)) names[id] = str(d.name);
  }
  return { ids, names };
}
/** ค่าบนร้านในรูปแบบฟอร์ม (ว่าง = null) */
export const tiktokDeliveryValue = (ids: string[]): TtsDeliveryValue => (ids.length ? [...ids] : null);
export const sameDelivery = (a: TtsDeliveryValue, b: TtsDeliveryValue): boolean =>
  (a == null && b == null) || (!!a && !!b && a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|"));

export type TtsDeliveryPlan = { changed: boolean; ids: string[]; errors: string[]; warnings: string[]; change: { label: string; before: string; after: string } | null };

/**
 * เทียบค่าบนร้านกับฟอร์ม → ส่งไหม + กฎ (หน้าเว็บกับ API ใช้ตัวเดียวกัน)
 * options = แบบที่กำหนดให้สินค้าได้ (null = ยังโหลดไม่ได้ → ตรวจ id ไม่ได้ เตือน) · weightKg = น้ำหนักกล่องของสินค้า (เตือนเกินขีดจำกัด)
 */
export function planTiktokDelivery(base: TtsDeliveryValue, next: TtsDeliveryValue, options: TtsDeliveryOption[] | null, opts: { weightKg?: number | null; limits?: TtsDeliveryOption[] | null; names?: Record<string, string>; /** false = หน้าเว็บ (กล่องโหลดรายการเอง) ไม่ต้องเตือนว่าตรวจรายการไม่ได้ */ checkOptions?: boolean } = {}): TtsDeliveryPlan {
  const changed = !sameDelivery(base, next);
  const errors: string[] = []; const warnings: string[] = [];
  const nameOf = (id: string) => options?.find((o) => o.id === id)?.name ?? opts.names?.[id] ?? `#${id}`;
  const txt = (v: TtsDeliveryValue) => (v == null ? "ใช้ค่าเริ่มต้นของร้าน" : v.map(nameOf).join(", ") || "(ไม่ได้เลือก)");
  if (changed && next != null) {
    if (!next.length) errors.push("เลือกการจัดส่งอย่างน้อย 1 แบบ — หรือเลือก \"ใช้ค่าเริ่มต้นของร้าน\"");
    if (options) {
      const bad = next.filter((id) => !options.some((o) => o.id === id));
      if (bad.length) errors.push(`มีแบบจัดส่งที่ร้านใช้ไม่ได้แล้ว ${bad.length} แบบ — เอาออกก่อน`);
    } else if (opts.checkOptions !== false) warnings.push("ยังโหลดรายการแบบจัดส่งจาก TikTok ไม่ได้ — ตรวจรายการไม่ได้");
    // น้ำหนักเกินขีดจำกัดของแบบที่เลือก (ขีดจำกัดมาจากรายการของคลัง)
    const w = opts.weightKg ?? null;
    if (w != null) {
      const over = next.map((id) => opts.limits?.find((o) => o.id === id)).filter((o): o is TtsDeliveryOption => !!o && o.maxWeightKg != null && w > o.maxWeightKg);
      if (over.length) warnings.push(`น้ำหนักกล่อง ${w} กก. เกินที่ ${over.map((o) => `${o.name} (≤ ${o.maxWeightKg} กก.)`).join(", ")} รับ — ลูกค้าอาจเลือกแบบนั้นไม่ได้`);
    }
  }
  if (changed && next == null) warnings.push("กลับไปใช้ค่าเริ่มต้นของร้าน — ถ้า TikTok ยังโชว์แบบที่กำหนดไว้ ให้ปรับใน Seller Center");
  if (changed) warnings.push("การจัดส่งมีผลกับการสั่งซื้อใหม่ · ไม่แตะสต๊อก/ราคา");
  return { changed, ids: next ?? [], errors, warnings, change: changed ? { label: "ตัวเลือกการจัดส่ง", before: txt(base), after: txt(next) } : null };
}
