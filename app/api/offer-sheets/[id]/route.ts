/**
 * /api/offer-sheets/[id] — รายตัว
 *
 * GET    → หัวเอกสาร + รายการสินค้า
 * PUT    → แก้หัว + แทนรายการทั้งชุด (ลบเก่า → ใส่ใหม่)
 * DELETE → ลบใบเสนอ (รายการ cascade)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { itemsToRows, type OfferSaveBody } from "../route";
import { normalizeOfferLayoutConfig } from "@/lib/offer-layout";
import { normalizeOfferTemplateKey } from "@/lib/offer-templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "offers.view");
  if (guard) return guard;
  const { id } = await params;

  const db = supabaseAdmin();
  const { data: sheet, error } = await db.from("offer_sheets").select("*").eq("id", id).single();
  if (error || !sheet) return NextResponse.json({ data: null, error: error?.message ?? "not found" }, { status: 404 });
  const { data: items } = await db.from("offer_sheet_items").select("*").eq("offer_id", id).order("sort_order", { ascending: true });

  return NextResponse.json({ data: { ...sheet, items: items ?? [] }, error: null });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "offers.edit");
  if (guard) return guard;
  const { id } = await params;

  let body: OfferSaveBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const db = supabaseAdmin();
  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const actorId = auth?.user?.id ?? null;

  const { error: ue } = await db.from("offer_sheets").update({
    title:         body.title ?? "",
    customer_id:   body.customer_id ?? null,
    customer_name: body.customer_name ?? null,
    offer_date:    body.offer_date || null,
    note:          body.note ?? null,
    status:        body.status ?? "draft",
    column_config: normalizeOfferLayoutConfig(body.column_config),
    template_key:  normalizeOfferTemplateKey(body.template_key),
    updated_at:    new Date().toISOString(),
  }).eq("id", id);
  if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

  // แทนรายการทั้งชุด
  await db.from("offer_sheet_items").delete().eq("offer_id", id);
  const items = body.items ?? [];
  if (items.length) {
    const { error: ie } = await db.from("offer_sheet_items").insert(itemsToRows(id, items));
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });
  }

  await writeAudit(db, {
    action: "update", entityType: "offer_sheets", entityId: id,
    actorId, actorName: body.actorName ?? null, metadata: { items: items.length },
  });
  return NextResponse.json({ id, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "offers.edit");
  if (guard) return guard;
  const { id } = await params;

  const db = supabaseAdmin();
  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const actorId = auth?.user?.id ?? null;

  const { error } = await db.from("offer_sheets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(db, { action: "delete", entityType: "offer_sheets", entityId: id, actorId, actorName: null });
  return NextResponse.json({ ok: true, error: null });
}
