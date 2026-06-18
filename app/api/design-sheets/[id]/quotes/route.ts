/**
 * Design Sheets — รอบเสนอราคา (เฟส 3)
 *
 * GET  /api/design-sheets/[id]/quotes → list เรียงตามครั้งที่
 * POST /api/design-sheets/[id]/quotes → เพิ่มรอบ (ครั้งที่ = ล่าสุด+1 อัตโนมัติ) { quote_date, price, status, note }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { QUOTE_STATUSES } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DesignSheetQuote = {
  id: string; sheet_id: string; round: number;
  quote_date: string | null; price: number | null; offered_price: number | null; status: string; note: string | null;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("design_sheet_quotes").select("*")
    .eq("sheet_id", id).order("round", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as DesignSheetQuote[], error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { quote_date?: string; price?: number; offered_price?: number; status?: string; note?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const price = body.price != null ? Number(body.price) : null;
  const offered = body.offered_price != null ? Number(body.offered_price) : null;
  for (const v of [price, offered]) if (v != null && (!Number.isFinite(v) || v < 0)) {
    return NextResponse.json({ error: "ราคาต้องเป็นตัวเลขและไม่ติดลบ" }, { status: 400 });
  }
  const status = body.status && (QUOTE_STATUSES as readonly string[]).includes(body.status) ? body.status : "pending";

  const admin = supabaseAdmin();
  // ครั้งที่ = ล่าสุด + 1
  const { data: last } = await admin.from("design_sheet_quotes").select("round")
    .eq("sheet_id", id).order("round", { ascending: false }).limit(1);
  const round = ((last?.[0]?.round as number | undefined) ?? 0) + 1;

  const { data: row, error } = await admin.from("design_sheet_quotes").insert({
    sheet_id: id, round, quote_date: body.quote_date || new Date().toISOString().slice(0, 10),
    price, offered_price: offered, status, note: body.note?.trim() || null, created_by: user?.id ?? null,
  }).select("id, round").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "quote_add", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { quote_id: row.id, round, price, status },
  });
  return NextResponse.json({ id: row.id, round, error: null });
}
