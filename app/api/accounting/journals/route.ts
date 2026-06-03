import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type Journal = {
  id:           string;
  entry_number: string | null;
  entry_date:   string;
  description:  string | null;
  reference:    string | null;
  status:       "draft" | "posted" | "void";
  total_debit:  number;
  total_credit: number;
  posted_at:    string | null;
  created_by:   string | null;
  created_at:   string;
};
export type JournalLineInput = {
  account_code: string;
  description?: string;
  debit?:  number;
  credit?: number;
};
export type JournalsResponse = { data: Journal[]; error: string | null };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_journals_list", {
    p_search: searchParams.get("search") || null,
    p_status: searchParams.get("status") || null,
    p_limit:  Math.min(500, parseInt(searchParams.get("limit") ?? "200")),
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies JournalsResponse, { status: 500 });
  return NextResponse.json({ data: (data as Journal[]) ?? [], error: null } satisfies JournalsResponse);
}

export async function POST(request: NextRequest) {
  let b: { entry_date?: string; description?: string; reference?: string; lines?: JournalLineInput[]; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_journal_create", {
    p_entry_date:  b.entry_date ?? null,
    p_description: b.description ?? null,
    p_reference:   b.reference ?? null,
    p_lines:       b.lines ?? [],
    p_actor:       b.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data, error: null });
}
