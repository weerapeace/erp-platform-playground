/**
 * 🎞️ การ์ดบนฉาก — กฎเลือกสินค้าของแต่ละแท็บ (pure · ไม่มี import)
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/scene.ts — แก้ที่นี่แล้วคัดลอก (คงหัวไฟล์ storefront)
 * ใช้: เว็บร้าน SceneBody (วาดการ์ด) · ERP แผง "🖼 รูป PNG ของสินค้า" ในตัวจัดหน้า (เห็นว่าแท็บไหนมีสินค้าอะไร + ใส่ PNG ตรงนั้น)
 * ลำดับ: ตามแหล่ง (มาใหม่ = ขึ้นร้านล่าสุด · ขายดี = อันดับขาย · เลือกเอง = ตามที่เลือก) → ตัดตามจำนวน → ไม่มีรูป PNG = ไม่โชว์
 *   (ตัดจำนวนก่อนกรอง → แผงใน ERP กับเว็บตรงกันเป๊ะ: "มี PNG 3/12" = เว็บโชว์ 3 ชิ้น)
 * รูป PNG = ช่อง "รูปตัดพื้น (PNG)" ของ Parent SKU (png_image_r2_key) → API สินค้าส่งเป็น imageFields.png_image_r2_key (URL)
 */
export type SceneTabN = 1 | 2 | 3;
export type SceneSource = "new" | "best" | "pick";

export interface SceneProductLike {
  code?: string | null;
  slug?: string | null;
  listedAt?: string | null;
  salesRank?: number | null;
  imageFields?: Record<string, string> | null;
}

type TabKeys = `tab${SceneTabN}Source` | `tab${SceneTabN}Products` | `tab${SceneTabN}Count`;
/** ค่าของ Section ที่ใช้เลือกสินค้า (รับได้ทั้ง SceneBlock ของ ERP และของเว็บร้าน) */
export type SceneTabsLike = { tabs?: unknown } & { [K in TabKeys]?: unknown };

export const SCENE_PNG_FIELD = "png_image_r2_key";
export const SCENE_MAX_PRODUCTS = 24;
export const SCENE_TAB_DEFAULTS: Record<SceneTabN, { th: string; en: string; source: SceneSource }> = {
  1: { th: "มาใหม่", en: "New in", source: "new" },
  2: { th: "ขายดี", en: "Best sellers", source: "best" },
  3: { th: "เลือกเอง", en: "Our picks", source: "pick" },
};

const clampN = (v: unknown, lo: number, hi: number, fb: number) => {
  const x = Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(x) ? fb : Math.min(hi, Math.max(lo, Math.round(x)));
};

/** จำนวนแท็บ 1–3 (ไม่ตั้ง = 2) */
export const sceneTabCount = (b: SceneTabsLike): SceneTabN => clampN(b.tabs ?? "2", 1, 3, 2) as SceneTabN;

export function sceneTabSource(b: SceneTabsLike, n: SceneTabN): SceneSource {
  const v = b[`tab${n}Source`];
  return v === "new" || v === "best" || v === "pick" ? v : SCENE_TAB_DEFAULTS[n].source;
}

/** รูป PNG ของรุ่น (URL) · ไม่มี = null */
export const scenePngOf = (p: SceneProductLike): string | null => p.imageFields?.[SCENE_PNG_FIELD] || null;

/** เรียงแบบคงที่: ค่าเท่ากัน = ตามลำดับเดิมของร้าน */
function stable<T>(list: T[], cmp: (a: T, b: T) => number): T[] {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => cmp(a.p, b.p) || a.i - b.i)
    .map((x) => x.p);
}
const listed = (p: SceneProductLike) => (p.listedAt ? Date.parse(p.listedAt) || 0 : 0);

/** สินค้าของแท็บ n ตามที่ตั้ง (ลำดับ + จำนวน) — ยังไม่กรอง PNG */
export function sceneTabCandidates<T extends SceneProductLike>(all: T[], b: SceneTabsLike, n: SceneTabN): T[] {
  const src = sceneTabSource(b, n);
  if (src === "pick") {
    const byCode = new Map(all.map((p) => [String(p.code ?? p.slug ?? "").toUpperCase(), p]));
    const codes = b[`tab${n}Products`];
    return (Array.isArray(codes) ? codes : [])
      .map((c) => byCode.get(String(c).toUpperCase()))
      .filter((p): p is T => Boolean(p))
      .slice(0, SCENE_MAX_PRODUCTS);
  }
  const count = clampN(b[`tab${n}Count`], 3, SCENE_MAX_PRODUCTS, 12);
  const sorted = src === "best" ? stable(all, (a, c) => (a.salesRank ?? 1e9) - (c.salesRank ?? 1e9)) : stable(all, (a, c) => listed(c) - listed(a));
  return sorted.slice(0, count);
}

/** สินค้าที่โชว์จริงบนเว็บ: ตามที่ตั้ง → มีรูป PNG เท่านั้น (pngOnly=false = ทุกตัว ใช้รูปเดิม) */
export function sceneTabProducts<T extends SceneProductLike>(all: T[], b: SceneTabsLike, n: SceneTabN, pngOnly = true): T[] {
  const list = sceneTabCandidates(all, b, n);
  return pngOnly ? list.filter((p) => !!scenePngOf(p)) : list;
}
