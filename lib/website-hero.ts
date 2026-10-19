/**
 * 🎬 รูปเปิดหน้าสินค้า (Hero) ต่อรุ่นต่อร้าน — store_listings.web_hero · ไฟล์ pure ใช้ได้ทั้ง API และหน้าจอ
 * เป็นภาพแรกของแกลเลอรีหน้าสินค้า เต็มพื้นที่ (ไม่มีขอบขาว) แบบ Gucci · ไม่ใส่ = ใช้รูปสินค้าตามเดิม
 * desktop/mobile แยกกัน (มือถือว่าง = ใช้ของคอม) · รูปหรือวิดีโอ (วิดีโอ ≤ 4 MB เล่นเอง เงียบ วนซ้ำ)
 * storefront: Product.hero → components/shop/EditorialGallery (สไลด์แรก .pd-ed-hero)
 * 🎨 Hero รายสี (sku): ตั้งต่อ SKU ลูกได้ — ลูกค้าเลือกสีนั้น (หรือเข้ามาจากการ์ด SKU ?color=) = รูปเปิดเป็นของสีนั้น · สีที่ไม่ตั้ง = ใช้ของรุ่น
 */
export type HeroKind = "image" | "video";
export interface HeroMedia {
  kind: HeroKind;
  /** r2 key ของไฟล์ */
  key: string;
  /** รูปปกวิดีโอ (r2 key) — โชว์ระหว่างโหลด */
  posterKey: string | null;
}
export interface HeroPair {
  desktop: HeroMedia | null;
  mobile: HeroMedia | null;
}
export interface ProductHero extends HeroPair {
  /** 🎨 Hero รายสี { [id SKU ลูก]: { desktop, mobile } } — ไม่มี = ทุกสีใช้ของรุ่น */
  sku?: Record<string, HeroPair>;
}

/** ขนาดแนะนำ (บอกเจ้าของตอนอัปโหลด) */
export const HERO_SIZE_HINT = {
  desktop: "แนะนำ 2560×1440 px (16:9) อย่างน้อย 1920×1080 · วางจุดสำคัญไว้กลางภาพ",
  mobile: "แนะนำ 1080×1350 px (4:5) · ว่าง = ใช้ของคอม",
  video: "วิดีโอ MP4 ไม่เกิน 200 MB (แนะนำ ≤ 15 MB ให้เปิดไว) · 6–10 วินาที · ไม่มีเสียง (เล่นเอง วนซ้ำ)",
};

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

function pair(raw: unknown): HeroPair | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const desktop = media(r.desktop);
  const mobile = media(r.mobile);
  return desktop || mobile ? { desktop, mobile } : null;
}

const SKU_ID_RE = /^[0-9a-f-]{8,40}$/i;

/** null = ไม่ได้ตั้งเลย (รุ่นและทุกสีว่าง) · มีแค่ Hero รายสี = desktop/mobile ของรุ่นเป็น null */
export function normalizeHero(raw: unknown): ProductHero | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = pair(r) ?? { desktop: null, mobile: null };
  const sku: Record<string, HeroPair> = {};
  if (r.sku && typeof r.sku === "object" && !Array.isArray(r.sku)) {
    for (const [id, v] of Object.entries(r.sku as Record<string, unknown>).slice(0, 60)) {
      const p = SKU_ID_RE.test(id) ? pair(v) : null;
      if (p) sku[id] = p;
    }
  }
  const hasSku = Object.keys(sku).length > 0;
  if (!base.desktop && !base.mobile && !hasSku) return null;
  return hasSku ? { ...base, sku } : base;
}

/** Hero ของสีนี้ (ไม่ได้ตั้ง = null → ใช้ของรุ่น) */
export const heroOfSku = (h: ProductHero | null | undefined, skuId: string): HeroPair | null => h?.sku?.[skuId] ?? null;
