/**
 * ↩ ย้อนรูปบนเว็บ (รูปบนเว็บ · รูปสี · Hero ของ store_listings) — ของกลาง ฝั่งเซิร์ฟเวอร์
 * คืนค่าเดิม (before) เฉพาะแถวที่ "ยังเป็นค่าที่เราเพิ่งเขียน" (after) — มีคนแก้ต่อแล้ว = ข้าม ไม่ทับ (บอกกลับใน changed)
 * ใช้ร่วม: POST /api/website/listings/images { action:"undo" } · ย้อนชุดอัป (lib/image-batches)
 * ค่าเดิมผ่านตัวกรองช่องรูปชุดเดียวกับตอนบันทึก (listingPatchToRow) · audit ต่อร้าน (เก็บค่าก่อนย้อน) · ล้างแคชเว็บร้าน
 */
import { writeAudit } from "@/lib/audit";
import { listingPatchToRow, toKeyList } from "@/lib/website-listing-patch";
import { normalizeHero } from "@/lib/website-hero";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export type ListingChange = { shopId: string; parentId: string; before: Record<string, unknown>; after: Record<string, unknown> };

const UUID = /^[0-9a-f-]{36}$/i;
export const LISTING_IMG_COLS = ["web_images", "web_sku_images", "web_hero"] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** ตรวจรูปร่างรายการที่ส่งมา (จากหน้าเว็บ/ที่เก็บชุดอัป) */
export function parseListingChanges(raw: unknown): ListingChange[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 500)
    .map((c) => (c ?? {}) as ListingChange)
    .filter((c) => typeof c.shopId === "string" && UUID.test(c.shopId) && typeof c.parentId === "string" && UUID.test(c.parentId) && !!c.before && !!c.after && typeof c.before === "object" && typeof c.after === "object");
}

export async function undoListingChanges(
  sb: Admin,
  list: ListingChange[],
  actor: { id?: string | null; name?: string | null },
  meta: Record<string, unknown> = {},
): Promise<{ restored: number; changed: { shopId: string; parentId: string }[] }> {
  const restored: { shopId: string; parentId: string }[] = [];
  const changed: { shopId: string; parentId: string }[] = [];
  for (const c of list) {
    const { data: cur } = await sb.from("store_listings").select("web_images, web_sku_images, web_hero").eq("shop_id", c.shopId).eq("parent_sku_id", c.parentId).maybeSingle();
    if (!cur) continue;
    if (!LISTING_IMG_COLS.every((k) => same((cur as Record<string, unknown>)[k], c.after[k]))) {
      changed.push({ shopId: c.shopId, parentId: c.parentId });
      continue;
    }
    const row = listingPatchToRow({
      webImages: toKeyList(c.before.web_images),
      webSkuImages: (c.before.web_sku_images && typeof c.before.web_sku_images === "object" ? c.before.web_sku_images : {}) as Record<string, string[]>,
      webHero: normalizeHero(c.before.web_hero),
    });
    const { error } = await sb.from("store_listings").update({ updated_at: new Date().toISOString(), ...row }).eq("shop_id", c.shopId).eq("parent_sku_id", c.parentId);
    if (!error) restored.push({ shopId: c.shopId, parentId: c.parentId });
  }
  for (const shopId of [...new Set(restored.map((r) => r.shopId))]) {
    const mine = restored.filter((r) => r.shopId === shopId);
    await writeAudit(sb, {
      action: "bulk_update",
      entityType: "store_listing",
      entityId: shopId,
      actorId: actor.id ?? null,
      actorName: actor.name ?? null,
      metadata: { kind: "mass_images_undo", ...meta, count: mine.length, parentIds: mine.map((r) => r.parentId), before: Object.fromEntries(list.filter((c) => c.shopId === shopId).map((c) => [c.parentId, c.after])) },
    });
    await purgeStorefrontCache(sb, shopId);
  }
  return { restored: restored.length, changed };
}
