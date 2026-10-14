/**
 * 🎬 รูปเปิดหน้าสินค้า (Hero) ต่อรุ่นต่อร้าน — store_listings.web_hero · ไฟล์ pure ใช้ได้ทั้ง API และหน้าจอ
 * เป็นภาพแรกของแกลเลอรีหน้าสินค้า เต็มพื้นที่ (ไม่มีขอบขาว) แบบ Gucci · ไม่ใส่ = ใช้รูปสินค้าตามเดิม
 * desktop/mobile แยกกัน (มือถือว่าง = ใช้ของคอม) · รูปหรือวิดีโอ (วิดีโอ ≤ 4 MB เล่นเอง เงียบ วนซ้ำ)
 * storefront: Product.hero → components/shop/EditorialGallery (สไลด์แรก .pd-ed-hero)
 */
export type HeroKind = "image" | "video";
export interface HeroMedia {
  kind: HeroKind;
  /** r2 key ของไฟล์ */
  key: string;
  /** รูปปกวิดีโอ (r2 key) — โชว์ระหว่างโหลด */
  posterKey: string | null;
}
export interface ProductHero {
  desktop: HeroMedia | null;
  mobile: HeroMedia | null;
}

/** ขนาดแนะนำ (บอกเจ้าของตอนอัปโหลด) */
export const HERO_SIZE_HINT = {
  desktop: "แนะนำ 2560×1440 px (16:9) อย่างน้อย 1920×1080 · วางจุดสำคัญไว้กลางภาพ",
  mobile: "แนะนำ 1080×1350 px (4:5) · ว่าง = ใช้ของคอม",
  video: "วิดีโอ MP4 ไม่เกิน 4 MB · 6–10 วินาที · ไม่มีเสียง (เล่นเอง วนซ้ำ)",
};
export const HERO_VIDEO_MAX_BYTES = 4 * 1024 * 1024;

const KEY_RE = /^[\w\-./%()]+$/;
function media(raw: unknown): HeroMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === "string" && KEY_RE.test(r.key) ? r.key : null;
  if (!key) return null;
  return {
    kind: r.kind === "video" ? "video" : "image",
    key,
    posterKey: typeof r.posterKey === "string" && KEY_RE.test(r.posterKey) ? r.posterKey : null,
  };
}

/** null = ไม่ได้ตั้ง (ทั้งคอมและมือถือว่าง) */
export function normalizeHero(raw: unknown): ProductHero | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const desktop = media(r.desktop);
  const mobile = media(r.mobile);
  return desktop || mobile ? { desktop, mobile } : null;
}
