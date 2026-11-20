/**
 * 📡 สถานะการดึงออเดอร์ทุกร้าน — GET /api/platform-orders/pull-status (สิทธิ์ platform_orders.view)
 * ข้อมูลหน้า /master/platform-orders/pull-status · ตัดสินสถานะด้วย lib/order-pull-health · รวมข้อมูลที่ lib/order-pull-server
 * ไม่ส่งกุญแจ/โทเคนออกไป (มีแค่วันหมดอายุ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadPullBoard } from "@/lib/order-pull-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  try {
    const board = await loadPullBoard(supabaseAdmin());
    return NextResponse.json({ ok: true, ...board }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[pull-status]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "โหลดสถานะการดึงออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
