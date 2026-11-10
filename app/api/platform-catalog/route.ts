/**
 * Platform Catalog (ทิศอ่าน) — /api/platform-catalog (โครง เฟสนี้ยังไม่ดึงข้อมูลจริง)
 * GET ?platform_id=&brand_id=&with_counts=1  (products.platforms.view)
 *   → fields (ฟิลด์ของแพลตฟอร์มนั้น), listings (สินค้าบนร้าน), summary {total, matched}
 *     with_counts=1 → platform_counts { [platform_id]: จำนวนสินค้า } เฉพาะร้านขายของ (โชว์บนปุ่มเลือกร้าน)
 *   view=brands → การ์ดหน้าเลือกแบรนด์ ShopBrandsResponse (ไม่ต้องมี platform_id)
 *   view=shop → มุมมองหน้าร้าน ShopViewResponse (lib/platform-listing-health) — สต๊อก/สถานะ/รูปจากร้าน · ยังไม่ลง · ไม่มีรูป · งานค้าง
 *   view=variants&listing_id= → ตัวเลือกบนร้าน ↔ SKU ในระบบ ListingVariantsResponse (lib/platform-variant-match) · อ่านอย่างเดียว
 *   view=listing&listing_id= → รายละเอียดสินค้าบนร้าน 1 รายการ + ประวัติ ListingDetailResponse (ลิ้นชักสินค้าบนร้าน)
 *   view=notlisted&platform_id&brand_id → สินค้าของแบรนด์ที่ยังไม่ลงร้านนี้ (ปุ่มเพิ่มสินค้าขึ้นร้าน)
 *   view=summary → รูป/สต๊อก/สถานะ/ราคาบนร้าน ต่อรายการ ListingSummariesResponse (หน้าจับคู่ โหลดตามหลังตาราง)
 * การนำเข้าจริง (อัปไฟล์ export / ต่อ API) มาเฟสถัดไป — โครงตาราง+หน้าพร้อมแล้ว
 * DELETE ?id=  (products.platforms.edit) → ลบรายการที่นำเข้าผิด (เป็นสำเนาข้อมูลจากร้าน — ของบนร้านจริงไม่ถูกแตะ)
 *   ถ้าสินค้านั้นยังอยู่ในไฟล์ export รอบหน้า จะกลับมาเอง (ต้องจับคู่ใหม่)
 * DELETE body { gone_ids: string[] } (≤500) → ล้างรายการ "ไม่อยู่บนร้านแล้ว" หลายตัว
 *   ลบเฉพาะตัวที่ status = "removed" จริง (ตัวที่ยังอยู่บนร้านส่งมาก็ไม่ลบ) · audit ทีละแถวพร้อมข้อมูลเดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, writeAuditMany } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { SELLING_PLATFORMS } from "@/lib/selling-platforms";
import { loadBrandSummaries, loadListingDetail, loadListingSummaries, loadListingVariants, loadNotListed, loadShopView } from "@/lib/platform-shop-view-server";
import { LISTING_GONE_STATUS, LIVE_LISTING_OR, type ListingSummariesResponse, type ShopBrandsResponse, type ShopViewResponse } from "@/lib/platform-listing-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  const search = (sp.get("search") ?? "").trim();                       // ค้นหา listing (สำหรับ picker จับคู่)
  const limit = Math.min(5000, Math.max(1, parseInt(sp.get("limit") ?? "5000", 10)));
  // หน้าเลือกแบรนด์ (มุมมองหน้าร้านต้องเลือกแบรนด์ก่อน) — ไม่ต้องระบุร้าน
  if (sp.get("view") === "brands") {
    const { brands, platforms } = await loadBrandSummaries(supabaseAdmin(), SELLING_PLATFORMS);
    const body: ShopBrandsResponse = { brands, platforms, error: null };
    return NextResponse.json(body);
  }
  // ตัวเลือกบนร้าน ↔ SKU ในระบบ (ป๊อปรายละเอียดสินค้าบนร้าน) — ไม่ต้องระบุร้าน (รู้จากรายการเอง)
  if (sp.get("view") === "listing") {
    const listingId = (sp.get("listing_id") ?? "").trim();
    if (!listingId) return NextResponse.json({ detail: null, error: "ต้องระบุสินค้าบนร้าน (listing_id)" }, { status: 400 });
    return NextResponse.json(await loadListingDetail(supabaseAdmin(), listingId));
  }
  if (sp.get("view") === "variants") {
    const listingId = (sp.get("listing_id") ?? "").trim();
    if (!listingId) return NextResponse.json({ error: "ต้องระบุสินค้าบนร้าน (listing_id)" }, { status: 400 });
    return NextResponse.json(await loadListingVariants(supabaseAdmin(), listingId));
  }
  if (!platformId) return NextResponse.json({ fields: [], listings: [], summary: { total: 0, matched: 0 }, error: null });
  const admin = supabaseAdmin();

  // มุมมองหน้าร้าน (Seller Center) — สรุปสต๊อก/สถานะ/รูป + ยังไม่ลง/ไม่มีรูป + งานค้าง (lib/platform-shop-view-server)
  if (sp.get("view") === "shop") {
    const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", platformId).maybeSingle();
    const platformCode = String((pf as { code?: string } | null)?.code ?? "");
    const [shop, platformCounts] = await Promise.all([
      loadShopView(admin, platformId, platformCode, brandId),
      sp.get("with_counts") === "1" ? countPerPlatform(admin, brandId) : Promise.resolve(undefined),
    ]);
    const body: ShopViewResponse = { platform_code: platformCode, ...shop, ...(platformCounts ? { platform_counts: platformCounts } : {}), error: null };
    return NextResponse.json(body);
  }

  // ปุ่มเพิ่มสินค้าขึ้นร้าน: สินค้าของแบรนด์ที่ยังไม่ลงร้านนี้
  if (sp.get("view") === "notlisted") {
    if (!brandId) return NextResponse.json({ parents: [], error: "เลือกแบรนด์ก่อน" }, { status: 400 });
    return NextResponse.json({ parents: await loadNotListed(admin, platformId, brandId), error: null });
  }

  // หน้าจับคู่: รูป/สต๊อก/สถานะ/ราคาบนร้าน ต่อรายการ (โหลดตามหลังตาราง ตารางขึ้นก่อน)
  if (sp.get("view") === "summary") {
    const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", platformId).maybeSingle();
    const platformCode = String((pf as { code?: string } | null)?.code ?? "");
    const body: ListingSummariesResponse = { summaries: await loadListingSummaries(admin, platformId, platformCode, brandId), error: null };
    return NextResponse.json(body);
  }

  // PostgREST ตัดที่ 1,000 แถวเงียบ ๆ → ไล่ทีละหน้าให้ครบ (ร้านที่มีสินค้าเกินพันตัวไม่หายครึ่ง)
  const listingsQuery = (from: number, to: number) => {
    let lq = admin.from("platform_catalog_listings").select("id, external_product_id, title, sku_code, matched_parent_sku_id, price, status, source, last_imported_at, match_ignored, match_ignore_reason, match_ignored_at").eq("platform_id", platformId);
    if (brandId) lq = lq.eq("brand_id", brandId);
    if (search) lq = lq.or(`title.ilike.%${search}%,sku_code.ilike.%${search}%,external_product_id.ilike.%${search}%`);
    return lq.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  };
  const withCounts = sp.get("with_counts") === "1";
  const [{ data: fields }, listings, platformCounts] = await Promise.all([
    admin.from("platform_field_schemas").select("field_key, field_label, data_type, is_required, sample, source").eq("platform_id", platformId).order("sort_order", { ascending: true }),
    fetchAllPages<Record<string, unknown>>(listingsQuery, { maxRows: limit, page: Math.min(1000, limit) }),
    withCounts ? countPerPlatform(admin, brandId) : Promise.resolve(undefined),
  ]);
  const rows = listings.slice(0, limit);
  // เติมรหัส/ชื่อ Parent SKU ที่จับคู่ไว้ (ไว้โชว์ว่าจับกับอะไร) — ถามเป็นชุดย่อยกัน .in() ยาวเกิน
  const matchedIds = [...new Set(rows.map((r) => r.matched_parent_sku_id).filter(Boolean) as string[])];
  const pMap = new Map<string, { code: string | null; name: string | null }>();
  for (let i = 0; i < matchedIds.length; i += 200) {
    const { data: ps } = await admin.from("parent_skus_v2").select("id, code, name_th").in("id", matchedIds.slice(i, i + 200));
    for (const p of ((ps ?? []) as Record<string, unknown>[])) pMap.set(String(p.id), { code: (p.code as string) ?? null, name: (p.name_th as string) ?? null });
  }
  for (const r of rows) {
    const m = r.matched_parent_sku_id ? pMap.get(String(r.matched_parent_sku_id)) : null;
    r.matched_code = m?.code ?? null; r.matched_name = m?.name ?? null;
  }
  return NextResponse.json({
    fields: (fields ?? []) as Record<string, unknown>[],
    listings: rows,
    summary: { total: rows.length, matched: rows.filter((r) => !!r.matched_parent_sku_id).length },
    ...(platformCounts ? { platform_counts: platformCounts } : {}),
    error: null,
  });
}

/** จำนวนสินค้าบนร้านต่อแพลตฟอร์ม (เฉพาะร้านขายของ · ไม่นับตัวที่ไม่อยู่บนร้านแล้ว) — นับแบบ head ไม่ดึงแถว */
async function countPerPlatform(admin: ReturnType<typeof supabaseAdmin>, brandId: string): Promise<Record<string, number>> {
  const { data: pfs } = await admin.from("erp_platforms").select("id, code").in("code", [...SELLING_PLATFORMS]);
  const out: Record<string, number> = {};
  await Promise.all(((pfs ?? []) as { id: string }[]).map(async (p) => {
    let q = admin.from("platform_catalog_listings").select("id", { count: "exact", head: true }).eq("platform_id", p.id).or(LIVE_LISTING_OR);
    if (brandId) q = q.eq("brand_id", brandId);
    const { count } = await q;
    out[p.id] = count ?? 0;
  }));
  return out;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) {
    // ล้างหลายตัว: รายการ "ไม่อยู่บนร้านแล้ว" (body { gone_ids })
    let body: { gone_ids?: unknown } = {};
    try { body = await request.json(); } catch { /* ไม่มี body */ }
    const goneIds = Array.isArray(body.gone_ids) ? [...new Set(body.gone_ids.map((x) => String(x ?? "").trim()).filter(Boolean))] : [];
    if (goneIds.length === 0) return NextResponse.json({ error: "ต้องระบุรายการ" }, { status: 400 });
    if (goneIds.length > 500) return NextResponse.json({ error: "ล้างได้ครั้งละไม่เกิน 500 รายการ" }, { status: 400 });
    return deleteGoneListings(goneIds, user ? { id: user.id, email: user.email ?? null } : null);
  }

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, brand_id, external_product_id, title, sku_code, matched_parent_sku_id, price, status, source, last_imported_at").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

  const { error } = await admin.from("platform_catalog_listings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "platform_catalog_listing", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { snapshot: cur } });
  return NextResponse.json({ ok: true, error: null });
}

/** ล้างรายการที่ไม่อยู่บนร้านแล้ว — ลบเฉพาะแถวที่ status "removed" จริง (ทีละชุด 200 กัน .in() ยาว) */
async function deleteGoneListings(ids: string[], user: { id: string; email: string | null } | null): Promise<NextResponse> {
  const admin = supabaseAdmin();
  const COLS = "id, platform_id, brand_id, external_product_id, title, sku_code, matched_parent_sku_id, price, status, source, last_imported_at";
  const targets: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("platform_catalog_listings").select(COLS).in("id", ids.slice(i, i + 200)).eq("status", LISTING_GONE_STATUS);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    targets.push(...((data ?? []) as Record<string, unknown>[]));
  }
  let deleted = 0;
  for (let i = 0; i < targets.length; i += 200) {
    const chunk = targets.slice(i, i + 200);
    const { error } = await admin.from("platform_catalog_listings").delete().in("id", chunk.map((t) => String(t.id))).eq("status", LISTING_GONE_STATUS);
    if (error) return NextResponse.json({ error: `${error.message} (ล้างไปแล้ว ${deleted} จาก ${targets.length})` }, { status: 400 });
    deleted += chunk.length;
    await writeAuditMany(admin, chunk.map((t) => ({
      action: "delete", entityType: "platform_catalog_listing", entityId: String(t.id), actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { reason: "gone_from_shop", snapshot: t },
    })));
  }
  return NextResponse.json({ ok: true, deleted, skipped: ids.length - deleted, error: null });
}
