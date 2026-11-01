/**
 * 🌐 โฟลเดอร์ "รูปบนเว็บ" ในอัลบั้มสินค้า (คลังไฟล์ → ดูตามแบรนด์ → Parent SKU) — ฝั่งเซิร์ฟเวอร์
 * อ่านตรงจากหน้าขายบนเว็บ (store_listings) ด้วยของกลาง listingImageSlots → ลงเว็บแล้วกดบันทึก = โผล่ในโฟลเดอร์เอง ไม่ต้อง sync
 * แยกร้าน → โฟลเดอร์ (รูปบนเว็บของรุ่น · รูปเปิด · แต่ละสีตามลำดับรหัส · แบนเนอร์) · เรียงตามที่โชว์บนเว็บ · วิดีโอไม่โชว์
 * ใช้ที่: GET /api/assets/brand-tree (mode=parent · mode=all-images ทำ zip)
 */
import { LISTING_FOLDER_LABEL, LISTING_IMAGE_SELECT, listingImageSlots, type ListingImageFolder, type ListingImageRow } from "@/lib/website-listing-images";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export type WebAlbumImg = { id: string; url: string; title: string };
export type WebAlbumFolder = { key: string; folder: ListingImageFolder; sku_id: string | null; label: string; images: WebAlbumImg[] };
export type WebAlbumShop = { shop_id: string; shop_name: string; folders: WebAlbumFolder[] };

const urlFor = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

export async function webAlbumForParent(admin: Admin, parentId: string): Promise<WebAlbumShop[]> {
  const { data: ls } = await admin.from("store_listings").select(`shop_id, ${LISTING_IMAGE_SELECT}`).eq("parent_sku_id", parentId);
  const listings = ((ls ?? []) as (ListingImageRow & { shop_id: string })[])
    .map((l) => ({ shopId: l.shop_id, slots: listingImageSlots(l).filter((s) => !s.video) }))
    .filter((l) => l.slots.length);
  if (!listings.length) return [];
  const keys = [...new Set(listings.flatMap((l) => l.slots.map((s) => s.key)))];
  const [{ data: shops }, { data: skus }, assets] = await Promise.all([
    admin.from("shops").select("id, name").in("id", listings.map((l) => l.shopId)),
    admin.from("skus_v2").select("id, code, color, color_th").eq("parent_sku_id", parentId).order("code"),
    (async () => {
      const out: { id: string; r2_key: string; title: string | null; file_name: string | null }[] = [];
      // ทีละ 50 key — ทีละมากทำให้ URL ยาวเกินจนคำขอพังเงียบ
      for (let i = 0; i < keys.length; i += 50) {
        const { data } = await admin.from("assets").select("id, r2_key, title, file_name").eq("status", "active").in("r2_key", keys.slice(i, i + 50));
        out.push(...((data ?? []) as typeof out));
      }
      return out;
    })(),
  ]);
  const shopName = new Map(((shops ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const skuList = (skus ?? []) as { id: string; code: string; color: string | null; color_th: string | null }[];
  const skuOrder = new Map(skuList.map((s, i) => [s.id, i]));
  const skuById = new Map(skuList.map((s) => [s.id, s]));
  const byKey = new Map(assets.map((a) => [a.r2_key, a]));
  const img = (key: string): WebAlbumImg => {
    const a = byKey.get(key);
    return { id: a?.id ?? "key:" + key, url: urlFor(key), title: a?.title || a?.file_name || key.split("/").pop() || key };
  };
  const rank = (f: WebAlbumFolder) => (f.folder === "gallery" ? -3 : f.folder === "hero" ? -2 : f.folder === "banner" ? 1e6 : skuOrder.get(f.sku_id ?? "") ?? 1e5);
  return listings.map(({ shopId, slots }) => {
    const folders = new Map<string, WebAlbumFolder>();
    for (const s of slots) {
      const key = s.folder === "sku" ? `sku:${s.skuId}` : s.folder;
      let f = folders.get(key);
      if (!f) {
        const sku = s.skuId ? skuById.get(s.skuId) : undefined;
        const label = s.folder === "sku" ? (sku ? [sku.code, sku.color_th || sku.color].filter(Boolean).join(" · ") : "SKU ที่ไม่อยู่ในรุ่นแล้ว") : LISTING_FOLDER_LABEL[s.folder].th;
        f = { key, folder: s.folder, sku_id: s.skuId, label, images: [] };
        folders.set(key, f);
      }
      f.images.push(img(s.key));
    }
    return { shop_id: shopId, shop_name: shopName.get(shopId) ?? "ร้าน", folders: [...folders.values()].sort((a, b) => rank(a) - rank(b)) };
  });
}
