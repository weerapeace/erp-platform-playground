/**
 * 📸 ลงรูปเว็บทีละมาก — /api/website/listings/images
 * ใช้ที่ components/website-image-mass-upload (หน้า "สินค้าบนเว็บ" → ปุ่ม 📸 ลงรูปทีละมาก)
 *
 * GET  ?shopId=<id>  → แผนที่รูปของทั้งร้าน: ทุกรุ่น (รหัส · รูปบนเว็บ · Hero) + สี (รหัส · ชื่อสี · รูปสี · Hero สี · รหัส SKU ไซส์)
 *                      + ร้านอื่นที่มีรุ่นเดียวกัน (ไว้ติ๊ก "ลงที่ร้านอื่นด้วย")
 * POST { shopIds:[ร้านหลัก, ...ร้านอื่น], mode:"append"|"replace", items:[{ parentId, gallery?, skus?, hero?, skuHero? }] }
 *      → รวมกับรูปเดิม "ตอนบันทึก" (อ่านค่าล่าสุดใน DB — ไม่ทับของที่คนอื่นเพิ่งแก้) · ต่อท้าย = เดิม + ใหม่ (ตัดเพดาน 12/8) · แทนที่ = ใหม่ทั้งช่อง
 *        Hero ช่องละ 1 รูปเสมอ (ไฟล์ใหม่แทนของเดิม) · ช่องที่ไม่มีรูปใหม่ = ไม่แตะ · รุ่นที่ไม่อยู่ในร้านนั้น = ข้าม (บอกกลับ)
 *
 * ของกลาง: guardApi(products.view/edit) · mergeListingImages (รวมกับรูปเดิม) · listingPatchToRow (ตัวกรองช่องรูปชุดเดียวกับตัวตั้งค่าเว็บของสินค้า) · writeAudit (เก็บค่าเดิมไว้ย้อนได้) · purgeStorefrontCache
 * ไฟล์อัปขึ้น R2 จากฝั่งหน้าเว็บก่อน (uploadResizedImage) — API นี้รับแค่ key
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { listingPatchToRow, toKeyList, LISTING_KEY_RE } from "@/lib/website-listing-patch";
import { normalizeHero, type HeroMedia } from "@/lib/website-hero";
import { mergeListingImages } from "@/lib/website-image-merge";
import { variantOf, baseColor } from "@/lib/website-size-options";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { MAX_WEB_IMAGES, type CatalogParent, type HeroPick, type HeroSlot, type MassImageItem } from "@/lib/website-image-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
type Kid = { id: string; code: string | null; color: string | null; color_th: string | null; attribute_values: Record<string, unknown> | null; parent_sku_id: string };
type ListingImgRow = { parent_sku_id: string; web_images: unknown; web_sku_images: unknown; web_hero: unknown };

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const keysOf = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && LISTING_KEY_RE.test(k)) : []).slice(0, max);
const heroKey = (m: HeroMedia | null | undefined) => (m?.key ? m.key : null);

/** SKU ลูกของหลายรุ่น (เฉพาะที่ใช้งาน) */
async function loadKids(sb: ReturnType<typeof supabaseAdmin>, parentIds: string[]): Promise<Kid[]> {
  const out: Kid[] = [];
  for (const ids of chunk(parentIds, 150)) {
    const { data } = await sb.from("skus_v2").select("id, code, color, color_th, attribute_values, parent_sku_id").in("parent_sku_id", ids).eq("is_active", true).order("code");
    out.push(...((data ?? []) as Kid[]));
  }
  return out;
}

/**
 * สีของรุ่น = SKU ตัวหลักของสี (ไม่ใช่ SKU ไซส์) — ตรงกับแถวสีในตัวตั้งค่าเว็บของสินค้า (/api/parent-web-listings)
 * SKU ไซส์ (JEAN08-01-L) = alias ของตัวหลักสีเดียวกัน → ไฟล์ชื่อ JEAN08-01-L_1.jpg ลงรูปสี JEAN08-01
 */
function colorsOf(kids: Kid[]): { base: Kid; aliases: string[] }[] {
  const baseColors = new Set(kids.filter((k) => !variantOf(k)).map((k) => baseColor(k)));
  const bases = kids.filter((k) => !variantOf(k) || !baseColors.has(baseColor(k)));
  const baseIds = new Set(bases.map((k) => k.id));
  return bases.map((b) => ({
    base: b,
    aliases: kids.filter((k) => !baseIds.has(k.id) && baseColor(k) === baseColor(b) && k.code).map((k) => k.code as string),
  }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const shopId = (new URL(request.url).searchParams.get("shopId") ?? "").trim();
  if (!UUID.test(shopId)) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });
  const sb = supabaseAdmin();

  const [{ data: shopRows }, { data: rows, error }] = await Promise.all([
    sb.from("shops").select("id, name").order("is_default", { ascending: false }).order("name"),
    sb.from("store_listings").select("parent_sku_id, web_images, web_sku_images, web_hero").eq("shop_id", shopId),
  ]);
  if (error) return NextResponse.json({ error: "โหลดรายการสินค้าไม่สำเร็จ" }, { status: 500 });
  const listings = (rows ?? []) as ListingImgRow[];
  const parentIds = listings.map((r) => r.parent_sku_id);
  if (!parentIds.length) return NextResponse.json({ parents: [], otherShops: [] });

  const parentRows: { id: string; code: string | null; name_th: string | null; name_platform: string | null }[] = [];
  const others: { shop_id: string; parent_sku_id: string }[] = [];
  for (const ids of chunk(parentIds, 150)) {
    const [{ data: ps }, { data: os }] = await Promise.all([
      sb.from("parent_skus_v2").select("id, code, name_th, name_platform").in("id", ids),
      sb.from("store_listings").select("shop_id, parent_sku_id").neq("shop_id", shopId).in("parent_sku_id", ids),
    ]);
    parentRows.push(...((ps ?? []) as typeof parentRows));
    others.push(...((os ?? []) as typeof others));
  }
  const kids = await loadKids(sb, parentIds);
  const kidsBy = new Map<string, Kid[]>();
  for (const k of kids) kidsBy.set(k.parent_sku_id, [...(kidsBy.get(k.parent_sku_id) ?? []), k]);
  const otherBy = new Map<string, string[]>();
  for (const o of others) otherBy.set(o.parent_sku_id, [...(otherBy.get(o.parent_sku_id) ?? []), o.shop_id]);
  const pById = new Map(parentRows.map((p) => [p.id, p]));

  const parents: (CatalogParent & { otherShopIds: string[] })[] = [];
  for (const r of listings) {
    const p = pById.get(r.parent_sku_id);
    if (!p?.code) continue;
    const hero = normalizeHero(r.web_hero);
    const skuImgs = (r.web_sku_images && typeof r.web_sku_images === "object" ? r.web_sku_images : {}) as Record<string, unknown>;
    parents.push({
      parentId: p.id,
      code: p.code,
      name: (p.name_platform ?? "").trim() || (p.name_th ?? "").trim() || p.code,
      webImages: keysOf(r.web_images, MAX_WEB_IMAGES),
      hero: { desktop: heroKey(hero?.desktop), mobile: heroKey(hero?.mobile) },
      skus: colorsOf(kidsBy.get(p.id) ?? [])
        .filter((c) => c.base.code)
        .map(({ base, aliases }, i) => ({
          id: base.id,
          code: base.code as string,
          label: baseColor(base) || `แบบ ${i + 1}`,
          aliases,
          webImages: toKeyList(skuImgs[base.id]),
          hero: { desktop: heroKey(hero?.sku?.[base.id]?.desktop), mobile: heroKey(hero?.sku?.[base.id]?.mobile) },
        })),
      otherShopIds: otherBy.get(p.id) ?? [],
    });
  }
  parents.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  const usedShops = new Set(others.map((o) => o.shop_id));
  const otherShops = ((shopRows ?? []) as { id: string; name: string }[]).filter((s) => usedShops.has(s.id));
  return NextResponse.json({ parents, otherShops });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  let b: { shopIds?: unknown; mode?: unknown; items?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const shopIds = Array.isArray(b.shopIds) ? [...new Set(b.shopIds.filter((s): s is string => typeof s === "string" && UUID.test(s)))].slice(0, 10) : [];
  const mode = b.mode === "replace" ? "replace" : "append";
  const items: MassImageItem[] = (Array.isArray(b.items) ? b.items : [])
    .slice(0, 500)
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const obj = <T,>(v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : undefined);
      return {
        parentId: typeof o.parentId === "string" ? o.parentId : "",
        gallery: Array.isArray(o.gallery) ? (o.gallery as string[]) : undefined,
        skus: obj<Record<string, string[]>>(o.skus),
        hero: obj<Partial<Record<HeroSlot, HeroPick>>>(o.hero),
        skuHero: obj<Record<string, Partial<Record<HeroSlot, HeroPick>>>>(o.skuHero),
      };
    })
    .filter((it) => UUID.test(it.parentId));
  if (!shopIds.length || !items.length) return NextResponse.json({ error: "ต้องระบุร้าน + รูปที่จะลง" }, { status: 400 });

  const sb = supabaseAdmin();
  const parentIds = [...new Set(items.map((i) => i.parentId))];
  // สีที่ลงได้ต้องเป็นของรุ่นนั้นจริง (กันส่ง id สีของรุ่นอื่นมา)
  const kidOk = new Map<string, Set<string>>();
  for (const k of await loadKids(sb, parentIds)) kidOk.set(k.parent_sku_id, (kidOk.get(k.parent_sku_id) ?? new Set()).add(k.id));
  const cur = new Map<string, ListingImgRow>();
  for (const ids of chunk(parentIds, 150)) {
    const { data } = await sb.from("store_listings").select("shop_id, parent_sku_id, web_images, web_sku_images, web_hero").in("shop_id", shopIds).in("parent_sku_id", ids);
    for (const r of (data ?? []) as (ListingImgRow & { shop_id: string })[]) cur.set(`${r.shop_id}|${r.parent_sku_id}`, r);
  }

  const now = new Date().toISOString();
  const jobs: { shopId: string; parentId: string; row: Record<string, unknown>; before: Record<string, unknown>; files: number }[] = [];
  const skipped: { shopId: string; parentId: string; reason: string }[] = [];
  for (const shopId of shopIds) {
    for (const it of items) {
      const r = cur.get(`${shopId}|${it.parentId}`);
      if (!r) {
        skipped.push({ shopId, parentId: it.parentId, reason: "รุ่นนี้ไม่อยู่ในร้านนี้" });
        continue;
      }
      const { patch, files } = mergeListingImages(r, it, kidOk.get(it.parentId) ?? new Set<string>(), mode);
      if (!files) continue;
      jobs.push({
        shopId,
        parentId: it.parentId,
        files,
        row: { updated_at: now, ...listingPatchToRow(patch) },
        before: { web_images: r.web_images ?? null, web_sku_images: r.web_sku_images ?? null, web_hero: r.web_hero ?? null },
      });
    }
  }

  const failed: { shopId: string; parentId: string }[] = [];
  for (const batch of chunk(jobs, 10)) {
    const res = await Promise.all(batch.map((j) => sb.from("store_listings").update(j.row).eq("shop_id", j.shopId).eq("parent_sku_id", j.parentId)));
    res.forEach((x, i) => x.error && failed.push({ shopId: batch[i].shopId, parentId: batch[i].parentId }));
  }
  const failedSet = new Set(failed.map((f) => `${f.shopId}|${f.parentId}`));
  const done = jobs.filter((j) => !failedSet.has(`${j.shopId}|${j.parentId}`));

  // audit ต่อร้าน — เก็บค่าเดิมของทุกรุ่นที่แตะ (ย้อนกลับได้จาก metadata.before)
  for (const shopId of shopIds) {
    const mine = done.filter((j) => j.shopId === shopId);
    if (!mine.length) continue;
    await writeAudit(sb, {
      action: "bulk_update",
      entityType: "store_listing",
      entityId: shopId,
      actorId: user?.id ?? null,
      actorName: user?.email ?? null,
      metadata: { kind: "mass_images", mode, count: mine.length, files: mine.reduce((n, j) => n + j.files, 0), parentIds: mine.map((j) => j.parentId), before: Object.fromEntries(mine.map((j) => [j.parentId, j.before])) },
    });
  }
  const purged = (await Promise.all(shopIds.filter((s) => done.some((j) => j.shopId === s)).map((s) => purgeStorefrontCache(sb, s)))).every(Boolean);
  return NextResponse.json({ ok: !failed.length, updated: done.length, failed, skipped, purged });
}
