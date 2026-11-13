/**
 * ลิงก์ร้าน / ลิงก์สินค้าบนร้าน / ลิงก์หลังร้าน (Seller Center) ของทุกแพลตฟอร์ม — ของกลาง · pure (มี test)
 *
 *   platformShopUrl("line_shopping", "@louismontini")            → https://shop.line.me/@louismontini   (หน้าบัญชีร้าน /admin/platform-accounts)
 *   listingLinks("lazada", "16196625125", null)                   → { storefront: "https://www.lazada.co.th/products/i16196625125.html", sellerCenter: "…publish?productId=16196625125", sellerExact: true }
 *
 * shopRef = platform_accounts.external_shop_id (ลิงก์ร้านเต็ม หรือ @handle / Shop ID — ตั้งที่ 🏪 บัญชีร้าน)
 * รูปแบบลิงก์ (สำรวจ 2026-11-10 · ที่มาใน docs/platform-catalog.md):
 *   Lazada    หน้าร้าน /products/i{item}.html · หลังร้าน sellercenter.lazada.co.th/apps/product/publish?productId={item} (หน้า Edit Product)
 *   Shopee    หน้าร้าน /product/{shop_id}/{item} (ต้องรู้ Shop ID ตัวเลข) · หลังร้าน seller.shopee.co.th/portal/product/{item}
 *   LINE      หน้าร้าน shop.line.me/@{id}/product/{product} · หลังร้าน oaplus.line.biz (ไม่มีลิงก์เข้าสินค้าตรง → ค้นรหัสเอง)
 *   TikTok    หน้าร้าน shop.tiktok.com/view/product/{product}?region=TH · หลังร้าน seller-th.tiktok.com (ไม่มีลิงก์ตรงที่ยืนยันได้)
 * ไม่รู้ = null (ไม่โชว์ปุ่ม ดีกว่าพาไปหน้าผิด)
 */

// ลิงก์ร้านจากค่าที่กรอก — รองรับทั้ง "ลิงก์เต็ม" และ "@handle/ชื่อร้าน" (ย้ายมาจากหน้าบัญชีร้าน)
const SHOP_URL: Record<string, (h: string) => string> = {
  line_shopping: (h) => `https://shop.line.me/@${h}`,
  line: (h) => `https://shop.line.me/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  pinterest: (h) => `https://www.pinterest.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  twitter: (h) => `https://x.com/${h}`,
  shopee: (h) => (/^\d+$/.test(h) ? `https://shopee.co.th/shop/${h}` : `https://shopee.co.th/${h}`),   // รหัสร้านตัวเลข (ระบบเติมให้ตอนเชื่อม Shopee) = /shop/{id}
  lazada: (h) => `https://www.lazada.co.th/shop/${h}`,
  line_oa: (h) => `https://line.me/R/ti/p/@${h}`,
};

/** ลิงก์หน้าร้านของบัญชี (ลิงก์เต็มที่กรอก หรือสร้างจาก @handle) · เดาไม่ได้ = null */
export function platformShopUrl(code: string, raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;                    // กรอกลิงก์เต็มมาแล้ว
  const handle = v.replace(/^@/, "").trim();                // ตัด @ นำหน้า (แต่ละเจ้าเติมเองตามรูปแบบ)
  if (!handle) return null;
  const make = SHOP_URL[(code || "").toLowerCase()];
  return make ? make(handle) : null;
}

export type ListingLinks = {
  /** หน้าสินค้าที่ลูกค้าเห็น · null = สร้างไม่ได้ (ดู storefrontHint) */
  storefront: string | null;
  /** ทำไมสร้างลิงก์หน้าร้านไม่ได้ / ต้องตั้งอะไรก่อน */
  storefrontHint: string | null;
  /** หลังร้าน (Seller Center) */
  sellerCenter: string | null;
  /** true = เปิดหน้าแก้สินค้านี้ตรง · false = เปิดหน้าแรกหลังร้าน แล้วค้นรหัสเอง */
  sellerExact: boolean;
  /** ชื่อปุ่มหลังร้าน */
  sellerLabel: string;
};

const ACCOUNTS_HINT = "ตั้งลิงก์ร้าน/Shop ID ที่ 🏪 บัญชีร้าน (/admin/platform-accounts) ก่อน";

/** ลิงก์ของสินค้า 1 รายการบนร้าน · platformCode = erp_platforms.code */
export function listingLinks(platformCode: string, externalProductId: string | null | undefined, shopRef?: string | null): ListingLinks {
  const id = String(externalProductId ?? "").trim();
  const code = (platformCode || "").toLowerCase();
  const none: ListingLinks = { storefront: null, storefrontHint: null, sellerCenter: null, sellerExact: false, sellerLabel: "หลังร้าน" };
  if (!id) return { ...none, storefrontHint: "รายการนี้ไม่มีรหัสสินค้าบนร้าน" };
  const enc = encodeURIComponent(id);
  const ref = (shopRef ?? "").trim();

  if (code === "lazada") {
    return { storefront: `https://www.lazada.co.th/products/i${enc}.html`, storefrontHint: null, sellerCenter: `https://sellercenter.lazada.co.th/apps/product/publish?productId=${enc}`, sellerExact: true, sellerLabel: "Lazada Seller Center" };
  }
  if (code === "shopee") {
    // หน้าสินค้าต้องมี Shop ID ตัวเลข — รับทั้งตัวเลขล้วน และลิงก์ที่มี -i.{shop}.{item} / /product/{shop}/
    const shopId = /^\d+$/.test(ref) ? ref : (ref.match(/-i\.(\d+)\.\d+/)?.[1] ?? ref.match(/\/product\/(\d+)\//)?.[1] ?? null);
    return {
      storefront: shopId ? `https://shopee.co.th/product/${shopId}/${enc}` : null,
      storefrontHint: shopId ? null : `ต้องรู้ Shop ID (ตัวเลข) ของร้าน Shopee — ${ACCOUNTS_HINT}`,
      sellerCenter: `https://seller.shopee.co.th/portal/product/${enc}`, sellerExact: true, sellerLabel: "Shopee Seller Centre",
    };
  }
  if (code === "line_shopping" || code === "line") {
    const shop = platformShopUrl("line_shopping", ref);
    const base = shop && /shop\.line\.me\/@[^/?#]+/i.test(shop) ? shop.match(/^https?:\/\/shop\.line\.me\/@[^/?#]+/i)![0] : null;
    return {
      storefront: base ? `${base}/product/${enc}` : null,
      storefrontHint: base ? null : `ต้องรู้ลิงก์ร้าน LINE (https://shop.line.me/@…) — ${ACCOUNTS_HINT}`,
      sellerCenter: "https://oaplus.line.biz/", sellerExact: false, sellerLabel: "หลังร้าน LINE (MyShop)",
    };
  }
  if (code === "tiktok_shop" || code === "tiktok") {
    return { storefront: `https://shop.tiktok.com/view/product/${enc}?region=TH`, storefrontHint: null, sellerCenter: "https://seller-th.tiktok.com/", sellerExact: false, sellerLabel: "TikTok Seller Center" };
  }
  return { ...none, storefrontHint: "ร้านนี้ยังไม่รองรับลิงก์สินค้า" };
}
