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
];

export type CaptionVars = {
  caption?: string | null;
  hashtags?: string | null;
  shop?: ShopChannel[] | null;
  fake_price?: number | null;
  real_price?: number | null;
  price?: number | null;
  color?: string | null;
  sku?: string | null;
  product?: string | null;
};

const money = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("th-TH"));

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
