import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type TrialBalanceRow = {
  account_code: string;
  account_name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
  debit:   number;
  credit:  number;
  balance: number;
};
export type TrialBalanceResponse = { data: TrialBalanceRow[]; error: string | null };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_trial_balance", {
    p_as_of: searchParams.get("as_of") || null,
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies TrialBalanceResponse, { status: 500 });
  return NextResponse.json({ data: (data as TrialBalanceRow[]) ?? [], error: null } satisfies TrialBalanceResponse);
}
