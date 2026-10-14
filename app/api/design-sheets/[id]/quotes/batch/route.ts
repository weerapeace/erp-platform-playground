/**
 * Design Sheets — เสนอราคา "ทั้งครั้ง" (batch = 1 ครั้ง มีหลายไซส์ × หลายขั้นจำนวน; แต่ละช่อง = 1 แถวใน design_sheet_quotes)
 *
 * POST   /api/design-sheets/[id]/quotes/batch   { quote_date, status, note, cells: [{ parent_code, qty, price, offered_price, status? }] } → สร้างครั้งใหม่ (batch = ล่าสุด+1)
 * PATCH  /api/design-sheets/[id]/quotes/batch   { batch, quote_date?, note?, status? } → แก้ทุกช่องของครั้งนั้น
 * DELETE /api/design-sheets/[id]/quotes/batch?batch=N → ลบทั้งครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { QUOTE_STATUSES } from "../shared";
import { friendlyDbError } from "../../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CellIn = { parent_code?: string | null; qty?: number | null; price?: number | null; offered_price?: number | null; status?: string };
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const okStatus = (s: unknown, fallback: string) => (typeof s === "string" && (QUOTE_STATUSES as readonly string[]).includes(s) ? s : fallback);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { quote_date?: string; status?: string; note?: string | null; cells?: CellIn[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const cells = (Array.isArray(body.cells) ? body.cells : []).filter((c) => num(c.offered_price) != null || num(c.price) != null);
  if (!cells.length) return NextResponse.json({ error: "ใส่ราคาที่เสนออย่างน้อย 1 ช่อง" }, { status: 400 });
  for (const c of cells) {
    for (const v of [num(c.price), num(c.offered_price)]) if (v != null && v < 0) return NextResponse.json({ error: "ราคาต้องไม่ติดลบ" }, { status: 400 });
    const q = num(c.qty); if (q != null && q <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
  }
  const status = okStatus(body.status, "pending");
  const admin = supabaseAdmin();
  const [{ data: lastB }, { data: lastR }, { data: snap }] = await Promise.all([
    admin.from("design_sheet_quotes").select("batch").eq("sheet_id", id).order("batch", { ascending: false, nullsFirst: false }).limit(1),
    admin.from("design_sheet_quotes").select("round").eq("sheet_id", id).order("round", { ascending: false }).limit(1),
    admin.from("design_sheet_cost_snapshots").select("id").eq("sheet_id", id).order("taken_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const batch = ((lastB?.[0]?.batch as number | null) ?? 0) + 1;
  let round = ((lastR?.[0]?.round as number | undefined) ?? 0);
  const quote_date = body.quote_date || new Date().toISOString().slice(0, 10);
  const note = body.note?.trim() || null;
  const rows = cells.map((c) => ({
    sheet_id: id, batch, round: ++round, quote_date, note, created_by: user?.id ?? null,
    parent_code: c.parent_code == null ? "" : String(c.parent_code),
    qty: num(c.qty), price: num(c.price), offered_price: num(c.offered_price) ?? num(c.price),
    status: okStatus(c.status, status), cost_snapshot_id: (snap?.id as string | undefined) ?? null,
  }));
  const { error } = await admin.from("design_sheet_quotes").insert(rows);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, {
    action: "quote_add", entityType: "design_sheet", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { batch, cells: rows.length, status, sizes: [...new Set(rows.map((r) => r.parent_code))], qtys: [...new Set(rows.map((r) => r.qty))] },
  });
  return NextResponse.json({ batch, cells: rows.length, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { batch?: number; quote_date?: string | null; note?: string | null; status?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const batch = num(body.batch); if (batch == null) return NextResponse.json({ error: "ต้องระบุครั้งที่ (batch)" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.quote_date !== undefined) patch.quote_date = body.quote_date || null;
  if (body.note !== undefined) patch.note = body.note?.trim() || null;
  if (body.status !== undefined) { if (!(QUOTE_STATUSES as readonly string[]).includes(body.status ?? "")) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 }); patch.status = body.status; }
  const { data, error } = await supabaseAdmin().from("design_sheet_quotes").update(patch).eq("sheet_id", id).eq("batch", batch).select("id");
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  return NextResponse.json({ updated: data?.length ?? 0, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const batch = num(request.nextUrl.searchParams.get("batch")); if (batch == null) return NextResponse.json({ error: "ต้องระบุครั้งที่ (batch)" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("design_sheet_quotes").delete().eq("sheet_id", id).eq("batch", batch).select("id, parent_code, qty, offered_price");
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "quote_delete", entityType: "design_sheet", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { batch, cells: data?.length ?? 0, rows: data ?? [] } });
  return NextResponse.json({ deleted: data?.length ?? 0, error: null });
}
