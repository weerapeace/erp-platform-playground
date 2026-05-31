import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- PATCH /api/playground-suppliers/[id] ----

type UpdateBody = {
  name?: string; code?: string; contact_name?: string; contact_phone?: string;
  contact_email?: string; category?: string; address?: string;
  tax_id?: string; note?: string; active?: boolean; actor?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: UpdateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const client = supabaseFromRequest(request);
  let result;

  // ถ้ามี active → call set_active (separate audit action)
  if (body.active !== undefined) {
    const { data, error } = await client.rpc("erp_playground_suppliers_set_active", {
      p_id: id, p_active: body.active, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  // ถ้ามี field อื่น → call update
  const hasFieldUpdate = ["name","code","contact_name","contact_phone","contact_email","category","address","tax_id","note"]
    .some(k => (body as Record<string, unknown>)[k] !== undefined);
  if (hasFieldUpdate) {
    const { data, error } = await client.rpc("erp_playground_suppliers_update", {
      p_id:            id,
      p_name:          body.name          ?? null,
      p_code:          body.code          ?? null,
      p_contact_name:  body.contact_name  ?? null,
      p_contact_phone: body.contact_phone ?? null,
      p_contact_email: body.contact_email ?? null,
      p_category:      body.category      ?? null,
      p_address:       body.address       ?? null,
      p_tax_id:        body.tax_id        ?? null,
      p_note:          body.note          ?? null,
      p_actor:         body.actor         ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  return NextResponse.json({ data: result, error: null });
}

// ---- DELETE /api/playground-suppliers/[id] = soft delete (active=false) ----

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_suppliers_set_active", {
    p_id: id, p_active: false, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
