/**
 * GET /api/flow-map/health — ตัวเลขสดของแผนผังการทำงาน (/master/flow-map)
 * นิยาม/เงื่อนไขกรองอยู่ที่ ../metrics.ts (ชุดเดียวกับป๊อปดูรายการ /api/flow-map/list) · ชื่อ/ความหมายอยู่ที่ lib/flow-map.ts
 * ตัวเลขการเงิน (FLOW_METRICS[k].finance) ส่งให้เฉพาะผู้มีสิทธิ์ FLOW_FINANCE_PERM — คนอื่นไม่ได้แม้แต่ key
 * ตัวไหนอ่านไม่สำเร็จ = null (ไม่ล้มทั้งหน้า)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { FLOW_FINANCE_PERM, FLOW_METRICS, type FlowMetricKey } from "@/lib/flow-map";
import { countFlowMetric } from "../metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const finance = await apiCan(request, FLOW_FINANCE_PERM);
  const admin = supabaseAdmin();
  const keys = (Object.keys(FLOW_METRICS) as FlowMetricKey[]).filter((k) => finance || !FLOW_METRICS[k].finance);
  const results = await Promise.allSettled(keys.map((k) => countFlowMetric(admin, k)));
  const data: Partial<Record<FlowMetricKey, number | null>> = {};
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") data[keys[i]] = Math.round(r.value * 100) / 100;
    else { data[keys[i]] = null; failed.push(keys[i]); console.error(`[flow-map/health] ${keys[i]}:`, r.reason instanceof Error ? r.reason.message : r.reason); }
  });
  return NextResponse.json({ data, failed, finance, at: new Date().toISOString(), error: null });
}
