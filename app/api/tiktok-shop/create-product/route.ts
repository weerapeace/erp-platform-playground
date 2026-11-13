/**
 * สร้างสินค้าใหม่บน TikTok Shop เป็น "ฉบับร่าง" (เฟส D) — /api/tiktok-shop/create-product
 *
 *  GET  ?parent_sku_id=   (products.platforms.view) → { preview, blockers, live, mode: "draft" } ตัวช่วยลงสินค้า ขั้น "ดูก่อนส่ง" (ไม่ส่งอะไรขึ้นร้าน)
 *  POST { parent_sku_id }  (products.platforms.publish) → สร้างฉบับร่างบน TikTok (save_mode=AS_DRAFT · ไม่ขึ้นขาย · สต๊อกตั้งต้นในร่าง 1 ชิ้น — TikTok บังคับ)
 *        ลำดับ: กันซ้ำ (มีบนร้าน/ร่างมีรหัส) → ล็อก 3 นาที → ฝากรูปกับ TikTok (MAIN_IMAGE) → Create Product
 *               → เก็บรหัสในร่าง + รายการบนร้าน (สถานะร่าง · จับคู่สินค้านี้) → ประวัติ (audit tiktok_create)
 *        เจ้าของตรวจ + กรอกช่องบังคับของหมวด + แก้สต๊อกเป็นจำนวนจริง แล้วกดเผยแพร่เองใน Seller Center
 *
 * ตัวประกอบข้อมูลตัวเดียว = lib/tiktok-create-plan (GET กับ POST ใช้ ./load ตัวเดียวกัน — ห้ามประกอบแยก)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsCreateProduct, ttsDetailExtras, ttsErrorText, ttsProductToCatalogItem } from "@/lib/tiktok-shop";
import { ttsCreateImageRefs, ttsCreateResolveImages, type TtsCreatePreview } from "@/lib/tiktok-create-plan";
import { upsertCatalogListings } from "@/lib/platform-catalog-sync";
import { creatorOf } from "@/lib/platform-create-registry";
import { loadTiktokCreate } from "./load";
import { ttsGetProductRetry, ttsUploadRef } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
type Resp = { preview: TtsCreatePreview | null; blockers?: string[]; live?: boolean; mode?: "draft"; platform_id?: string; brand_id?: string | null; error: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const parentId = (request.nextUrl.searchParams.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ preview: null, error: "ต้องระบุ parent_sku_id" } satisfies Resp, { status: 400, headers: NO_STORE });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const r = await loadTiktokCreate(supabaseAdmin(), parentId, user?.id ?? null);
  if (!r.ok) return NextResponse.json({ preview: null, error: r.error } satisfies Resp, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ preview: r.preview, blockers: r.blockers, live: !!creatorOf("tiktok")?.live, mode: "draft", platform_id: r.platformId, brand_id: r.brandId, error: null } satisfies Resp, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  if (!creatorOf("tiktok")?.live) return NextResponse.json({ ok: false, error: "ยังไม่เปิดลงสินค้าบน TikTok" }, { status: 403 });
  let body: { parent_sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const parentId = String(body.parent_sku_id ?? "").trim();
  if (!parentId) return NextResponse.json({ ok: false, error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorId = user?.id ?? null; const actorName = user?.email ?? null;
  const admin = supabaseAdmin();

  const r = await loadTiktokCreate(admin, parentId, actorId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  if (r.preview.on_shop) return NextResponse.json({ ok: false, error: `มีบน TikTok แล้ว (#${r.preview.on_shop}) — ไม่สร้างซ้ำ` }, { status: 409 });
  if (r.blockers.length) return NextResponse.json({ ok: false, error: r.blockers.join(" · ") }, { status: 400 });
  if (r.preview.missing.length) return NextResponse.json({ ok: false, error: `ข้อมูลยังไม่ครบ: ${r.preview.missing.join(" · ")}` }, { status: 400 });
  if (!r.token || !r.brandId) return NextResponse.json({ ok: false, error: "แบรนด์นี้ยังเชื่อม TikTok ไม่ได้" }, { status: 400 });
  const { platformId, brandId, token } = r;

  // 🔒 ล็อก (กันกดซ้ำ/ลงพร้อมกัน) — ช่องเดิมของร่าง · ค้างเกิน 3 นาที = หลุด ลองใหม่ได้ (แบบเดียวกับ LINE/Lazada)
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id: parentId, platform_id: platformId }, { onConflict: "parent_sku_id,platform_id", ignoreDuplicates: true });
  const lockAt = new Date();
  const staleIso = new Date(lockAt.getTime() - 3 * 60 * 1000).toISOString();
  const { data: claimed } = await admin.from("platform_listing_drafts")
    .update({ last_sync_status: "creating", last_synced_at: lockAt.toISOString(), last_error: null })
    .eq("parent_sku_id", parentId).eq("platform_id", platformId).is("platform_product_id", null)
    .or(`last_sync_status.is.null,last_sync_status.neq.creating,last_synced_at.lt.${staleIso}`)
    .select("id");
  if (!claimed?.length) return NextResponse.json({ ok: false, error: "กำลังสร้างสินค้านี้บน TikTok อยู่ (มีการกดไปแล้ว) — รอ 1-2 นาที แล้วดึงสินค้าจาก TikTok เพื่อตรวจก่อนลองใหม่" }, { status: 409 });
  const fail = async (msg: string, status = 400) => {
    await admin.from("platform_listing_drafts").update({ last_sync_status: "failed", last_error: msg.slice(0, 500), last_synced_at: new Date().toISOString() }).eq("parent_sku_id", parentId).eq("platform_id", platformId);
    await writeAudit(admin, { action: "create", entityType: "platform_catalog", entityId: null, actorId, actorName, metadata: { source: "tiktok_create", ok: false, draft: true, error: msg, parent_sku_id: parentId, brand_id: brandId } });
    return NextResponse.json({ ok: false, error: msg }, { status });
  };

  // 1) ฝากรูปกับ TikTok ทีละรูป · ไม่ผ่าน = หยุด ไม่สร้างสินค้า
  const uriOf = new Map<string, string>();
  const refs = ttsCreateImageRefs(r.payload);
  for (const ref of refs) {
    try { uriOf.set(ref, await ttsUploadRef(token.accessToken, ref)); }
    catch (e) { return fail(`ฝากรูปกับ TikTok ไม่สำเร็จ (${uriOf.size + 1}/${refs.length}): ${(e as Error).message}`); }
  }
  const payload = ttsCreateResolveImages(r.payload, uriOf);

  // 2) สร้างฉบับร่าง — ไม่ลองซ้ำอัตโนมัติ (กันสร้างซ้ำ)
  let created: Awaited<ReturnType<typeof ttsCreateProduct>>;
  try { created = await ttsCreateProduct(token.accessToken, token.cipher, payload); }
  catch (e) { return fail(`TikTok ไม่รับ: ${ttsErrorText(e)} — ถ้าไม่แน่ใจว่าสร้างไปแล้วหรือยัง ให้ดูฉบับร่างใน Seller Center ก่อนลองใหม่`); }
  const productId = created.productId;
  const now = new Date().toISOString();
  await admin.from("platform_listing_drafts").update({ platform_product_id: productId, status: "published", last_sync_status: "created_draft", last_synced_at: now, last_error: null })
    .eq("parent_sku_id", parentId).eq("platform_id", platformId);

  // 3) เก็บรายการบนร้าน (สถานะร่าง) + จับคู่สินค้านี้ — ดึงกลับไม่ได้ = เก็บเท่าที่รู้
  try {
    const detail = await ttsGetProductRetry(token.accessToken, token.cipher, productId).catch(() => null);
    const slim = detail ? ttsProductToCatalogItem(detail, ttsDetailExtras(detail)) : null;
    const prev = r.preview;
    await upsertCatalogListings(admin, {
      platformId, brandId, source: "api",
      items: [slim ?? { external_product_id: productId, title: prev.name.value, skus: prev.variants.map((v) => v.code), price: prev.variants[0]?.price ?? null, status: "draft", raw: { tiktok: { id: productId, title: prev.name.value, status: "DRAFT", created_by_erp: true } } }],
    });
    await admin.from("platform_catalog_listings").update({ matched_parent_sku_id: parentId }).eq("platform_id", platformId).eq("external_product_id", productId);
  } catch { /* สร้างแล้ว — รายการจะมาตอนดึงสินค้าจาก TikTok รอบถัดไป */ }

  await writeAudit(admin, {
    action: "create", entityType: "platform_catalog", entityId: null, actorId, actorName,
    metadata: { source: "tiktok_create", ok: true, draft: true, product_id: productId, parent_sku_id: parentId, brand_id: brandId, skus: created.skus.length, uploaded: uriOf.size, tiktok_warnings: created.warnings },
  });
  return NextResponse.json({ ok: true, product_id: productId, draft: true, skus: created.skus, warnings: created.warnings, uploaded: uriOf.size, error: null });
}
