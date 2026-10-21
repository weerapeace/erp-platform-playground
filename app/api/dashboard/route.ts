import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

// ---- Types ----

export type DashboardStats = {
  products_total:      number;
  products_active:     number;
  products_inactive:   number;
  products_low_stock:  number;
  products_value:      number;
  pr_total:            number;
  pr_draft:            number;
  pr_submitted:        number;
  pr_approved:         number;
  pr_rejected:         number;
  pr_cancelled:        number;
  pr_approved_amount:  number;
  pr_pending_amount:   number;
  top_categories:      { name: string; count: number }[];
  activity_today:      number;
};

export type DashboardResponse = {
  data:  DashboardStats | null;
  error: string | null;
};

// ---- GET /api/dashboard ----

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().rpc("erp_playground_dashboard_stats");

  if (error) {
    console.error("[api/dashboard] GET", error);
    return NextResponse.json({ data: null, error: error.message } satisfies DashboardResponse, { status: 500 });
  }
  return NextResponse.json({ data: data as DashboardStats, error: null } satisfies DashboardResponse);
}
