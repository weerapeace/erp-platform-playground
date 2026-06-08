/**
 * MO API — single (detail + save + archive) เฟส A
 * GET    /api/mo/[id] → header + materials
 * PATCH  /api/mo/[id] → update header; ถ้าจำนวน/สูตรเปลี่ยน → กางสูตรใหม่
 * DELETE /api/mo/[id] → archive
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { explodeBom } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const supabase = supabaseFromRequest(_request);
  const { data: header, error } = await supabase.from("manufacturing_orders").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 });
  const { data: materials } = await supabase.from("mo_materials").select("*").eq("mo_no", (header as { mo_no: string }).mo_no).eq("is_active", true)
    .order("sequence", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
  return NextResponse.json({ data: { ...header, materials: materials ?? [] }, error: null });
}

type SaveBody = {
  product_sku?: string; product_name?: string; qty?: number; due_date?: string | null;
  bom_code?: string | null; bom_version?: string | null; status?: string; note?: string; reexplode?: boolean;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: SaveBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: existing, error: exErr } = await admin.from("manufacturing_orders").select("mo_no, qty, bom_code").eq("id", id).single();
  if (exErr) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const moNo = (existing as { mo_no: string }).mo_no;
  const newQty = body.qty != null ? Number(body.qty) : (existing as { qty: number }).qty;
  const newBom = body.bom_code !== undefined ? body.bom_code : (existing as { bom_code: string | null }).bom_code;

  const { error } = await admin.from("manufacturing_orders").update({
    product_sku: body.product_sku, product_name: body.product_name ?? null, qty: newQty,
    status: body.status, due_date: body.due_date || null, bom_code: newBom, bom_version: body.bom_version ?? null, note: body.note ?? null,
  }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // กางสูตรใหม่เมื่อจำนวน/สูตรเปลี่ยน หรือสั่ง reexplode
  const qtyChanged = newQty !== (existing as { qty: number }).qty;
  const bomChanged = newBom !== (existing as { bom_code: string | null }).bom_code;
  if (body.reexplode || qtyChanged || bomChanged) await explodeBom(admin, newBom ?? null, moNo, newQty);

  await admin.from("audit_logs").insert({ actor_user_id: user.id, action: "update", entity_type: "mo", entity_id: id, metadata: { mo_no: moNo, qty: newQty } }).then(() => {}, () => {});
  return NextResponse.json({ id, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("manufacturing_orders").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await admin.from("audit_logs").insert({ actor_user_id: user.id, action: "archive", entity_type: "mo", entity_id: id }).then(() => {}, () => {});
  return NextResponse.json({ data: { archived: true }, error: null });
}
