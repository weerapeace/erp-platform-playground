export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Map entity → RPC ----

type EntityRpc = { update: string; setActive: string };
const ENTITY: Record<string, EntityRpc> = {
  customers:   { update: "erp_playground_customers_update",   setActive: "erp_playground_customers_set_active" },
  employees:   { update: "erp_playground_employees_update",   setActive: "erp_playground_employees_set_active" },
  warehouses:  { update: "erp_playground_warehouses_update",  setActive: "erp_playground_warehouses_set_active" },
  departments: { update: "erp_playground_departments_update", setActive: "erp_playground_departments_set_active" },
  units:       { update: "erp_playground_units_update",       setActive: "erp_playground_units_set_active" },
  taxes:       { update: "erp_playground_taxes_update",       setActive: "erp_playground_taxes_set_active" },
};

// ---- PATCH /api/master/[entity]/[id] ----
// Body: { ...fields, active?, actor? }
// ถ้ามี active → call set_active (separate RPC)
// ถ้ามี field อื่น → call update with patch

type PatchBody = Record<string, unknown> & { active?: boolean; actor?: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  const { entity, id } = await params;
  const cfg = ENTITY[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const client = supabaseFromRequest(request);
  let result;

  if (body.active !== undefined) {
    const { data, error } = await client.rpc(cfg.setActive, {
      p_id: id, p_active: body.active, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  // build patch (ลบ active/actor ออก)
  const patch: Record<string, unknown> = { ...body };
  delete patch.active; delete patch.actor;
  const hasFieldUpdate = Object.keys(patch).length > 0;

  if (hasFieldUpdate) {
    // เปลี่ยน rate, included ของ taxes ให้เป็น string ถ้าจำเป็น (jsonb cast)
    const { data, error } = await client.rpc(cfg.update, {
      p_id:    id,
      p_patch: patch,
      p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  return NextResponse.json({ data: result, error: null });
}

// ---- DELETE = soft delete (active=false) ----

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  const { entity, id } = await params;
  const cfg = ENTITY[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  const actor = new URL(request.url).searchParams.get("actor");
  const { data, error } = await supabaseFromRequest(request).rpc(cfg.setActive, {
    p_id: id, p_active: false, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
