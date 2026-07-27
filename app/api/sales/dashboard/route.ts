import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";

// ---- Types (ใช้ร่วมกับหน้า /sales/dashboard) ----
export type Money = { amt: number; n: number };
export type MonthPoint = { ym: string; amt: number; n: number };
export type StatusSlice = { status: string; n: number; amt: number };
export type TopCustomer = { name: string; amt: number; n: number };
export type UnbilledRow = { id: string; so_number: string | null; customer_name: string | null; order_date: string; amt: number; status: string };
export type AwaitingRow = { id: string; bill_number: string | null; customer_name: string | null; bill_date: string; due_date: string | null; amt: number; overdue: boolean };

export type SalesDashboard = {
  this_month: Money; prev_month: Money; draft: Money;
  unbilled: Money; awaiting: Money; overdue: Money; paid_month: Money;
  monthly: MonthPoint[]; status_mix: StatusSlice[]; top_customers: TopCustomer[];
  unbilled_rows: UnbilledRow[]; awaiting_rows: AwaitingRow[];
};

export async function GET(request: NextRequest) {
  const months = Math.min(24, Math.max(1, parseInt(new URL(request.url).searchParams.get("months") ?? "6")));
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_sales_dashboard", { p_months: months });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: data as SalesDashboard, error: null });
}
