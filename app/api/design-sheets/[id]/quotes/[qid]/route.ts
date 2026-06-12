/**
 * Design Sheets — รอบเสนอราคา รายแถว (เฟส 3)
 *
 * PATCH  /api/design-sheets/[id]/quotes/[qid] → แก้ { quote_date, price, status, note }
 * DELETE /api/design-sheets/[id]/quotes/[qid] → ลบรอบ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../../master-v2/[entity]/route";
import { QUOTE_STATUSES } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id, qid } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { quote_date?: string; price?: number | null; offered_price?: number | null; status?: string; note?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.quote_date !== undefined) patch.quote_date = body.quote_date || null;
  if (body.price !== undefined) {
    const price = body.price != null ? Number(body.price) : null;
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      return NextResponse.json({ error: "ราคาต้องเป็นตัวเลขและไม่ติดลบ" }, { status: 400 });
    }
    patch.price = price;
  }
  if (body.offered_price !== undefined) {
    const op = body.offered_price != null ? Number(body.offered_price) : null;
    if (op != null && (!Number.isFinite(op) || op < 0)) {
      return NextResponse.json({ error: "ราคาต้องเป็นตัวเลขและไม่ติดลบ" }, { status: 400 });
    }
    patch.offered_price = op;
  }
  if (body.status !== undefined) {
    if (!(QUOTE_STATUSES as readonly string[]).includes(body.status ?? "")) {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.note !== undefined) patch.note = body.note?.trim() || null;

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("design_sheet_quotes").update(patch)
    .eq("id", qid).eq("sheet_id", id).select("round").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "quote_update", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { quote_id: qid, round: row.round, changed: Object.keys(patch).filter((k) => k !== "updated_at") },
  });
  return NextResponse.json({ id: qid, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id, qid } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("design_sheet_quotes").delete()
    .eq("id", qid).eq("sheet_id", id).select("round").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "quote_delete", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { quote_id: qid, round: row.round },
  });
  return NextResponse.json({ id: qid, error: null });
}
