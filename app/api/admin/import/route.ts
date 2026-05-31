import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Map entity → RPC ----

const RPC_MAP: Record<string, string> = {
  products:  "erp_playground_products_import_batch",
  suppliers: "erp_playground_suppliers_import_batch",
};

type Body = {
  entity: string;
  rows:   Record<string, unknown>[];
  mode:   "create" | "upsert";
  actor?: string;
};

export async function POST(request: NextRequest) {
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const rpc = RPC_MAP[body.entity];
  if (!rpc) return NextResponse.json({ error: `entity "${body.entity}" ไม่รองรับ` }, { status: 400 });
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows ว่าง" }, { status: 400 });
  }
  if (body.rows.length > 5000) {
    return NextResponse.json({ error: "import ครั้งละไม่เกิน 5000 แถว — แบ่งไฟล์" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc(rpc, {
    p_rows:  body.rows,
    p_mode:  body.mode ?? "create",
    p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
