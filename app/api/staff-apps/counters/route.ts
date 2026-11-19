/**
 * GET /api/staff-apps/counters?app=<key> — ตัวเลขงานค้างบนปุ่มเมนูของแอป → { counts: { <menu_id>: number } }
 * ตัวนับ = ทะเบียนตัวเลขสดของแผนผังการทำงาน (countFlowMetric · lib/flow-map FLOW_METRICS) — ไม่มีระบบนับตัวที่ 2
 * ส่งเฉพาะเมนูที่คนนี้มีสิทธิ์เปิด (permission_key ของเมนู) · ตัวเลขการเงินต้องมีสิทธิ์ดูผังการเงินด้วย
 * แคชผลนับต่อ isolate ~60 วิ (หลายคนเปิดพร้อมกันไม่ยิงนับซ้ำ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { appOverride } from "@/lib/app-menu-layout";
import { FLOW_FINANCE_PERM, FLOW_METRICS, type FlowMetricKey } from "@/lib/flow-map";
import { isBadgeCounter } from "@/lib/staff-app-counters";
import { countFlowMetric } from "@/app/api/flow-map/metrics";
import { viewerOf, visibleApp } from "../_viewer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TTL = 60_000;
const cache = new Map<FlowMetricKey, { n: number; at: number }>();

async function countCached(key: FlowMetricKey): Promise<number> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return c.n;
  const n = await countFlowMetric(supabaseAdmin(), key);
  cache.set(key, { n, at: Date.now() });
  return n;
}

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const viewer = await viewerOf(request);
  if (!viewer) return NextResponse.json({ counts: {}, error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401, headers });
  const app = await visibleApp(request.nextUrl.searchParams.get("app") ?? "", viewer);
  if (!app) return NextResponse.json({ counts: {}, error: null }, { headers });
  const { data, error } = await supabaseAdmin().from("erp_menu_items")
    .select("id, permission_key, app_overrides").contains("app_keys", [app.key]).eq("is_active", true);
  if (error) return NextResponse.json({ counts: {}, error: error.message }, { status: 500, headers });
  const want = ((data ?? []) as { id: string; permission_key: string | null; app_overrides: unknown }[])
    .map((m) => ({ m, key: appOverride(m, app.key)?.counter }))
    .filter((x): x is { m: typeof x.m; key: FlowMetricKey } => isBadgeCounter(x.key));
  const permOk = new Map<string, boolean>();
  const can = async (p: string) => { if (!permOk.has(p)) permOk.set(p, await apiCan(request, p)); return permOk.get(p)!; };
  const counts: Record<string, number> = {};
  await Promise.all(want.map(async ({ m, key }) => {
    if (m.permission_key && !(await can(m.permission_key))) return;
    if (FLOW_METRICS[key].finance && !(await can(FLOW_FINANCE_PERM))) return;
    try { counts[m.id] = Math.round(await countCached(key)); } catch (e) { console.warn(`[staff-apps/counters] ${key}:`, e instanceof Error ? e.message : e); }
  }));
  return NextResponse.json({ counts, error: null }, { headers });
}
