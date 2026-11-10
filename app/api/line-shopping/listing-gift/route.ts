/**
 * ตั้ง "ส่งเป็นของขวัญ" ของสินค้าบน LINE จากลิ้นชักสินค้าบนร้าน — /api/line-shopping/listing-gift
 *  POST { listing_id, status: on|gift_only|off, categories: string[] (≤3) }  (products.platforms.publish — แตะร้านจริง)
 *  ช่วงทดลอง: คู่มือ API ไม่มีช่องนี้ → lib/line-gift-server ลองรูปแบบที่เป็นไปได้ แล้วดึงกลับตรวจ · จดรูปแบบที่ได้ผลลงประวัติ
 *  → { ok, shape, now, tried, error }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineGetProduct } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";
import { lineSetGift } from "@/lib/line-gift-server";
import { giftFromExtra, giftFromLine } from "@/lib/line-gift";
import { isGoneStatus } from "@/lib/platform-listing-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; status?: unknown; categories?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId) return NextResponse.json({ error: "ต้องระบุสินค้า" }, { status: 400 });
  // ใช้ตัวทำความสะอาดเดียวกับร่าง (สถานะไม่ถูก = ค่าเริ่ม · หมวดไม่รู้จักตัดทิ้ง · ≤3)
  const want = giftFromExtra({ gift_status: body.status, gift_categories: Array.isArray(body.categories) ? body.categories : [] });

  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id, external_product_id, title, status, raw").eq("id", listingId).maybeSingle();
  const row = l as { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; status: string | null; raw: Record<string, unknown> | null } | null;
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  if (isGoneStatus(row.status)) return NextResponse.json({ error: "สินค้านี้ไม่อยู่บนร้าน LINE แล้ว" }, { status: 400 });
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "line_shopping") return NextResponse.json({ error: "ใช้ได้เฉพาะสินค้าบน LINE" }, { status: 400 });
  const productId = String(row.external_product_id ?? "").trim();
  if (!productId) return NextResponse.json({ error: "ไม่มีรหัสสินค้าบน LINE" }, { status: 400 });
  const key = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!key.apiKey) return NextResponse.json({ error: key.error }, { status: 400 });

  const before = giftFromLine((row.raw?.line ?? null) as Record<string, unknown> | null);
  const res = await lineSetGift(key.apiKey, productId, { status: want.status, categories: want.categories });
  // สำเนาในระบบให้ตรงร้าน
  const fresh = await lineGetProduct(key.apiKey, productId);
  if (fresh.ok && fresh.row) await admin.from("platform_catalog_listings").update({ raw: { ...(row.raw ?? {}), line: fresh.row }, updated_at: new Date().toISOString() }).eq("id", row.id);

  await writeAudit(admin, {
    action: "update", entityType: "platform_catalog", entityId: row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "line_listing_gift", external_product_id: productId, title: row.title, before, want: { status: want.status, categories: want.categories }, now: res.now, shape: res.shape, tried: res.tried, ...(res.ok ? {} : { error: res.error }) },
  });
  return NextResponse.json({ ok: res.ok, shape: res.shape, now: res.now, tried: res.tried, error: res.error }, { status: res.ok ? 200 : 502 });
}
