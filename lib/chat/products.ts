/**
 * ห้องแชทรวม — การ์ดสินค้า + สต็อกของสินค้าที่คุยในห้อง (server เท่านั้น)
 *   การ์ดสร้างจากข้อมูลจริงในระบบ (ไม่เชื่อค่าจากหน้าเว็บ): ชื่อ · รหัส · รูป
 *   ราคา + ลิงก์ = จากรายการบนร้านของช่องทางนั้นเท่านั้น (ราคาที่ลูกค้าเห็นจริง) — ไม่มีรายการบนร้าน = ไม่ใส่ราคา (พนักงานพิมพ์เอง)
 * ใช้ของกลาง: lib/product-shop-links (ลิงก์ + ราคาบนร้าน) · lib/sku-stock (สต็อก)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { loadProductShopLinks } from "@/lib/product-shop-links";
import { loadSkuStock } from "@/lib/sku-stock";
import { isUuid } from "./rules";
import type { ChatAttachment, ChatChannel } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
type ProductCard = Extract<ChatAttachment, { kind: "product" }>;
type Row = Record<string, unknown>;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** ช่องทางแชท → code แพลตฟอร์มที่เก็บรายการบนร้าน */
const LISTING_PLATFORM: Record<ChatChannel, string | null> = {
  line: "line_shopping", lazada: "lazada", shopee: "shopee", tiktok: "tiktok", facebook: null, instagram: null,
};

/** การ์ดสินค้าจาก SKU หรือ Parent SKU · null = หาไม่เจอ */
export async function resolveProductCard(admin: Admin, ref: { skuId?: unknown; parentId?: unknown }, channel: ChatChannel, brandId: string | null): Promise<ProductCard | null> {
  let sku: Row | null = null;
  let parentId = isUuid(ref.parentId) ? ref.parentId : null;
  if (isUuid(ref.skuId)) {
    const { data } = await admin.from("skus_v2").select("id, code, name_th, parent_sku_id, cover_image_r2_key").eq("id", ref.skuId).maybeSingle();
    sku = (data as Row | null) ?? null;
    if (!sku) return null;
    parentId = isUuid(sku.parent_sku_id) ? (sku.parent_sku_id as string) : parentId;
  }
  let parent: Row | null = null;
  if (parentId) {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_platform, name_th, brand_id, cover_image_r2_key").eq("id", parentId).maybeSingle();
    parent = (data as Row | null) ?? null;
  }
  if (!sku && !parent) return null;

  const card: ProductCard = {
    kind: "product",
    code: s(sku?.code) || s(parent?.code),
    name: (s(sku?.name_th) || s(parent?.name_platform) || s(parent?.name_th) || s(sku?.code) || s(parent?.code)).slice(0, 200),
    sku_id: sku ? String(sku.id) : null,
    parent_id: parent ? String(parent.id) : null,
    image_key: s(sku?.cover_image_r2_key) || s(parent?.cover_image_r2_key) || null,
    price: null, url: null, listing_id: null,
  };

  const pfCode = LISTING_PLATFORM[channel];
  const brand = brandId ?? (isUuid(parent?.brand_id) ? (parent!.brand_id as string) : null);
  if (pfCode && parent && brand) {
    try {
      const [l] = await loadProductShopLinks(admin, { id: String(parent.id), code: s(parent.code), brand_id: isUuid(parent.brand_id) ? (parent.brand_id as string) : null }, { codes: [pfCode], preferBrandId: brand, strictBrand: true });
      if (l?.url) { card.url = l.url; card.price = l.price; card.listing_id = l.external_id ?? null; }
    } catch { /* ไม่มีราคา/ลิงก์ก็ยังส่งการ์ดได้ */ }
  }
  return card;
}

/** สต็อกของสินค้าที่ส่งการ์ดในห้องนี้ (แผงขวา "สินค้าที่คุย") */
export async function productsInThread(admin: Admin, attachments: ChatAttachment[][]): Promise<{ sku_id: string; code: string; name: string; on_hand: number | null }[]> {
  const seen = new Map<string, ProductCard>();
  for (const list of attachments) for (const a of list) if (a.kind === "product" && a.sku_id && isUuid(a.sku_id) && !seen.has(a.sku_id)) seen.set(a.sku_id, a);
  const cards = [...seen.values()].slice(-10);
  if (cards.length === 0) return [];
  const stock = await loadSkuStock(admin, cards.map((c) => c.sku_id!)).catch(() => new Map());
  return cards.map((c) => ({ sku_id: c.sku_id!, code: c.code, name: c.name, on_hand: stock.get(c.sku_id!)?.onHand ?? null }));
}
