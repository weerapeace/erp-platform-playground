/**
 * Design Sheets — บรรทัดตีราคา (เฟส 4)
 *
 * GET /api/design-sheets/[id]/cost-lines → list เรียงตาม sort_order
 * PUT /api/design-sheets/[id]/cost-lines → บันทึกทั้งชุด (ลบของเดิม + insert ใหม่ตามที่ส่งมา)
 *
 * ปริมาณ/ยอดเงิน คำนวณจากหน้าจอ (lib/design-sheets-meta calcCostQty) — เก็บ snapshot ลง DB
 * เพื่อให้ราคาที่เคยตีไว้ไม่เปลี่ยนตามราคาวัสดุที่แก้ทีหลัง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CostLine = {
  id?: string; item_id: string | null; item_name: string | null; group_name: string | null;
  group_code?: string | null; price_basis?: string | null;   // ตีราคาแบบกลุ่ม: code กลุ่ม + ฐานราคา (avg/set/manual)
  parent_code?: string | null;   // ข้อ 7: บรรทัดนี้อยู่แท็บ Parent ไหน (null = ทั่วไป)
  calc_method: string | null; width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm: number | null; waste_percent: number | null; divisor: number | null;
  qty: number | null; uom: string | null; unit_price: number | null; amount: number | null;
  note: string | null; sort_order: number;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("design_sheet_cost_lines").select("*")
    .eq("sheet_id", id).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as CostLine[], error: null });
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { lines?: CostLine[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const lines = Array.isArray(body.lines) ? body.lines : [];

  const rows = lines.map((l, i) => ({
    sheet_id: id,
    item_id: l.item_id || null, item_name: l.item_name?.trim() || null, group_name: l.group_name || null,
    group_code: l.group_code || null, price_basis: l.price_basis || null,
    parent_code: l.parent_code || null,
    calc_method: l.calc_method || null,
    width_cm: num(l.width_cm), length_cm: num(l.length_cm), pieces: num(l.pieces),
    face_width_cm: num(l.face_width_cm), waste_percent: num(l.waste_percent), divisor: num(l.divisor),
    qty: num(l.qty), uom: l.uom || null, unit_price: num(l.unit_price), amount: num(l.amount),
    note: l.note?.trim() || null, sort_order: i + 1,
  }));

  const admin = supabaseAdmin();
  const { error: delErr } = await admin.from("design_sheet_cost_lines").delete().eq("sheet_id", id);
  if (delErr) return NextResponse.json({ error: friendlyDbError(delErr.message) }, { status: 400 });
  if (rows.length > 0) {
    const { error: insErr } = await admin.from("design_sheet_cost_lines").insert(rows);
    if (insErr) return NextResponse.json({ error: friendlyDbError(insErr.message) }, { status: 400 });
  }

  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  await writeAudit(admin, {
    action: "cost_update", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { lines: rows.length, total: Math.round(total * 100) / 100 },
  });
  return NextResponse.json({ saved: rows.length, total, error: null });
}
