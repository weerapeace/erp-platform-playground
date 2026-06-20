/**
 * จัดการแผนก (สำหรับ popup ตั้งค่าแผนกบนบอร์ดจ่ายงาน) — จบในที่เดียว
 * GET    /api/mo/departments            → รายการแผนกทั้งหมด (รวมที่ซ่อน) เรียงตาม display_order
 * POST   /api/mo/departments            → เพิ่มแผนก { name }
 * PATCH  /api/mo/departments            → แก้ไข { id, name?, note?, status?, show_note?, display_order? }
 * DELETE /api/mo/departments?id=        → ลบ (กันลบถ้ามีใบจ่ายงานในแผนก → ให้ซ่อนแทน)
 * ของกลาง: guardApi (products.edit) + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const audit = (admin: ReturnType<typeof supabaseAdmin>, uid: string | null, action: string, id: string | null, meta: Record<string, unknown>) =>
  admin.from("audit_logs").insert({ actor_user_id: uid, action, entity_type: "department", entity_id: id, metadata: meta }).then(() => {}, () => {});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin()
    .from("departments").select("id, name, status, note, show_note, display_order, show_on_board")
    .order("display_order", { ascending: true, nullsFirst: false }).order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { name?: string }; try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่อแผนก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin.from("departments").select("display_order").order("display_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (Number((maxRow as { display_order?: number } | null)?.display_order) || 0) + 1;
  const { data, error } = await admin.from("departments").insert({ name, status: "active", display_order: nextOrder }).select("id").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await audit(admin, user?.id ?? null, "create", (data as { id: string }).id, { name });
  return NextResponse.json({ id: (data as { id: string }).id, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; name?: string; note?: string | null; status?: string; show_note?: boolean; display_order?: number; show_on_board?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") { const n = body.name.trim(); if (!n) return NextResponse.json({ error: "ชื่อแผนกห้ามว่าง" }, { status: 400 }); patch.name = n; }
  if (body.note !== undefined) patch.note = body.note || null;
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.show_note === "boolean") patch.show_note = body.show_note;
  if (typeof body.display_order === "number") patch.display_order = body.display_order;
  if (typeof body.show_on_board === "boolean") patch.show_on_board = body.show_on_board;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("departments").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await audit(admin, user?.id ?? null, "update", body.id, patch);
  return NextResponse.json({ id: body.id, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  // กันลบถ้ามีใบจ่ายงานผูกอยู่ (ยัง active) → แนะนำให้ซ่อนแทน
  const { count } = await admin.from("mo_work_orders").select("id", { count: "exact", head: true }).eq("department_id", id).eq("is_active", true);
  if ((count ?? 0) > 0) return NextResponse.json({ error: `แผนกนี้มีงานอยู่ ${count} ใบ — ปิด “โชว์ในบอร์ด” เพื่อซ่อนแทนการลบ` }, { status: 400 });

  const { error } = await admin.from("departments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await audit(admin, user?.id ?? null, "delete", id, {});
  return NextResponse.json({ data: { deleted: true }, error: null });
}
