/**
 * ศูนย์ร้านออนไลน์ — GET /api/channel-portal (อ่านอย่างเดียว · ไม่แตะร้าน)
 * ต้องล็อกอิน · ตัวเลขแต่ละกลุ่มโชว์ตามสิทธิ์: รายการบนร้าน = products.platforms.view · ยอดขาย/ออเดอร์ = platform_orders.view
 *   · รอจัดส่ง = platform_orders.view หรือ packing.pack · ไม่มีสิทธิ์ = ได้ null (ไม่ส่งตัวเลขออกไป)
 * ตัวนับ = lib/channel-portal-server · กติกา = lib/channel-portal · ไม่ส่งกุญแจร้านออกไป (มีแค่วันหมดอายุ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan } from "@/lib/api-auth";
import { loadChannelPortal } from "@/lib/channel-portal-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  const [listings, orders, pack] = await Promise.all([
    apiCan(request, "products.platforms.view"),
    apiCan(request, "platform_orders.view"),
    apiCan(request, "packing.pack"),
  ]);
  try {
    const data = await loadChannelPortal(supabaseAdmin(), { listings, orders, pack });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[channel-portal]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "โหลดข้อมูลร้านไม่สำเร็จ ลองกดโหลดใหม่อีกครั้ง" }, { status: 500 });
  }
}
