/**
 * ดึงข้อมูลสินค้า "ตัวเดียว" จาก LINE มาเก็บในระบบ — /api/line-shopping/listing-refresh
 *  POST { listing_id }  (products.platforms.edit — อ่านจาก LINE แล้วอัปเดตสำเนาในระบบ ไม่แก้อะไรบนร้าน)
 *  ใช้ที่: ลิ้นชักสินค้าบนร้าน เมื่อยังไม่มีข้อมูลจาก LINE (เช่น ลงจากระบบแล้วแต่ยังไม่ดึง) — ไม่ต้องดึงทั้งร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lineGetProduct } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { listing_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId) return NextResponse.json({ error: "ต้องระบุสินค้า" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id, external_product_id, raw").eq("id", listingId).maybeSingle();
  const row = l as { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; raw: Record<string, unknown> | null } | null;
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "line_shopping") return NextResponse.json({ error: "ใช้ได้เฉพาะสินค้าบน LINE" }, { status: 400 });
  const productId = String(row.external_product_id ?? "").trim();
  if (!productId) return NextResponse.json({ error: "ไม่มีรหัสสินค้าบน LINE" }, { status: 400 });
  const key = await lineApiKey(admin, row.brand_id, row.platform_id);
  if (!key.apiKey) return NextResponse.json({ error: key.error }, { status: 400 });

  const g = await lineGetProduct(key.apiKey, productId);
  if (!g.ok) return NextResponse.json({ error: g.error || "ดึงจาก LINE ไม่ได้" }, { status: 502 });
  if (!g.row) return NextResponse.json({ error: `ไม่พบสินค้า #${productId} บน LINE (อาจถูกลบไปแล้ว)` }, { status: 404 });
  const patch: Record<string, unknown> = { raw: { ...(row.raw ?? {}), line: g.row }, last_imported_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (typeof g.row.name === "string" && g.row.name.trim()) patch.title = g.row.name.trim();
  const { error } = await admin.from("platform_catalog_listings").update(patch).eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
