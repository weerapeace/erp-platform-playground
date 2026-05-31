import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type MentionUser = {
  id:           string;
  display_name: string | null;
  email:        string;
  role:         string;
};

// GET ?q=...
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const { data, error } = await supabaseFromRequest(request).rpc("erp_users_search_for_mention", {
    p_query: q, p_limit: 8,
  });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data as MentionUser[]) ?? [], error: null });
}
