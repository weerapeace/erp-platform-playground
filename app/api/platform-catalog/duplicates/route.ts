/**
 * สินค้าซ้ำบนร้าน — /api/platform-catalog/duplicates (เจ้าของเลือก 2026-11-23 วิธี B + ข้อ 1-5 · กติกา lib/platform-duplicates)
 *
 * GET  ?platform_id=&brand_id=                     (products.platforms.view) → { groups, summary } กลุ่มที่ 1 รุ่นมี ≥ 2 รายการบนร้าน
 *      ยอดขาย 90 วัน = ออเดอร์ในระบบ (platform_order_items.raw item_id) · ระบบสร้าง = audit "*_create"
 * POST { action: "ignore" | "unignore", platform_id, brand_id, parent_id }   (products.platforms.edit) → ข้อ 3 "ไม่ใช่ตัวซ้ำ" (ui_config · audit)
 * POST { action: "check", listing_id }      (products.platforms.view) → ข้อ 2 เช็กสดก่อนเปิดไปลบ (Shopee): สถานะ · โปรโมชัน · ออเดอร์ค้าง
 * POST { action: "recheck", listing_id }    (products.platforms.edit) → เช็กว่าลบแล้ว (Shopee): ไม่เจอ/ลบแล้ว = ติดป้าย "ไม่อยู่บนร้านแล้ว"
 * ระบบไม่ลบอะไรบนร้านเอง (วิธี B — เจ้าของลบใน Seller Centre) · ปิดขาย (ข้อ 4) ใช้ /api/shopee/listing-display เดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { LIVE_LISTING_OR, LISTING_GONE_STATUS } from "@/lib/platform-listing-health";
import { SHOPEE_OPEN_ORDER_STATUSES, buildDuplicateGroups, dupIgnoredKey, type DupListing } from "@/lib/platform-duplicates";
import { loadShopeeListingLive, saveShopeeSlimCopy } from "../../shopee/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const UUID = /^[0-9a-f-]{36}$/i;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function ignoredSet(admin: ReturnType<typeof supabaseAdmin>, platformId: string, brandId: string): Promise<Set<string>> {
  const { data } = await admin.from("ui_config").select("value").eq("key", dupIgnoredKey(platformId, brandId)).maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  return new Set(Array.isArray(v) ? v.map(str).filter(Boolean) : []);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const platformId = str(sp.get("platform_id")), brandId = str(sp.get("brand_id"));
  if (!UUID.test(platformId) || !UUID.test(brandId)) return NextResponse.json({ groups: [], error: "ต้องเลือกร้านและแบรนด์" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const rows = await fetchAllPages<Row>((from, to) => admin.from("platform_catalog_listings")
      .select("id, external_product_id, matched_parent_sku_id, status, price, title, raw").eq("platform_id", platformId).eq("brand_id", brandId)
      .not("matched_parent_sku_id", "is", null).or(LIVE_LISTING_OR).order("id").range(from, to), { strict: true });
    // นับต่อรุ่น → เก็บเฉพาะรุ่นที่ซ้ำ
    const count = new Map<string, number>();
    for (const r of rows) count.set(str(r.matched_parent_sku_id), (count.get(str(r.matched_parent_sku_id)) ?? 0) + 1);
    const dupRows = rows.filter((r) => (count.get(str(r.matched_parent_sku_id)) ?? 0) > 1);
    const parentIds = [...new Set(dupRows.map((r) => str(r.matched_parent_sku_id)))];
    const itemIds = [...new Set(dupRows.map((r) => str(r.external_product_id)).filter(Boolean))];
    // รุ่น · ยอดขาย 90 วัน · ระบบสร้าง · กลุ่มที่ซ่อน — ยิงพร้อมกัน
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    const [parentRows, salesRows, erpRows, ignored] = await Promise.all([
      Promise.all(chunk(parentIds, 150).map((part) => admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", part))).then((rs) => rs.flatMap((r) => (r.data ?? []) as Row[])),
      Promise.all(chunk(itemIds, 150).map((part) => admin.from("platform_order_items").select("qty, item:raw->>item_id, platform_orders!inner(created_at, platform_id)")
        .in("raw->>item_id", part).eq("platform_orders.platform_id", platformId).gte("platform_orders.created_at", since).limit(5000))).then((rs) => rs.flatMap((r) => (r.data ?? []) as Row[])),
      Promise.all(chunk(itemIds, 150).map((part) => admin.from("audit_logs").select("item:metadata->>item_id").eq("action", "create").like("metadata->>source", "%_create").in("metadata->>item_id", part))).then((rs) => rs.flatMap((r) => (r.data ?? []) as Row[])),
      ignoredSet(admin, platformId, brandId),
    ]);
    const sales = new Map<string, number>();
    for (const s of salesRows) sales.set(str(s.item), (sales.get(str(s.item)) ?? 0) + (num(s.qty) ?? 1));
    const erp = new Set(erpRows.map((e) => str(e.item)).filter(Boolean));
    const parents = Object.fromEntries(parentRows.map((p) => [str(p.id), { code: str(p.code), name: str(p.name_th) || null, cover: str(p.cover_image_r2_key) || null }]));
    const listings = dupRows.map((r) => {
      const raw = (r.raw as Row | null) ?? {};
      const slim = (Object.values(raw)[0] as Row | undefined) ?? {};   // raw.{shopee|lazada|…}
      const ext = str(r.external_product_id);
      return {
        parentId: str(r.matched_parent_sku_id), id: str(r.id), externalId: ext, status: str(r.status) || str(slim.status).toLowerCase() || null,
        price: num(r.price), title: str(r.title) || null, image: str(slim.image) || null, updateTime: num(slim.update_time),
        sales90: sales.get(ext) ?? 0, byErp: erp.has(ext) || slim.created_by_erp === true,
      } satisfies DupListing & { parentId: string };
    });
    const groups = buildDuplicateGroups(listings, parents, ignored);
    const shown = groups.filter((g) => !g.ignored);
    return NextResponse.json({
      groups, error: null,
      summary: { groups: shown.length, extra: shown.reduce((n, g) => n + g.listings.length - 1, 0), ignored: groups.length - shown.length,
        two_selling: shown.filter((g) => g.tags.includes("two_selling")).length, none_selling: shown.filter((g) => g.tags.includes("none_selling")).length, erp_made: shown.filter((g) => g.tags.includes("erp_made")).length },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ groups: [], error: `โหลดสินค้าซ้ำไม่สำเร็จ: ${(e as Error).message}` }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // เช็กสิทธิ์ขั้นต่ำก่อนอ่านคำขอ (คำสั่งที่แก้ข้อมูลเช็ก products.platforms.edit ซ้ำด้านล่าง)
  const deniedView = await guardApi(request, "products.platforms.view"); if (deniedView) return deniedView;
  let body: { action?: string; platform_id?: string; brand_id?: string; parent_id?: string; listing_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const action = str(body.action);
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  // ข้อ 3: ไม่ใช่ตัวซ้ำ / เอากลับมา
  if (action === "ignore" || action === "unignore") {
    const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
    const platformId = str(body.platform_id), brandId = str(body.brand_id), parentId = str(body.parent_id);
    if (!UUID.test(platformId) || !UUID.test(brandId) || !UUID.test(parentId)) return NextResponse.json({ ok: false, error: "ข้อมูลไม่ครบ" }, { status: 400 });
    const set = await ignoredSet(admin, platformId, brandId);
    const before = set.has(parentId);
    if (action === "ignore") set.add(parentId); else set.delete(parentId);
    const { error } = await admin.from("ui_config").upsert({ key: dupIgnoredKey(platformId, brandId), value: [...set], updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await writeAudit(admin, { action: "update", entityType: "platform_duplicates", entityId: parentId, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { source: "platform_duplicates", platform_id: platformId, brand_id: brandId, changes: [{ field: "ignored", label: "ไม่ใช่ตัวซ้ำ", old: before, new: action === "ignore" }] } });
    return NextResponse.json({ ok: true, error: null });
  }

  const listingId = str(body.listing_id);
  if (!UUID.test(listingId)) return NextResponse.json({ ok: false, error: "ต้องระบุรายการ" }, { status: 400 });

  // ข้อ 2: เช็กสดก่อนเปิดไปลบ (Shopee)
  if (action === "check") {
    const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
    const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
    if (!r.ok) return NextResponse.json({ ok: false, safe: false, reasons: [r.error], error: r.error }, { status: r.status === 404 ? 200 : r.status });
    const reasons: string[] = [];
    const promo = r.view.models.filter((m) => m.promo).length;
    if (promo) reasons.push(`อยู่ในโปรโมชัน ${promo} ตัวเลือก — ถอดออกจากโปรก่อนลบ`);
    const { data: open } = await admin.from("platform_order_items").select("id, platform_orders!inner(platform_status, created_at)")
      .eq("raw->>item_id", r.itemId).in("platform_orders.platform_status", [...SHOPEE_OPEN_ORDER_STATUSES])
      .gte("platform_orders.created_at", new Date(Date.now() - 60 * 86400_000).toISOString()).limit(50);
    const openN = ((open ?? []) as Row[]).length;
    if (openN) reasons.push(`มีออเดอร์ที่ยังไม่จบ ${openN} รายการ — รอส่งเสร็จก่อนลบ`);
    return NextResponse.json({ ok: true, safe: reasons.length === 0, status: r.view.status, reasons, error: null });
  }

  // เช็กว่าลบแล้ว (Shopee) — ไม่เจอบนร้าน / ลบแล้ว = ติดป้าย "ไม่อยู่บนร้านแล้ว"
  if (action === "recheck") {
    const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
    const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
    const gone = !r.ok ? r.status === 404 : ["SELLER_DELETE", "SHOPEE_DELETE"].includes(r.view.status);
    if (!r.ok && !gone) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    if (gone) {
      const { error } = await admin.from("platform_catalog_listings").update({ status: LISTING_GONE_STATUS }).eq("id", listingId);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await writeAudit(admin, { action: "update", entityType: "platform_catalog", entityId: listingId, actorId: user?.id ?? null, actorName: user?.email ?? null,
        metadata: { source: "platform_duplicates", changes: [{ field: "status", label: "สถานะบนร้าน", old: r.ok ? r.view.status : "?", new: LISTING_GONE_STATUS }], note: "ลบตัวซ้ำใน Seller Centre แล้ว" } });
      return NextResponse.json({ ok: true, gone: true, status: LISTING_GONE_STATUS, error: null });
    }
    if (r.ok) await saveShopeeSlimCopy(admin, r.row, r.live);
    return NextResponse.json({ ok: true, gone: false, status: r.ok ? r.view.status : null, error: null });
  }
  return NextResponse.json({ ok: false, error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}
