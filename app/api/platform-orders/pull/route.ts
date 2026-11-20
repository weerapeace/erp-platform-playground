/**
 * 🔄 ดึงออเดอร์ของ 1 ร้านทันที — POST /api/platform-orders/pull { platform, brand_id } (สิทธิ์ platform_orders.manage)
 * ปุ่ม "ดึงตอนนี้" หน้าสถานะดึงออเดอร์ · ดึงออเดอร์ที่เปลี่ยนสถานะใน 3 ชม.ล่าสุด (ตัวกลางเดียวกับตัวดึงอัตโนมัติ ../pull-runner)
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน · จด audit ทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { isPullPlatform } from "@/lib/order-pull-health";
import { pullShop } from "../pull-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const WINDOW_SEC = 3 * 3600;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: { platform?: string; brand_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  if (!isPullPlatform(body.platform)) return NextResponse.json({ ok: false, error: "ไม่รู้จักร้านนี้" }, { status: 400 });
  const brandId = body.platform === "website" ? null : String(body.brand_id ?? "").trim() || null;
  if (body.platform !== "website" && !brandId) return NextResponse.json({ ok: false, error: "ไม่ได้ระบุแบรนด์" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const r = await pullShop(supabaseAdmin(), { platform: body.platform, brandId, windowSec: WINDOW_SEC, budgetMs: 45_000, manual: true, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ ...r });
}
