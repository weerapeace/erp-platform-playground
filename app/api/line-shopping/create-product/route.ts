/**
 * สร้างสินค้าใหม่บน LINE SHOPPING — /api/line-shopping/create-product
 *  GET  ?parent_sku_id=  (products.platforms.view) → ดูก่อนส่ง: ทุกช่องที่จะส่ง + มาจากไหน + ช่องที่ขาด (ตัวช่วยลงสินค้า ขั้น "ดูและแก้")
 *  POST { parent_sku_id }  (products.platforms.edit) → สร้างจริงบน LINE (POST /products)
 *   → เก็บ platform_product_id ในร่าง + สร้าง catalog listing (จับคู่ parent)
 * ประกอบข้อมูลด้วยของกลางตัวเดียว lib/line-create-payload (ดูก่อนส่ง = ส่งจริง ตรงกันเสมอ)
 * หมายเหตุ: เขียนสร้างสินค้าจริงบนร้าน LINE — payload อาจต้องปรับตาม error จาก API (ทดสอบทีละตัว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineCreateProduct } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";
import { buildLineCreate } from "@/lib/line-create-payload";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  let body: { parent_sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parent_sku_id = (body.parent_sku_id ?? "").trim();
  if (!parent_sku_id) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const b = await buildLineCreate(admin, parent_sku_id);
  if (!b.ok) return NextResponse.json({ error: b.error }, { status: b.status });
  const { preview: pv, payload, credential, draftProductId } = b;
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
  if (productId) {
    const priceMin = Math.min(...variants.map((v) => Number(v.price) || 0).filter((n) => n > 0), Infinity);
    await admin.from("platform_catalog_listings").upsert({
      platform_id, brand_id, source: "api", external_product_id: productId, title: String(payload.name ?? ""), sku_code: pv.parent_code,
      matched_parent_sku_id: parent_sku_id, price: Number.isFinite(priceMin) ? priceMin : null, last_imported_at: now, raw: { created_by_erp: true },
    }, { onConflict: "id", ignoreDuplicates: false });
  }
  await writeAudit(admin, { action: "create", entityType: "platform_catalog", entityId: productId || null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_create", parent_sku_id, brand_id, product_id: productId } });
  return NextResponse.json({ ok: true, product_id: productId, error: null });
}
