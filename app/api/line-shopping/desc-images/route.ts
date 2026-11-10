/**
 * ทดสอบ: ใส่รูปจากระบบลงในรายละเอียดสินค้าบน LINE — /api/line-shopping/desc-images
 *  POST { listing_id, image_keys: string[] (คีย์รูปในคลัง ≤ 15) }  (products.platforms.publish — แตะร้านจริง)
 *   ช่วงทดสอบ: เฉพาะสินค้าที่ "ปิดขาย" (ลูกค้าไม่เห็นแกลเลอรีที่สลับชั่วคราว)
 *   1) ฝากรูปผ่านแกลเลอรีชั่วคราว → ได้ลิงก์ LINE → คืนแกลเลอรีเดิม (lib/line-desc-images)
 *   2) ต่อรูปท้ายรายละเอียด → PATCH /products/{id}
 *   3) ดึงสินค้ากลับ → สำเนาในระบบตรงร้าน + นับว่ารูปอยู่ในรายละเอียดจริงกี่รูป
 *   4) ประวัติ (audit) source line_desc_images — เก็บลิงก์ที่ได้ ไว้ตรวจว่ารูปยังอยู่ไหมภายหลัง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineGetProduct, lineUpdateProduct } from "@/lib/line-shopping";
import { lineApiKey, publicImageUrl } from "@/lib/line-shopping-server";
import { appendDescImages, countPresent, lineHostImagesViaGallery, LINE_DESC_IMAGES_MAX } from "@/lib/line-desc-images";
import { isGoneStatus } from "@/lib/platform-listing-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // ฝากรูป 2 ชุด + รอ LINE ก๊อปรูป อาจเกิน 10 วิ

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; image_keys?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const listingId = String(body.listing_id ?? "").trim();
  const keys = Array.isArray(body.image_keys) ? [...new Set((body.image_keys as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean))] : [];
  if (!listingId || !keys.length) return NextResponse.json({ error: "เลือกรูปอย่างน้อย 1 รูป" }, { status: 400 });
  if (keys.length > LINE_DESC_IMAGES_MAX) return NextResponse.json({ error: `ใส่ได้ครั้งละไม่เกิน ${LINE_DESC_IMAGES_MAX} รูป` }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id, external_product_id, title, status, raw").eq("id", listingId).maybeSingle();
  const row = l as { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; status: string | null; raw: Record<string, unknown> | null } | null;
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  if (isGoneStatus(row.status)) return NextResponse.json({ error: "สินค้านี้ไม่อยู่บนร้าน LINE แล้ว" }, { status: 400 });
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "line_shopping") return NextResponse.json({ error: "ใช้ได้เฉพาะสินค้าบน LINE" }, { status: 400 });
  const productId = String(row.external_product_id ?? "").trim();
  const line = (row.raw?.line && typeof row.raw.line === "object" ? row.raw.line : null) as Record<string, unknown> | null;
  if (!productId || !line) return NextResponse.json({ error: "ยังไม่มีข้อมูลสินค้านี้จาก LINE — กด “ดึงสินค้าจาก LINE” ก่อน" }, { status: 400 });
  if (line.isDisplay !== false) return NextResponse.json({ error: "ช่วงทดสอบ: ใส่รูปในรายละเอียดได้เฉพาะสินค้าที่ปิดขาย — ปิดขายก่อน" }, { status: 400 });

  const key = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!key.apiKey) return NextResponse.json({ error: key.error }, { status: 400 });

  // 1) ฝากรูปผ่านแกลเลอรี (คืนแกลเลอรีเดิมเสมอ)
  const host = await lineHostImagesViaGallery(key.apiKey, productId, keys.map(publicImageUrl));

  // 2) ต่อรูปท้ายรายละเอียด (อ่านรายละเอียดล่าสุดจาก LINE ไม่ใช้สำเนาเก่า)
  let description = "skip"; let present = 0;
  let nextLine: Record<string, unknown> | null = null;
  if (host.hosted.length) {
    const cur = await lineGetProduct(key.apiKey, productId);
    const curDesc = String((cur.row?.description as string | undefined) ?? (line.description as string | undefined) ?? "");
    const r = await lineUpdateProduct(key.apiKey, productId, { description: appendDescImages(curDesc, host.hosted) });
    description = r.ok ? "ok" : (r.error || `HTTP ${r.status}`);
  }
  // 3) ดึงกลับ → สำเนาในระบบ + นับรูปที่อยู่จริง
  const fresh = await lineGetProduct(key.apiKey, productId);
  if (fresh.ok && fresh.row) {
    nextLine = fresh.row;
    present = countPresent(String(fresh.row.description ?? ""), host.hosted);
    await admin.from("platform_catalog_listings").update({ raw: { ...(row.raw ?? {}), line: nextLine }, updated_at: new Date().toISOString() }).eq("id", row.id);
  }

  const ok = host.ok && host.restored && description === "ok" && present === host.hosted.length && present === keys.length;
  const error = ok ? null : [host.error, description !== "ok" && description !== "skip" ? `ใส่รายละเอียดไม่สำเร็จ: ${description}` : null,
    description === "ok" && present < host.hosted.length ? `LINE รับรายละเอียดแต่รูปหาย (อยู่จริง ${present}/${host.hosted.length})` : null].filter(Boolean).join(" · ") || "ไม่สำเร็จ";
  await writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "line_desc_images", external_product_id: productId, title: row.title, image_keys: keys, hosted: host.hosted, restored: host.restored, description, present, ...(ok ? {} : { error }) },
  });
  return NextResponse.json({ ok, hosted: host.hosted, restored: host.restored, description, present, error }, { status: ok ? 200 : 502 });
}
