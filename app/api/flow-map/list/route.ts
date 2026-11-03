/**
 * GET /api/flow-map/list?metric=<key> — รายการเบื้องหลังตัวเลขสดในหน้าแผนผังการทำงาน (กดตัวเลขแล้วเห็นรายการ)
 * เงื่อนไขกรองชุดเดียวกับตัวนับ (../metrics.ts) · สูงสุด 200 แถว + ยอดทั้งหมด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { FLOW_METRICS, type FlowMetricKey } from "@/lib/flow-map";
import { countFlowMetric, listFlowMetric } from "../metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const key = new URL(request.url).searchParams.get("metric") ?? "";
  if (!(key in FLOW_METRICS)) return NextResponse.json({ rows: [], total: 0, error: "ไม่รู้จักตัวเลขนี้" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const [rows, total] = await Promise.all([listFlowMetric(admin, key as FlowMetricKey), countFlowMetric(admin, key as FlowMetricKey)]);
    return NextResponse.json({ rows, total, error: null });
  } catch (e) {
    console.error(`[flow-map/list] ${key}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ rows: [], total: 0, error: "โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
