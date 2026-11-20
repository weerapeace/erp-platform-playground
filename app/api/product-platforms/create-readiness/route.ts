/**
 * ความพร้อมลงร้าน ทุกร้านของสินค้า 1 ตัว ในคำขอเดียว — /api/product-platforms/create-readiness (แท็บแพลตฟอร์มของ Parent SKU · เช็กข้ามร้าน)
 *
 *  GET ?parent_sku_id=&codes=shopee,lazada,…  (products.platforms.view · อ่านอย่างเดียว ไม่ส่งอะไรขึ้นร้าน)
 *    → { data: { [code]: CreateReadiness }, error }
 *
 * ตัวตรวจอยู่ที่ lib/platform-create-readiness-server (ของกลาง · cron ตรวจทุกคืนใช้ตัวเดียวกัน) — ไม่มีตัวตรวจตัวที่ 2
 * ผลที่ตรวจสดตรงนี้ถูกจดลง platform_create_readiness ด้วย (ป้ายในเช็กข้ามร้านได้ค่าล่าสุดเสมอ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { checkCreateReadiness } from "@/lib/platform-create-readiness-server";
import { saveReadiness } from "@/lib/platform-readiness-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const parentId = (sp.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ data: {}, error: "ต้องระบุ parent_sku_id" }, { status: 400, headers: NO_STORE });
  const asked = (sp.get("codes") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const results = await checkCreateReadiness(admin, parentId, asked, user?.id ?? null);
  await saveReadiness(admin, parentId, results);
  return NextResponse.json({ data: Object.fromEntries(results.map((r) => [r.code, r])), error: null }, { headers: NO_STORE });
}
