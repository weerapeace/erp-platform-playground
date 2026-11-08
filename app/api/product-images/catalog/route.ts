/**
 * 📂 จัดรูปหลายโฟลเดอร์ — ข้อมูลสินค้า + รูปเดิม ตามรหัสในชื่อโฟลเดอร์/ไฟล์
 * ใช้ที่ components/product-image-router (ลากหลายโฟลเดอร์ / หลายรุ่นทีเดียว)
 *
 * POST { codes: string[], parentIds?: string[] }
 *   → { parents: RouteParent + รูปเดิม (galleryItems / skus[].items / descItems) , shops, truncated }
 * ตัวจริงอยู่ที่ lib/product-image-catalog-server (ใช้ร่วมกับตัวแยกไฟล์ ERP สูตรงานสินค้า)
 * (ประวัติชุดอัป + "เคยอัปแล้ว" อยู่ที่ /api/product-images/batches)
 * ของกลาง: guardApi(products.view)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cleanCatalogRequest, loadImageCatalog } from "@/lib/product-image-catalog-server";

export type { CatalogItem, CatalogParent, CatalogDescItem } from "@/lib/product-image-catalog-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  let b: { codes?: unknown; parentIds?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  return NextResponse.json(await loadImageCatalog(supabaseAdmin(), cleanCatalogRequest(b)));
}
