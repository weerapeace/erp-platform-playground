/**
 * /api/dashboard/metrics — "งานค้างจริง" ต่อระบบ (เฟส 4)
 * เรียก RPC erp_dashboard_metrics() (SECURITY DEFINER) → jsonb { app_key: count }
 * ใช้เติมตัวเลขจริงบนการ์ดระบบ (เสริมจากจำนวนแจ้งเตือน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_dashboard_metrics");
  if (error) return NextResponse.json({ data: {}, error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? {}) as Record<string, number>, error: null },
    { headers: { "Cache-Control": "private, max-age=60" } });
}
