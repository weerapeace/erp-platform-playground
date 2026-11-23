/**
 * ดูหน้า "สถานะงานของร้าน" แบบที่ลูกค้าเห็นในไลน์ — บน PC จากหน้าจัดการ LINE (แท็บร้านค้าในไลน์ · ข้อ 2.3 เจ้าของเลือก 2026-11-23)
 * GET ?partner=<id>&page=orders|schedule → ข้อมูลชุดเดียวกับหน้าเล็กในไลน์ (ไม่มีราคา) · lib/line-customer-view-server customerPreview
 * สิทธิ์ admin.users · ลงประวัติการเปิดดู (line_customer_view · admin_preview=pc)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { customerPreview } from "@/lib/line-customer-view-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const sp = request.nextUrl.searchParams;
  try {
    const data = await customerPreview({ partner_id: String(sp.get("partner") ?? ""), page: sp.get("page") ?? "orders", actorId: user?.id ?? null, actorName: user?.email ?? null });
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });
  }
}
