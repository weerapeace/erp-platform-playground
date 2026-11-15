/**
 * ลงสินค้าใหม่บน Shopee (เฟส 5) — /api/shopee/create-product
 *
 *  GET  ?parent_sku_id=   (products.platforms.view) → { preview, blockers, live } ตัวช่วยลงสินค้า ขั้น "ดูก่อนส่ง" (ไม่ส่งอะไรขึ้นร้าน)
 *  POST { parent_sku_id }  (products.platforms.publish) → 5B (เจ้าของ "เริ่ม 5B" 2026-11-15) สร้างจริงแบบ **ปิดขาย (UNLIST) + สต๊อก 0**
 *        ลำดับ: ตรวจ (ข้อมูลครบ · กันซ้ำ) → ล็อก 3 นาที → ฝากรูป (media_space · รูปสินค้าไม่ผ่าน = หยุด) → add_item (ไม่ลองซ้ำ — กันสร้างซ้ำ)
 *               → มีตัวเลือก: รอ ≥5 วิ (Shopee กำหนด) → init_tier_variation (ลองได้ 3 ครั้ง ห่าง 5 วิ)
 *               → เก็บรหัสในร่าง + รายการบนร้าน (จับคู่สินค้านี้) → ประวัติ (audit shopee_create)
 *        สร้างสินค้าผ่านแต่ตัวเลือกไม่ผ่าน = สินค้ายังปิดขาย (ไม่มีลูกค้าเห็น) · ร่างติดสถานะ tier_failed + บอกให้แก้ใน Seller Centre
 *
 * ตัวประกอบข้อมูลตัวเดียว = lib/shopee-create-plan (GET กับ POST ใช้ ./load ตัวเดียวกัน — ห้ามประกอบแยก) · คู่มือ docs/shopee-connector.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { shopeeAddItem, shopeeErrorText, shopeeInitTierVariation, shopeeItemToCatalogItem } from "@/lib/shopee";
import { shopeeCreateMainImageRefs, shopeeCreateOptionImageRefs, shopeeCreateResolve, type ShopeeCreatePreview } from "@/lib/shopee-create-plan";
import { upsertCatalogListings, type CatalogSyncItem } from "@/lib/platform-catalog-sync";
import { creatorOf, type CreateStep } from "@/lib/platform-create-registry";
import { loadShopeeCreate, type ShopeeLastAttempt } from "./load";
import { refetchShopeeLive, shopeeUploadRef, shopeeWriteEcho } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
type Resp = { preview: ShopeeCreatePreview | null; blockers?: string[]; live?: boolean; platform_id?: string; brand_id?: string | null; last_attempt?: ShopeeLastAttempt | null; error: string | null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Shopee: รออย่างน้อย 5 วิ หลังสร้างสินค้า ก่อนสร้างตัวเลือก */
const TIER_WAIT_MS = 6000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const parentId = (request.nextUrl.searchParams.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ preview: null, error: "ต้องระบุ parent_sku_id" } satisfies Resp, { status: 400, headers: NO_STORE });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const r = await loadShopeeCreate(supabaseAdmin(), parentId, user?.id ?? null);
  if (!r.ok) return NextResponse.json({ preview: null, error: r.error } satisfies Resp, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ preview: r.preview, blockers: r.blockers, live: !!creatorOf("shopee")?.live, platform_id: r.platformId, brand_id: r.brandId, last_attempt: r.lastAttempt, error: null } satisfies Resp, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  if (!creatorOf("shopee")?.live) return NextResponse.json({ ok: false, error: "ยังไม่เปิดลงสินค้าบน Shopee" }, { status: 403 });
  let body: { parent_sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const parentId = String(body.parent_sku_id ?? "").trim();
  if (!parentId) return NextResponse.json({ ok: false, error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorId = user?.id ?? null; const actorName = user?.email ?? null;
  const admin = supabaseAdmin();

  // สถานะทีละขั้น (ตัวช่วยลงสินค้าโชว์ให้เห็นว่าผ่าน/ไม่ผ่านขั้นไหน)
  const steps: CreateStep[] = [];
  const done = (key: string, label: string, detail?: string) => steps.push({ key, label, state: "ok", ...(detail ? { detail } : {}) });
  const bad = (key: string, label: string, detail: string) => steps.push({ key, label, state: "fail", detail });
  const stop = (error: string, status: number) => NextResponse.json({ ok: false, error, steps }, { status });

  const r = await loadShopeeCreate(admin, parentId, actorId);
  if (!r.ok) { bad("check", "ตรวจข้อมูล", r.error); return stop(r.error, r.status); }
  if (r.preview.on_shop) { const e = `มีบน Shopee แล้ว (#${r.preview.on_shop}) — ไม่สร้างซ้ำ`; bad("check", "ตรวจข้อมูล", e); return stop(e, 409); }
  if (r.blockers.length) { const e = r.blockers.join(" · "); bad("check", "ตรวจข้อมูล", e); return stop(e, 400); }
  if (r.preview.missing.length) { const e = `ข้อมูลยังไม่ครบ: ${r.preview.missing.join(" · ")}`; bad("check", "ตรวจข้อมูล", e); return stop(e, 400); }
  if (!r.token || !r.brandId) { const e = "แบรนด์นี้ยังเชื่อม Shopee ไม่ได้"; bad("check", "ตรวจข้อมูล", e); return stop(e, 400); }
  const { platformId, brandId, token } = r;
  const pv = r.preview;
  done("check", "ตรวจข้อมูล", `${pv.variants.length} ตัวเลือก · หมวด ${pv.category.id} · ปิดขาย + สต๊อก 0`);

  // 🔒 ล็อก (กันกดซ้ำ/ลงพร้อมกัน) — ช่องเดิมของร่าง · ค้างเกิน 3 นาที = หลุด ลองใหม่ได้ (แบบเดียวกับ TikTok/LINE)
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id: parentId, platform_id: platformId }, { onConflict: "parent_sku_id,platform_id", ignoreDuplicates: true });
  const lockAt = new Date();
  const staleIso = new Date(lockAt.getTime() - 3 * 60 * 1000).toISOString();
  const { data: claimed } = await admin.from("platform_listing_drafts")
    .update({ last_sync_status: "creating", last_synced_at: lockAt.toISOString(), last_error: null })
    .eq("parent_sku_id", parentId).eq("platform_id", platformId).is("platform_product_id", null)
    .or(`last_sync_status.is.null,last_sync_status.neq.creating,last_synced_at.lt.${staleIso}`)
    .select("id");
  if (!claimed?.length) { const e = "กำลังสร้างสินค้านี้บน Shopee อยู่ (มีการกดไปแล้ว) — รอ 1-2 นาที แล้วดูใน Seller Centre ก่อนลองใหม่"; bad("lock", "กันกดซ้ำ", e); return stop(e, 409); }
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, {
    action: "create", entityType: "platform_catalog", entityId: null, actorId, actorName,
    metadata: { source: "shopee_create", parent_sku_id: parentId, brand_id: brandId, shop_id: token.shopId, steps, ...meta },
  });
  const fail = async (msg: string, status = 400, meta: Record<string, unknown> = {}) => {
    await admin.from("platform_listing_drafts").update({ last_sync_status: "failed", last_error: msg.slice(0, 500), last_synced_at: new Date().toISOString() }).eq("parent_sku_id", parentId).eq("platform_id", platformId);
    await audit({ ok: false, error: msg, ...meta });
    return stop(msg, status);
  };

  // 1) ฝากรูปสินค้า (บังคับ) → รูปตัวเลือก (ไม่บังคับ — ไม่ครบ = ไม่ใส่รูปตัวเลือก)
  const idOf = new Map<string, string>();
  const mainRefs = shopeeCreateMainImageRefs(r.payload);
  for (const ref of mainRefs) {
    try { idOf.set(ref, (await shopeeUploadRef(ref)).imageId); }
    catch (e) {
      bad("images", `ฝากรูป ${idOf.size}/${mainRefs.length}`, (e as Error).message);
      return fail(`ฝากรูปกับ Shopee ไม่สำเร็จ (${idOf.size + 1}/${mainRefs.length}): ${(e as Error).message} — ยังไม่ได้สร้างสินค้า`, 502);
    }
  }
  done("images", `ฝากรูป ${idOf.size}/${mainRefs.length}`);
  const optRefs = shopeeCreateOptionImageRefs(r.payload).filter((ref) => !idOf.has(ref));
  let optErr: string | null = null;
  for (const ref of optRefs) {
    try { idOf.set(ref, (await shopeeUploadRef(ref)).imageId); }
    catch (e) { optErr = (e as Error).message; break; }
  }
  const resolved = shopeeCreateResolve(r.payload, idOf);
  if (r.payload.tier && shopeeCreateOptionImageRefs(r.payload).length) {
    if (resolved.optionImages) done("option_images", "รูปตัวเลือก (สี)");
    else steps.push({ key: "option_images", label: "รูปตัวเลือก (สี)", state: "skip", detail: `ไม่ใส่รูปตัวเลือก${optErr ? ` (${optErr})` : ""} — เติมทีหลังใน Seller Centre ได้` });
  }

  // 2) สร้างสินค้า (ปิดขาย · สต๊อก 0) — ไม่ลองซ้ำอัตโนมัติ (กันสร้างซ้ำ)
  let itemId: string;
  let addEcho: ReturnType<typeof shopeeWriteEcho>;
  try {
    const created = await shopeeAddItem(token.accessToken, token.shopId, resolved.add_item);
    itemId = created.itemId; addEcho = shopeeWriteEcho(created.raw);
  } catch (e) {
    bad("create", "สร้างสินค้าบน Shopee", shopeeErrorText(e));
    return fail(`Shopee ไม่รับ: ${shopeeErrorText(e)} — ถ้าไม่แน่ใจว่าสร้างไปแล้วหรือยัง ให้ดูใน Seller Centre (สินค้าที่ปิดขาย) ก่อนลองใหม่`, 502, { raw_error: (e as Error).message, uploaded: idOf.size });
  }
  done("create", "สร้างสินค้าบน Shopee (ปิดขาย)", `#${itemId}${addEcho.show ? ` · Shopee แจ้ง: ${addEcho.show}` : ""}`);
  // เก็บรหัสทันที (กันกดซ้ำแล้วสร้างซ้ำ แม้ขั้นถัดไปพัง)
  await admin.from("platform_listing_drafts").update({ platform_product_id: itemId, status: "published", last_sync_status: resolved.tier ? "creating" : "created_unlisted", last_synced_at: new Date().toISOString(), last_error: null })
    .eq("parent_sku_id", parentId).eq("platform_id", platformId);

  // 3) ตัวเลือก (สี/แบบ) — รอตามที่ Shopee กำหนด แล้วลองได้ 3 ครั้ง
  let tierError: string | null = null;
  let tierResp: unknown = null;
  if (resolved.tier) {
    await sleep(TIER_WAIT_MS);
    for (let i = 0; i < 3; i++) {
      try { tierResp = shopeeWriteEcho(await shopeeInitTierVariation(token.accessToken, token.shopId, { item_id: Number(itemId), ...resolved.tier })).response; tierError = null; break; }
      catch (e) { tierError = shopeeErrorText(e); if (i < 2) await sleep(5000); }
    }
    if (tierError) bad("variants", `สร้างตัวเลือก ${pv.variants.length} ตัว`, tierError);
    else done("variants", `สร้างตัวเลือก ${pv.variants.length} ตัว`, pv.dims.map((d) => `${d.name} ${d.values.length}`).join(" · "));
  }
  const now = new Date().toISOString();
  await admin.from("platform_listing_drafts").update({
    last_sync_status: tierError ? "tier_failed" : "created_unlisted", last_synced_at: now,
    last_error: tierError ? `สร้างสินค้า #${itemId} แล้ว แต่สร้างตัวเลือกไม่สำเร็จ: ${tierError}`.slice(0, 500) : null,
  }).eq("parent_sku_id", parentId).eq("platform_id", platformId);

  // 4) เก็บรายการบนร้าน (ปิดขาย) + จับคู่สินค้านี้ — ดึงกลับจาก Shopee (รอจนเห็นตัวเลือกครบ ~9 วิ) · ไม่ได้ = เก็บเท่าที่รู้
  try {
    const want = resolved.tier && !tierError ? pv.variants.length : 0;
    const live = await refetchShopeeLive(token.accessToken, token.shopId, itemId, (l) => !want || (l.models?.models.length ?? 0) >= want);
    const slim: CatalogSyncItem | null = live ? shopeeItemToCatalogItem(live.base, live.models) : null;
    await upsertCatalogListings(admin, {
      platformId, brandId, source: "api",
      items: [slim ?? { external_product_id: itemId, title: pv.name.value, skus: pv.variants.map((v) => v.code), price: pv.variants[0]?.price ?? null, status: "unlist", raw: { shopee: { item_id: itemId, status: "UNLIST", created_by_erp: true } } }],
    });
    await admin.from("platform_catalog_listings").update({ matched_parent_sku_id: parentId }).eq("platform_id", platformId).eq("external_product_id", itemId);
    done("save", "บันทึกในระบบ + จับคู่สินค้า", live ? undefined : "ดึงกลับจาก Shopee ไม่ได้ — เก็บเท่าที่รู้");
  } catch (e) {
    steps.push({ key: "save", label: "บันทึกในระบบ + จับคู่สินค้า", state: "skip", detail: `ยังไม่ได้ (${(e as Error).message}) — จะมาตอนดึงสินค้าจาก Shopee รอบถัดไป` });
  }

  const warnings = [addEcho.show].filter((x): x is string => !!x);
  await audit({
    ok: !tierError, item_id: itemId, variants: pv.variants.length, option_images: resolved.optionImages, uploaded: idOf.size,
    category_id: pv.category.id, error: tierError, shopee_warning: addEcho.warning, shopee_response: addEcho.response, tier_response: tierResp,
  });
  if (tierError) {
    return NextResponse.json({
      ok: false, product_id: itemId, steps,
      error: `สร้างสินค้า #${itemId} บน Shopee แล้ว (ปิดขาย · ลูกค้ายังไม่เห็น) แต่สร้างตัวเลือกไม่สำเร็จ: ${tierError} — เพิ่มตัวเลือกใน Seller Centre หรือลบสินค้านี้แล้วลงใหม่ (ระบบไม่สร้างซ้ำให้อัตโนมัติ)`,
    }, { status: 502 });
  }
  return NextResponse.json({ ok: true, product_id: itemId, display: { ok: true, status: "hide" }, warnings, uploaded: idOf.size, steps, error: null });
}
