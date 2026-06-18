/**
 * ใบปะหน้ากล่อง — รายตัว: ดู / แก้ / ลบ
 * GET    /api/carton-labels/[id]   → รายละเอียด (ใช้ในหน้าพิมพ์ + เปิดแก้)
 * PATCH  /api/carton-labels/[id]   → แก้ไข
 * DELETE /api/carton-labels/[id]   → ลบ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanCartons } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v: unknown) => (v == null ? null : String(v).trim() || null);

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin().from("carton_labels").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // อัปเดตเฉพาะคีย์ที่ส่งมา (กันยัดคอลัมน์มั่ว)
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const setStr = (k: string) => { if (k in body) out[k] = s(body[k]); };
  const setNum = (k: string) => { if (k in body) out[k] = n(body[k]); };
  ["from_text", "to_text", "customer_id", "po_no", "sku_id", "style_no", "color", "note"].forEach(setStr);
  ["total_qty", "per_carton"].forEach(setNum);
  if ("cartons" in body) out.cartons = cleanCartons(body.cartons);

  const admin = supabaseAdmin();
  const { error } = await admin.from("carton_labels").update(out).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "update", entityType: "carton_labels", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ id, error: null });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const admin = supabaseAdmin();
  const { error } = await admin.from("carton_labels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "delete", entityType: "carton_labels", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ id, error: null });
}
