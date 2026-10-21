/**
 * Design Sheets — เวอร์ชันตีราคา (snapshot ทุกครั้งที่บันทึกตีราคาและเนื้อหาเปลี่ยน; สร้างใน PUT cost-lines)
 *
 * GET    /api/design-sheets/[id]/cost-snapshots          → รายการ (ไม่เอา lines ใหญ่ ๆ) เรียงใหม่→เก่า
 * GET    /api/design-sheets/[id]/cost-snapshots?id=<sid> → เวอร์ชันเดียวแบบเต็ม (lines + cost_extra)
 * PATCH  /api/design-sheets/[id]/cost-snapshots          { id, label } → ตั้งชื่อเวอร์ชัน
 * DELETE /api/design-sheets/[id]/cost-snapshots?id=<sid> → ลบเวอร์ชัน (audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM, costRestricted } from "@/lib/cost-access";
import { writeAudit, writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import type { SnapExtraMap, SnapLine, SnapTotals } from "@/lib/design-sheet-cost-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CostSnapshot = {
  id: string; sheet_id: string; taken_at: string; taken_by: string | null; taken_by_name: string | null;
  label: string | null; totals: SnapTotals; grand_total: number | null; lines_count?: number;
  lines?: SnapLine[]; cost_extra?: SnapExtraMap;
};

const LIST_COLS = "id, sheet_id, taken_at, taken_by, taken_by_name, label, totals, grand_total";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  if (!(await apiCan(request, COST_PERM))) return costRestricted();   // ไม่มีสิทธิ์ดูต้นทุน → ว่าง
  const { id } = await params;
  const sid = request.nextUrl.searchParams.get("id");
  const admin = supabaseAdmin();
  if (sid) {
    const { data, error } = await admin.from("design_sheet_cost_snapshots").select("*").eq("sheet_id", id).eq("id", sid).maybeSingle();
    if (error) return NextResponse.json({ data: null, error: friendlyDbError(error.message) }, { status: 500 });
    if (!data) return NextResponse.json({ data: null, error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });
    return NextResponse.json({ data: data as CostSnapshot, error: null });
  }
  // รายการ: นับจำนวนบรรทัดด้วย jsonb_array_length ผ่าน select ธรรมดาไม่ได้ → ดึง lines มาแล้วนับฝั่งนี้ (จำนวนเวอร์ชันถูกจำกัดไว้ 50/ใบ)
  const { data, error } = await admin.from("design_sheet_cost_snapshots").select(`${LIST_COLS}, lines`)
    .eq("sheet_id", id).order("taken_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const list = (data ?? []).map((s) => {
    const { lines, ...rest } = s as CostSnapshot & { lines: unknown };
    return { ...rest, lines_count: Array.isArray(lines) ? lines.length : 0 } as CostSnapshot;
  });
  return NextResponse.json({ data: list, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, COST_PERM); if (denied) return denied;
  const { id } = await params;
  let body: { id?: string; label?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id เวอร์ชัน" }, { status: 400 });
  const label = (body.label ?? "").toString().trim().slice(0, 120) || null;
  const { error } = await supabaseAdmin().from("design_sheet_cost_snapshots").update({ label }).eq("sheet_id", id).eq("id", body.id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAuditFor(request, supabaseAdmin(), { action: "cost_snapshot_label", entityType: "design_sheet", entityId: id, metadata: { snapshot_id: body.id, label } });
  return NextResponse.json({ ok: true, label, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, COST_PERM); if (denied) return denied;
  const { id } = await params;
  const sid = request.nextUrl.searchParams.get("id");
  if (!sid) return NextResponse.json({ error: "ต้องระบุ id เวอร์ชัน" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data: snap } = await admin.from("design_sheet_cost_snapshots").select(LIST_COLS).eq("sheet_id", id).eq("id", sid).maybeSingle();
  if (!snap) return NextResponse.json({ error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });
  const { error } = await admin.from("design_sheet_cost_snapshots").delete().eq("id", sid);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, {
    action: "cost_snapshot_delete", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { snapshot_id: sid, taken_at: (snap as CostSnapshot).taken_at, label: (snap as CostSnapshot).label, grand_total: (snap as CostSnapshot).grand_total },
  });
  return NextResponse.json({ ok: true, error: null });
}
