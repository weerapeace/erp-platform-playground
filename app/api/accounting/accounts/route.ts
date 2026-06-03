import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type Account = {
  id:           string;
  code:         string;
  name:         string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
  parent_code:  string | null;
  is_active:    boolean;
  note:         string | null;
};
export type AccountsResponse = { data: Account[]; error: string | null };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_accounts_list", {
    p_search: searchParams.get("search") || null,
    p_type:   searchParams.get("type") || null,
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies AccountsResponse, { status: 500 });
  return NextResponse.json({ data: (data as Account[]) ?? [], error: null } satisfies AccountsResponse);
}

export async function POST(request: NextRequest) {
  return upsert(request);
}
export async function PATCH(request: NextRequest) {
  return upsert(request);
}

async function upsert(request: NextRequest) {
  let b: Partial<Account> & { actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_account_upsert", {
    p_id:           b.id ?? null,
    p_code:         b.code,
    p_name:         b.name,
    p_account_type: b.account_type,
    p_parent_code:  b.parent_code ?? null,
    p_is_active:    b.is_active ?? true,
    p_note:         b.note ?? null,
    p_actor:        b.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
