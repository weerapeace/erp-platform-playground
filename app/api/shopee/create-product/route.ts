/**
 * ลงสินค้าใหม่บน Shopee (เฟส 5) — /api/shopee/create-product
 *
 *  GET  ?parent_sku_id=   (products.platforms.view) → { preview, blockers, live } ตัวช่วยลงสินค้า ขั้น "ดูก่อนส่ง" (ไม่ส่งอะไรขึ้นร้าน)
 *  POST { parent_sku_id }  (products.platforms.publish) → 5A ยังปิด (ทะเบียน lib/platform-create-registry · live=false)
 *        5B จะทำ: กันซ้ำ → ฝากรูป (media_space) → add_item (ปิดขาย · สต๊อก 0) → รอ ≥5 วิ → init_tier_variation → ผูกกับ Parent SKU → ประวัติ
 *
 * ตัวประกอบข้อมูลตัวเดียว = lib/shopee-create-plan (GET กับ POST ใช้ ./load ตัวเดียวกัน — ห้ามประกอบแยก) · คู่มือ docs/shopee-connector.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import type { ShopeeCreatePreview } from "@/lib/shopee-create-plan";
import { creatorOf } from "@/lib/platform-create-registry";
import { loadShopeeCreate, type ShopeeLastAttempt } from "./load";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
type Resp = { preview: ShopeeCreatePreview | null; blockers?: string[]; live?: boolean; platform_id?: string; brand_id?: string | null; last_attempt?: ShopeeLastAttempt | null; error: string | null };

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
  // 5A: ดูก่อนส่ง + บันทึกร่างเท่านั้น — ลงจริงเปิดในเฟส 5B (เจ้าของอนุมัติก่อน)
  if (!creatorOf("shopee")?.live) return NextResponse.json({ ok: false, error: "ยังไม่เปิดลงสินค้าบน Shopee (ดูก่อนส่ง + บันทึกร่างได้ · ลงจริงเปิดในขั้นถัดไป)" }, { status: 403 });
  return NextResponse.json({ ok: false, error: "ยังไม่เปิดลงสินค้าบน Shopee" }, { status: 403 });
}
