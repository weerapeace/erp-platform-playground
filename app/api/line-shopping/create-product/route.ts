/**
 * สร้างสินค้าใหม่บน LINE SHOPPING — /api/line-shopping/create-product
 *  GET  ?parent_sku_id=  (products.platforms.view) → ดูก่อนส่ง: ทุกช่องที่จะส่ง + มาจากไหน + ช่องที่ขาด (ตัวช่วยลงสินค้า ขั้น "ดูและแก้")
 *  POST { parent_sku_id, display?: "onsale"|"hide" (ค่าเริ่ม hide) }  (products.platforms.edit) → สร้างจริงบน LINE (POST /products)
 *   → เก็บ platform_product_id ในร่าง + สร้าง catalog listing (จับคู่ parent)
 *   → หลังสร้าง (พลาดไม่ทำให้ลงไม่สำเร็จ): รูปในรายละเอียด (ทดลอง) · เปิด/ปิดขายตามที่เลือก · ของขวัญ = เตือนให้ตั้งเอง (LINE ไม่รับผ่าน API)
 *   → ดึงสินค้าที่เพิ่งลงกลับมาเก็บ raw.line (ลิ้นชักเห็นข้อมูลทันที)
 * ประกอบข้อมูลด้วยของกลางตัวเดียว lib/line-create-payload (ดูก่อนส่ง = ส่งจริง ตรงกันเสมอ)
 * หมายเหตุ: เขียนสร้างสินค้าจริงบนร้าน LINE — payload อาจต้องปรับตาม error จาก API (ทดสอบทีละตัว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineCreateProduct, lineGetProduct, lineSetDisplay, lineUpdateProduct } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";
import { buildLineCreate } from "@/lib/line-create-payload";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { appendDescImages, countPresent, lineHostImagesViaGallery } from "@/lib/line-desc-images";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // + รูปในรายละเอียด (ฝากรูปผ่านแกลเลอรี รอ LINE ก๊อปรูป)

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const parent_sku_id = (new URL(request.url).searchParams.get("parent_sku_id") ?? "").trim();
  if (!parent_sku_id) return NextResponse.json({ preview: null, error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const b = await buildLineCreate(supabaseAdmin(), parent_sku_id);
  if (!b.ok) return NextResponse.json({ preview: null, error: b.error }, { status: b.status });
  return NextResponse.json({ preview: b.preview, error: null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { parent_sku_id?: string; display?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parent_sku_id = (body.parent_sku_id ?? "").trim();
  if (!parent_sku_id) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  // หลังลงเสร็จ: เปิดขายทันที / ปิดไว้ก่อน (ค่าเริ่ม — ตรวจบนร้านก่อนเปิด · เจ้าของขอให้เลือกได้ 2026-11-10)
  const afterDisplay: "onsale" | "hide" = body.display === "onsale" ? "onsale" : "hide";

  const admin = supabaseAdmin();
  const b = await buildLineCreate(admin, parent_sku_id);
  if (!b.ok) return NextResponse.json({ error: b.error }, { status: b.status });
  const { preview: pv, payload, credential, draftProductId, descImageKeys } = b;
  const platform_id = pv.platform_id;
  const brand_id = pv.brand_id;
  if (draftProductId) return NextResponse.json({ error: "สินค้านี้มีบน LINE แล้ว — ใช้ปุ่มส่ง update แทน" }, { status: 400 });
  // 🛡️ กันซ้ำชั้น 2: มีรายการบน LINE ที่จับคู่สินค้านี้อยู่แล้ว (ดึงสินค้าจากร้านแล้วจับคู่ แต่ร่างยังไม่มีรหัส) → ไม่สร้างซ้ำ
  if (pv.on_shop) return NextResponse.json({ error: `สินค้านี้มีบน LINE แล้ว (#${pv.on_shop}) — ไม่สร้างซ้ำ` }, { status: 409 });
  if (!brand_id) return NextResponse.json({ error: "สินค้านี้ยังไม่มีแบรนด์ — ตั้งแบรนด์ก่อน (คีย์ LINE ผูกกับแบรนด์)" }, { status: 400 });
  if (!credential) return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้ใส่ API Key ของ LINE" }, { status: 400 });
  let apiKey: string; try { apiKey = await decryptSecret(credential); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้" }, { status: 400 }); }
  if (pv.missing.length) return NextResponse.json({ error: `ยังกรอกไม่ครบ: ${pv.missing.join(", ")}` }, { status: 400 });

  // 🛡️ กันซ้ำชั้น 3: ล็อกระหว่างกำลังสร้าง (กดซ้ำ / 2 คนกดพร้อมกัน / ตัวช่วยลงสินค้ากับปุ่มในตัวจัดการ)
  //    ใช้ช่องเดิมของร่าง (last_sync_status = creating) ไม่ต้องแก้โครงตาราง · ล็อกค้างเกิน 3 นาที = ถือว่าหลุด ลองใหม่ได้
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id, platform_id }, { onConflict: "parent_sku_id,platform_id", ignoreDuplicates: true });
  const lockAt = new Date();
  const staleIso = new Date(lockAt.getTime() - 3 * 60 * 1000).toISOString();
  const { data: claimed } = await admin.from("platform_listing_drafts")
    .update({ last_sync_status: "creating", last_synced_at: lockAt.toISOString(), last_error: null })
    .eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id).is("platform_product_id", null)
    .or(`last_sync_status.is.null,last_sync_status.neq.creating,last_synced_at.lt.${staleIso}`)
    .select("id");
  if (!claimed?.length) return NextResponse.json({ error: "กำลังสร้างสินค้านี้บน LINE อยู่ (มีการกดไปแล้ว) — รอ 1-2 นาที แล้วกดดึงสินค้าจาก LINE เพื่อตรวจก่อนลองใหม่" }, { status: 409 });

  const variants = (payload.variants ?? []) as Record<string, unknown>[];
  const imageUrls = (payload.imageUrls ?? []) as string[];
  const res = await lineCreateProduct(apiKey, payload);
  if (!res.ok) {
    // ปลดล็อก + จดเหตุผล (ถ้า LINE สร้างไปแล้วแต่ตอบพลาด ให้ดึงสินค้าจาก LINE ก่อนลองใหม่ — ชั้น 2 จะกันซ้ำให้หลังจับคู่)
    await admin.from("platform_listing_drafts").update({ last_sync_status: "failed", last_error: String(res.error ?? "").slice(0, 500), last_synced_at: new Date().toISOString() })
      .eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id);
    return NextResponse.json({ ok: false, error: res.error, sent: { fields: Object.keys(payload), variants: variants.length, images: imageUrls.length } }, { status: 400 });
  }

  const productId = res.productId || "";
  const now = new Date().toISOString();
  // เก็บรหัสสินค้าในร่าง + สร้าง catalog listing (จับคู่ parent)
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id, platform_id, platform_product_id: productId, last_sync_status: "created", last_synced_at: now, updated_by: user?.id ?? null, updated_at: now }, { onConflict: "parent_sku_id,platform_id" });
  let listingRowId: string | null = null;
  if (productId) {
    const priceMin = Math.min(...variants.map((v) => Number(v.price) || 0).filter((n) => n > 0), Infinity);
    const { data: ins } = await admin.from("platform_catalog_listings").insert({
      platform_id, brand_id, source: "api", external_product_id: productId, title: String(payload.name ?? ""), sku_code: pv.parent_code,
      matched_parent_sku_id: parent_sku_id, price: Number.isFinite(priceMin) ? priceMin : null, last_imported_at: now, raw: { created_by_erp: true },
    }).select("id").maybeSingle();
    listingRowId = (ins as { id?: string } | null)?.id ?? null;
  }
  // รูปในรายละเอียดต้องสลับรูปสินค้าชั่วคราว → ปิดขายก่อน (ลูกค้าไม่เห็น) แล้วค่อยเปิดตามที่เลือกตอนท้าย
  if (productId && descImageKeys.length) await lineSetDisplay(apiKey, productId, "hide");
  // รูปในรายละเอียด (ทดลอง — ทดสอบผ่าน 2026-11-10 LMTS05/WL53): ฝากรูปผ่านแกลเลอรี → ต่อท้ายรายละเอียด
  //   พลาด = สินค้าลงแล้ว แค่ไม่มีรูปในรายละเอียด (ไม่ถือว่าลงไม่สำเร็จ)
  let descImages: { ok: boolean; present: number; total: number; hosted: string[]; error: string | null } | null = null;
  if (productId && descImageKeys.length) {
    const host = await lineHostImagesViaGallery(apiKey, productId, descImageKeys.map(publicImageUrl));
    let present = 0;
    const errs: string[] = host.error ? [host.error] : [];
    if (host.hosted.length) {
      const cur = await lineGetProduct(apiKey, productId);
      const curDesc = String((cur.row?.description as string | undefined) ?? payload.description ?? "");
      const r = await lineUpdateProduct(apiKey, productId, { description: appendDescImages(curDesc, host.hosted) });
      if (!r.ok) errs.push(`ใส่รายละเอียดไม่สำเร็จ: ${r.error ?? `HTTP ${r.status}`}`);
      else { const f = await lineGetProduct(apiKey, productId); present = countPresent(String(f.row?.description ?? ""), host.hosted); }
    }
    if (!errs.length && present < descImageKeys.length) errs.push(`รูปอยู่ในรายละเอียดจริง ${present}/${descImageKeys.length}`);
    descImages = { ok: errs.length === 0 && host.restored, present, total: descImageKeys.length, hosted: host.hosted, error: errs.length ? errs.join(" · ") : null };
  }
  // ของขวัญ: ทดสอบแล้ว 2026-11-10 (LMTS05) LINE ไม่รับผ่าน API (ตอบ 200 แต่ค่าไม่เปลี่ยน ทั้ง 3 รูปแบบ) → ไม่ส่ง
  //   แค่ส่งค่าที่ตั้งใจไว้กลับไปเตือนในผลลัพธ์ ให้ไปติ๊กเองใน LINE Seller Center (สินค้าใหม่บน LINE = ปิดของขวัญ)
  const gift = productId && pv.gift.status !== "off" ? { ok: false, manual: true, want: { status: pv.gift.status, categories: pv.gift.categories }, error: null } : null;
  // เปิด/ปิดขายตามที่เลือก
  let display: { ok: boolean; status: "onsale" | "hide"; error: string | null } | null = null;
  if (productId) {
    const d = await lineSetDisplay(apiKey, productId, afterDisplay);
    display = { ok: d.ok, status: afterDisplay, error: d.ok ? null : (d.error ?? `HTTP ${d.status}`) };
  }
  // ดึงสินค้าที่เพิ่งลงกลับมาเก็บ → ลิ้นชักเห็นรูป/ราคา/สวิตช์เปิดปิดขายทันที (เดิมต้องกดดึงทั้งร้าน)
  if (productId && listingRowId) {
    const fresh = await lineGetProduct(apiKey, productId);
    if (fresh.ok && fresh.row) {
      await admin.from("platform_catalog_listings").update({ raw: { created_by_erp: true, line: fresh.row }, ...(typeof fresh.row.name === "string" && fresh.row.name.trim() ? { title: fresh.row.name.trim() } : {}), updated_at: new Date().toISOString() }).eq("id", listingRowId);
    }
  }
  await writeAudit(admin, { action: "create", entityType: "platform_catalog", entityId: productId || null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_create", parent_sku_id, brand_id, product_id: productId, ...(descImages ? { desc_images: descImages } : {}), ...(gift ? { gift } : {}), ...(display ? { display } : {}) } });
  return NextResponse.json({ ok: true, product_id: productId, desc_images: descImages, gift, display, error: null });
}
