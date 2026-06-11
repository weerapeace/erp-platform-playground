/**
 * Design Sheets API — รายใบ (เฟส 1)
 *
 * GET    /api/design-sheets/[id] → รายละเอียดใบงาน
 * PATCH  /api/design-sheets/[id] → แก้ไข (whitelist field) + กู้คืนจากกรุ (is_active)
 * DELETE /api/design-sheets/[id] → เก็บเข้ากรุ (archive — ไม่ลบจริง)
 *
 * ของกลาง: guardApi (products.view/products.edit) + writeAudit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { isValidDsStatus } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("design_sheets")
    .select("*, brand:brands!brand_id(name, color)").eq("id", id).single();
  if (error) return NextResponse.json({ data: null, error: friendlyDbError(error.message) }, { status: 404 });
  return NextResponse.json({ data, error: null });
}

// field ที่แก้ได้ (whitelist)
type PatchBody = {
  name?: string; brand_id?: string | null; detail?: string | null; note?: string | null;
  status?: string; order_date?: string | null; deadline?: string | null; drive_link?: string | null;
  is_active?: boolean; parent_sku_code?: string | null;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่องาน" }, { status: 400 });
    patch.name = name;
  }
  if (body.brand_id !== undefined)   patch.brand_id = body.brand_id || null;
  if (body.detail !== undefined)     patch.detail = body.detail ?? null;
  if (body.note !== undefined)       patch.note = body.note ?? null;
  if (body.order_date !== undefined) patch.order_date = body.order_date || null;
  if (body.deadline !== undefined)   patch.deadline = body.deadline || null;
  if (body.drive_link !== undefined) patch.drive_link = body.drive_link?.trim() || null;
  if (body.is_active !== undefined)  patch.is_active = !!body.is_active;
  if (body.status !== undefined) patch.status = body.status;   // ตรวจกับ workflow ด้านล่าง (หลังมี admin)
  const admin = supabaseAdmin();

  // สถานะต้องอยู่ในรายการของระบบ Workflow กลาง (เพิ่ม/ลบสถานะได้ที่ /admin/workflows)
  if (patch.status !== undefined && !(await isValidDsStatus(admin, String(patch.status)))) {
    return NextResponse.json({ error: "สถานะไม่ถูกต้อง — เช็ครายการสถานะที่ Admin · Workflows" }, { status: 400 });
  }

  // เฟส 5: ตั้ง Parent SKU — รหัสซ้ำกับที่มีอยู่ = ห้ามบันทึก (ตั้งข้ามเลข = เตือนฝั่งหน้าจอ แต่บันทึกได้)
  if (body.parent_sku_code !== undefined) {
    const code = body.parent_sku_code?.trim().toUpperCase() || null;
    if (code) {
      const { data: dup } = await admin.from("parent_skus_v2").select("code").ilike("code", code).limit(1);
      if ((dup ?? []).length > 0) {
        return NextResponse.json({ error: `รหัส ${code} มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ` }, { status: 400 });
      }
    }
    patch.parent_sku_code = code;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });
  patch.updated_at = new Date().toISOString();
  const { data: row, error } = await admin.from("design_sheets").update(patch).eq("id", id).select("id, code").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: body.is_active === true ? "restore" : "update", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { code: row.code, changed: Object.keys(patch).filter((k) => k !== "updated_at") },
  });
  return NextResponse.json({ id: row.id, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("design_sheets").update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id).select("id, code").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "archive", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { code: row.code },
  });
  return NextResponse.json({ id: row.id, error: null });
}
