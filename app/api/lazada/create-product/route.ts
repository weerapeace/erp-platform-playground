/**
 * สร้างสินค้าใหม่บน Lazada — /api/lazada/create-product
 *
 *  GET  ?parent_sku_id=   (products.platforms.view) → { preview, blockers, live } ตัวช่วยลงสินค้า ขั้น "ดูก่อนส่ง" (ไม่ส่งอะไรขึ้นร้าน)
 *  POST { parent_sku_id, display?: "hide" | "onsale" }   (products.platforms.publish) → สร้างบนร้านจริง
 *        ปิดไว้จนกว่า LAZADA_CREATE_LIVE (lib/platform-create-registry) — Lazada ปิดการสร้างสินค้าผ่าน API ช่วงแคมเปญ
 *        ลำดับ: กันซ้ำ (มีบนร้าน/ร่างมีรหัส) → ล็อก 3 นาที → ฝากรูปเข้า Lazada (/image/migrate) → /product/create
 *               → เก็บรหัสในร่าง + รายการบนร้าน (จับคู่) → ปิดขายไว้ก่อน (ค่าเริ่ม) → ประวัติ
 *
 * ตัวประกอบข้อมูลตัวเดียว = lib/lazada-create-plan (GET กับ POST ใช้ ./load ตัวเดียวกัน — ห้ามประกอบแยก)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazCreateProduct, lazDeactivateProduct, lazErrorText, lazGetItem, lazMigrateImage, lazProductToCatalogItem } from "@/lib/lazada";
import { lazDeactivateXml, lazMigrateImageXml } from "@/lib/lazada-listing-edit";
import { lazCreateImageRefs, lazCreateResolveImages, type LazCreatePreview } from "@/lib/lazada-create-plan";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { upsertCatalogListings } from "@/lib/platform-catalog-sync";
import { LAZADA_CREATE_LIVE } from "@/lib/platform-create-registry";
import { loadLazadaCreate } from "./load";
import { lazWithRetry } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
type Resp = { preview: LazCreatePreview | null; blockers?: string[]; live?: boolean; platform_id?: string; brand_id?: string | null; error: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const parentId = (request.nextUrl.searchParams.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ preview: null, error: "ต้องระบุ parent_sku_id" } satisfies Resp, { status: 400, headers: NO_STORE });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const r = await loadLazadaCreate(supabaseAdmin(), parentId, user?.id ?? null);
  if (!r.ok) return NextResponse.json({ preview: null, error: r.error } satisfies Resp, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ preview: r.preview, blockers: r.blockers, live: LAZADA_CREATE_LIVE, platform_id: r.platformId, brand_id: r.brandId, error: null } satisfies Resp, { headers: NO_STORE });
}

/** ฝากรูป: รูปในระบบ (r2:) = JPG จัตุรัสพื้นขาว 1500px (ตัวเดียวกับลิ้นชัก Lazada) · ลิงก์อื่น = ฝากลิงก์นั้น */
const migrateUrlOf = (ref: string) => (ref.startsWith("r2:") ? `${publicImageUrl(ref.slice(3))}&w=1500&sq=1` : ref);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  if (!LAZADA_CREATE_LIVE) return NextResponse.json({ ok: false, error: "ยังไม่เปิดลงสินค้าจริงบน Lazada — Lazada ปิดการสร้างสินค้าผ่าน API ช่วงแคมเปญ (ตอนนี้ดูก่อนส่ง + บันทึกร่างได้)" }, { status: 403 });
  let body: { parent_sku_id?: string; display?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const parentId = String(body.parent_sku_id ?? "").trim();
  if (!parentId) return NextResponse.json({ ok: false, error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const display = body.display === "onsale" ? "onsale" : "hide";
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorId = user?.id ?? null; const actorName = user?.email ?? null;
  const admin = supabaseAdmin();

  const r = await loadLazadaCreate(admin, parentId, actorId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  if (r.preview.on_shop) return NextResponse.json({ ok: false, error: `มีบน Lazada แล้ว (#${r.preview.on_shop}) — ไม่สร้างซ้ำ` }, { status: 409 });
  if (r.blockers.length) return NextResponse.json({ ok: false, error: r.blockers.join(" · ") }, { status: 400 });
  if (r.preview.missing.length) return NextResponse.json({ ok: false, error: `ข้อมูลยังไม่ครบ: ${r.preview.missing.join(" · ")}` }, { status: 400 });
  if (!r.token || !r.brandId) return NextResponse.json({ ok: false, error: "แบรนด์นี้ยังเชื่อม Lazada ไม่ได้" }, { status: 400 });
  const { platformId, brandId, token } = r;

  // 🔒 ล็อก (กันกดซ้ำ/ลงพร้อมกัน) — ช่องเดิมของร่าง · ค้างเกิน 3 นาที = หลุด ลองใหม่ได้ (แบบเดียวกับ LINE)
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id: parentId, platform_id: platformId }, { onConflict: "parent_sku_id,platform_id", ignoreDuplicates: true });
  const lockAt = new Date();
  const staleIso = new Date(lockAt.getTime() - 3 * 60 * 1000).toISOString();
  const { data: claimed } = await admin.from("platform_listing_drafts")
    .update({ last_sync_status: "creating", last_synced_at: lockAt.toISOString(), last_error: null })
    .eq("parent_sku_id", parentId).eq("platform_id", platformId).is("platform_product_id", null)
    .or(`last_sync_status.is.null,last_sync_status.neq.creating,last_synced_at.lt.${staleIso}`)
    .select("id");
  if (!claimed?.length) return NextResponse.json({ ok: false, error: "กำลังสร้างสินค้านี้บน Lazada อยู่ (มีการกดไปแล้ว) — รอ 1-2 นาที แล้วดึงสินค้าจาก Lazada เพื่อตรวจก่อนลองใหม่" }, { status: 409 });
  const fail = async (msg: string, status = 400) => {
    await admin.from("platform_listing_drafts").update({ last_sync_status: "failed", last_error: msg.slice(0, 500), last_synced_at: new Date().toISOString() }).eq("parent_sku_id", parentId).eq("platform_id", platformId);
    await writeAudit(admin, { action: "create", entityType: "platform_catalog", entityId: null, actorId, actorName, metadata: { source: "lazada_create", ok: false, error: msg, parent_sku_id: parentId, brand_id: brandId } });
    return NextResponse.json({ ok: false, error: msg }, { status });
  };

  // 1) ฝากรูปเข้า Lazada ทีละรูป (Lazada ไม่รับลิงก์นอก — 4138) · ฝากไม่ผ่าน = หยุด ไม่สร้างสินค้า
  const migrated = new Map<string, string>();
  for (const ref of lazCreateImageRefs(r.payload)) {
    try { migrated.set(ref, await lazWithRetry(() => lazMigrateImage(token.gateway, token.accessToken, lazMigrateImageXml(migrateUrlOf(ref))), "create-product migrate")); }
    catch (e) { return fail(`ฝากรูปกับ Lazada ไม่สำเร็จ: ${lazErrorText(e)}`); }
  }
  const payload = lazCreateResolveImages(r.payload, migrated);

  // 2) สร้างสินค้า — ไม่ลองซ้ำอัตโนมัติ (กันสร้างซ้ำ) · ⚠️ เฟส C ตรวจ: คู่มือบอก brand จะเลิกใช้ → ถ้า Lazada ไม่รับ "No Brand" ต้องหา brand_id (GetBrandByPages)
  let created: Awaited<ReturnType<typeof lazCreateProduct>>;
  try { created = await lazCreateProduct(token.gateway, token.accessToken, JSON.stringify(payload)); }
  catch (e) { return fail(`Lazada ไม่รับ: ${lazErrorText(e)} — ถ้าไม่แน่ใจว่าสร้างไปแล้วหรือยัง ให้ดึงสินค้าจาก Lazada ก่อนลองใหม่`); }
  const itemId = created.itemId;
  const now = new Date().toISOString();
  await admin.from("platform_listing_drafts").update({ platform_product_id: itemId, status: "published", last_sync_status: "created", last_synced_at: now, last_error: null })
    .eq("parent_sku_id", parentId).eq("platform_id", platformId);

  // 3) ปิดขายไว้ก่อน (ค่าเริ่ม) — ตรวจบนร้านแล้วค่อยเปิด
  let displayRes: { ok: boolean; status: "hide" | "onsale"; error: string | null } = { ok: true, status: "onsale", error: null };
  if (display === "hide") {
    try { await lazDeactivateProduct(token.gateway, token.accessToken, lazDeactivateXml(itemId)); displayRes = { ok: true, status: "hide", error: null }; }
    catch (e) { displayRes = { ok: false, status: "onsale", error: lazErrorText(e) }; }
  }

  // 4) เก็บรายการบนร้าน + จับคู่สินค้านี้ (ดึงกลับจาก Lazada — ไม่ได้ = เก็บเท่าที่รู้)
  try {
    const item = await lazWithRetry(() => lazGetItem(token.gateway, token.accessToken, itemId), "create-product refetch").catch(() => null);
    const slim = item ? lazProductToCatalogItem(item) : null;
    const prev = r.preview;
    await upsertCatalogListings(admin, {
      platformId, brandId, source: "api",
      items: [slim ?? { external_product_id: itemId, title: prev.name.value, skus: prev.variants.map((v) => v.code), price: prev.variants[0]?.price ?? null, status: displayRes.status === "hide" ? "inactive" : "active", raw: { lazada: { item_id: itemId, created_by_erp: true } } }],
    });
    await admin.from("platform_catalog_listings").update({ matched_parent_sku_id: parentId }).eq("platform_id", platformId).eq("external_product_id", itemId);
  } catch { /* สินค้าสร้างแล้ว — รายการบนร้านจะมาตอนดึงสินค้าจาก Lazada รอบถัดไป */ }

  await writeAudit(admin, {
    action: "create", entityType: "platform_catalog", entityId: null, actorId, actorName,
    metadata: { source: "lazada_create", ok: true, item_id: itemId, parent_sku_id: parentId, brand_id: brandId, skus: created.skus.length, migrated: migrated.size, display: displayRes },
  });
  return NextResponse.json({ ok: true, product_id: itemId, skus: created.skus, display: displayRes, migrated: migrated.size, error: null });
}
