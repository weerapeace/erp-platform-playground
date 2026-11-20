/**
 * ลิงก์ "สินค้านี้บนร้านต่าง ๆ" ของ Parent SKU (server เท่านั้น) — ของกลาง
 *   อ่านจากรายการสินค้าที่ซิงก์จากร้านจริง (platform_catalog_listings ที่จับคู่ Parent แล้ว) + บัญชีร้านของแบรนด์ (platform_accounts)
 *   ลิงก์หน้าร้าน = lib/platform-links (listingLinks) · เว็บร้านเรา = lib/website-links (productPageUrl) + โดเมนร้าน (loadShopSiteUrls)
 *   ไม่มีรายการบนร้าน / ร้านถูกลบ (isGoneStatus) / สร้างลิงก์ไม่ได้ = ไม่ใส่ (ชิปเทา ดีกว่าพาไปหน้าผิด)
 * ใช้ที่: การ์ดสินค้าในห้องแชท (lib/chat/products) · การ์ดสินค้าใน drawer โพสต์ Contents (/api/creative-content/shop-links)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { listingLinks } from "@/lib/platform-links";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { productPageUrl } from "@/lib/website-links";
import { loadShopSiteUrls } from "@/lib/website-site-url";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** ร้านที่โชว์ในการ์ดสินค้า (เรียงตามนี้) */
export const SHOP_LINK_PLATFORMS = ["shopee", "lazada", "tiktok", "line_shopping", "website"] as const;
export type ShopLink = { platform: string; url: string | null; price: number | null };

/** ลิงก์ของ Parent SKU บนแต่ละร้าน · codes = ร้านที่อยากได้ (ค่าเริ่มต้น SHOP_LINK_PLATFORMS) · ร้านที่ไม่มี = url null */
export async function loadProductShopLinks(admin: Admin, parent: { id: string; code: string; brand_id: string | null }, opts: { codes?: readonly string[]; preferBrandId?: string | null; /** true = เฉพาะร้านของแบรนด์นั้น (ห้องแชท: ลูกค้าคุยในร้านไหน ส่งลิงก์ร้านนั้น) */ strictBrand?: boolean } = {}): Promise<ShopLink[]> {
  const codes = opts.codes ?? SHOP_LINK_PLATFORMS;
  // ร้านของแบรนด์ที่ต้องการก่อน (เช่น แบรนด์ของโพสต์/ห้องแชท) → แบรนด์ของสินค้า → ร้านแบรนด์อื่นที่ขายรุ่นนี้
  const prefer = [opts.preferBrandId, parent.brand_id].filter((x): x is string => !!x);
  const out = new Map<string, ShopLink>(codes.map((c) => [c, { platform: c, url: null, price: null }]));
  const { data: pfs } = await admin.from("erp_platforms").select("id, code").in("code", [...codes]);
  const codeOf = new Map(((pfs ?? []) as Row[]).map((p) => [String(p.id), String(p.code)]));
  if (!codeOf.size) return [...out.values()];
  const pfIds = [...codeOf.keys()];
  const { data: listings } = await admin.from("platform_catalog_listings").select("platform_id, brand_id, external_product_id, price, status, raw, updated_at")
    .in("platform_id", pfIds).eq("matched_parent_sku_id", parent.id).order("updated_at", { ascending: false }).limit(40);
  const rank = (b: unknown) => { const i = prefer.indexOf(String(b)); return i < 0 ? prefer.length : i; };
  const rows = ((listings ?? []) as Row[]).filter((l) => !isGoneStatus(l.status as string | null) && (!opts.strictBrand || String(l.brand_id) === prefer[0])).sort((a, b) => rank(a.brand_id) - rank(b.brand_id));
  const brandIds = [...new Set(rows.map((l) => s(l.brand_id)).filter(Boolean))];
  const { data: accts } = brandIds.length
    ? await admin.from("platform_accounts").select("platform_id, brand_id, external_shop_id").in("platform_id", pfIds).in("brand_id", brandIds).eq("is_active", true)
    : { data: [] as Row[] };
  const shopRef = new Map<string, string>();   // "platform|brand" → ลิงก์ร้าน / Shop ID
  for (const a of (accts ?? []) as Row[]) { const k = `${a.platform_id}|${a.brand_id}`; if (!shopRef.has(k)) shopRef.set(k, s(a.external_shop_id)); }

  // เว็บร้านเรา: ลิงก์ = โดเมนของร้าน + รหัสรุ่น (ร้านยังไม่ตั้งโดเมน = ไม่มีลิงก์)
  const webShopIds = [...new Set(rows.filter((l) => codeOf.get(String(l.platform_id)) === "website")
    .map((l) => s(((l.raw as Row | null)?.website as Row | undefined)?.shop_id)).filter(Boolean))];
  const siteUrls = webShopIds.length ? await loadShopSiteUrls(admin, webShopIds).catch(() => new Map<string, string>()) : new Map<string, string>();

  for (const l of rows) {
    const code = codeOf.get(String(l.platform_id));
    const cur = code ? out.get(code) : undefined;
    if (!code || !cur || cur.url) continue;
    let url: string | null = null;
    if (code === "website") {
      const web = ((l.raw as Row | null)?.website ?? {}) as Row;
      if (web.published === false) continue;
      url = productPageUrl(siteUrls.get(s(web.shop_id)) ?? null, parent.code);
    } else {
      url = listingLinks(code, s(l.external_product_id), shopRef.get(`${l.platform_id}|${l.brand_id}`) ?? null).storefront;
    }
    if (!url) continue;
    const p = Number(l.price);
    out.set(code, { platform: code, url, price: Number.isFinite(p) && p > 0 ? p : null });
  }
  return [...out.values()];
}
