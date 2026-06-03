import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// GET — header + lines
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_journal_get", { p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// POST — post (draft → posted)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let b: { actor?: string } = {};
  try { b = await request.json(); } catch { /* optional body */ }
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_journal_post", {
    p_id: id, p_actor: b.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data, error: null });
}
