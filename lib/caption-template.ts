// ============================================================
// Caption template engine (ของกลาง) — ประกอบแคปชั่นจากแม่แบบ + ตัวแปร {...}
// ใช้ทั้งฝั่งแก้แม่แบบ (preview ตัวอย่าง) และฝั่งคอนเทนต์ (ประกอบจริง + คัดลอก)
// ============================================================

export type ShopChannel = { label: string; value: string };

/** ตัวแปรที่ใช้ได้ในแม่แบบ — โชว์เป็นปุ่มแทรกในตัวแก้ */
export const CAPTION_VARS: { key: string; label: string; hint: string }[] = [
  { key: "caption",    label: "{caption}",    hint: "ข้อความที่พิมพ์เอง" },
  { key: "hashtags",   label: "{hashtags}",   hint: "แฮชแท็ก" },
  { key: "shop",       label: "{shop}",       hint: "ช่องทางร้านของแบรนด์ (Shopee/Lazada/…)" },
  { key: "fake_price", label: "{fake_price}", hint: "ราคาเต็ม (ก่อนลด)" },
  { key: "real_price", label: "{real_price}", hint: "ราคาขายจริง (หลังลด)" },
  { key: "price",      label: "{price}",      hint: "ราคา SKU" },
  { key: "color",      label: "{color}",      hint: "สีสินค้า" },
  { key: "sku",        label: "{sku}",        hint: "รหัส SKU" },
  { key: "product",    label: "{product}",    hint: "ชื่อสินค้า" },
  { key: "link",       label: "{link}",       hint: "ลิงก์สินค้าทุกแพลตฟอร์ม (แพลตฟอร์ม: ลิงก์ ต่อบรรทัด)" },
];

export type CaptionVars = {
  caption?: string | null;
  hashtags?: string | null;
  shop?: ShopChannel[] | null;
  fake_price?: number | string | null;   // ตัวเลข = ราคาเดียว · ข้อความ = หลายสินค้า (บรรทัดละ "ชื่อ: ราคา") ประกอบมาแล้ว
  real_price?: number | string | null;
  price?: number | string | null;
  color?: string | null;
  sku?: string | null;
  product?: string | null;
  link?: string | null;
};

const money = (n: number | string | null | undefined) => (n == null ? "" : typeof n === "string" ? n : Number(n).toLocaleString("th-TH"));

/** แปลง vars → map ของ string (ค่าที่จะแทนใน {...}) */
function toMap(v: CaptionVars): Record<string, string> {
  const shopBlock = (v.shop ?? []).filter((c) => c.label?.trim() && c.value?.trim()).map((c) => `${c.label}: ${c.value}`).join("\n");
  return {
    caption: (v.caption ?? "").trim(),
    hashtags: (v.hashtags ?? "").trim(),
    shop: shopBlock,
    fake_price: money(v.fake_price),
    real_price: money(v.real_price),
    price: money(v.price),
    color: (v.color ?? "").trim(),
    sku: (v.sku ?? "").trim(),
    product: (v.product ?? "").trim(),
    link: (v.link ?? "").trim(),
  };
}

/**
 * ประกอบแม่แบบ → ข้อความจริง
 * - ถ้าบรรทัดมีตัวแปรล้วน และตัวแปรว่างหมด → ตัดบรรทัดนั้นทิ้ง (กันบรรทัดโล่ง/คำค้าง)
 * - ยุบบรรทัดว่างซ้อนกัน 3+ เหลือ 2
 */
export function renderCaption(body: string, vars: CaptionVars): string {
  const map = toMap(vars);
  const lines = (body ?? "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const refs = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (refs.length > 0 && refs.every((r) => !map[r] || map[r].trim() === "")) continue; // ตัดบรรทัดที่ตัวแปรว่างหมด
    out.push(line.replace(/\{(\w+)\}/g, (_, k: string) => (k in map ? map[k] : `{${k}}`)));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** ราคาขายจริงจากราคาเต็ม + ส่วนลด (จำนวนเงิน หรือ เปอร์เซ็นต์) */
export function computeRealPrice(fake: number | null | undefined, discount: number | null | undefined, isPercent: boolean): number | null {
  if (fake == null) return null;
  if (discount == null || discount === 0) return fake;
  const real = isPercent ? fake * (1 - discount / 100) : fake - discount;
  return Math.max(0, Math.round(real));
}

// ---------- ลิมิตความยาวต่อแพลตฟอร์ม (ไว้เตือนในตัวอย่างโพสต์/หัวการ์ด) ----------
/** ตัวอักษรสูงสุดของข้อความโพสต์ + จำนวนแฮชแท็กสูงสุด (ตามกติกาแพลตฟอร์ม ณ 2026) · ไม่มีในตาราง = ไม่เตือน */
export const PLATFORM_LIMITS: Record<string, { chars: number; hashtags?: number; note?: string }> = {
  x:         { chars: 280, note: "X (Twitter) โพสต์ธรรมดา 280 ตัวอักษร" },
  instagram: { chars: 2200, hashtags: 30, note: "Instagram แคปชั่น 2,200 ตัวอักษร · แฮชแท็กไม่เกิน 30" },
  tiktok:    { chars: 4000, note: "TikTok แคปชั่น 4,000 ตัวอักษร" },
  tiktok_shop: { chars: 4000 },
  facebook:  { chars: 63206, note: "Facebook 63,206 ตัวอักษร (แต่ที่เห็นก่อนกด 'ดูเพิ่มเติม' ≈ 3 บรรทัดแรก)" },
  youtube:   { chars: 5000, note: "YouTube คำอธิบาย 5,000 ตัวอักษร" },
  pinterest: { chars: 500, note: "Pinterest คำอธิบายพิน 500 ตัวอักษร" },
  line_oa:   { chars: 5000, note: "LINE OA ข้อความ 5,000 ตัวอักษร" },
  lemon8:    { chars: 5000 },
};
export type CaptionLimitCheck = { chars: number; max: number | null; over: number; hashtagCount: number; maxHashtags: number | null; hashtagsOver: number };
/** นับตัวอักษร (ตาม code point — อีโมจิ/ไทยนับถูก) + แฮชแท็ก แล้วเทียบลิมิต · over > 0 = เกิน */
export function captionLimitCheck(platform: string, text: string): CaptionLimitCheck {
  const lim = PLATFORM_LIMITS[platform];
  const chars = Array.from(text ?? "").length;
  const hashtagCount = (text.match(/(^|\s)#[^\s#]+/g) ?? []).length;
  const max = lim?.chars ?? null; const maxHashtags = lim?.hashtags ?? null;
  return { chars, max, over: max != null ? Math.max(0, chars - max) : 0, hashtagCount, maxHashtags, hashtagsOver: maxHashtags != null ? Math.max(0, hashtagCount - maxHashtags) : 0 };
}
