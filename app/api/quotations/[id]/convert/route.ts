import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- POST — แปลงใบเสนอราคาเป็นใบสั่งขาย (SO) ----
// เรียก RPC erp_playground_quote_to_so ซึ่งสร้าง SO ผ่านตรรกะกลางเดิม (erp_playground_so_create)
// แล้วโยง converted_so_id กลับมาที่ใบเสนอราคา

type Body = { actor?: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Body = {};
  try { body = await request.json(); } catch { /* body optional */ }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_quote_to_so", {
    p_quote_id: id, p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ so_id: data, error: null });
}
