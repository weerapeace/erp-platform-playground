/**
 * Design Sheets API — รายใบ (เฟส 1)
 *
 * GET    /api/design-sheets/[id] → รายละเอียดใบงาน
 * PATCH  /api/design-sheets/[id] → แก้ไข (whitelist field) + กู้คืนจากกรุ (is_active)
 * DELETE /api/design-sheets/[id]        → เก็บเข้ากรุ (archive — ไม่ลบจริง)
 * DELETE /api/design-sheets/[id]?hard=1 → ลบถาวร + ย้ายรูปใน R2 เข้า trash/ (สำรอง 30 วัน) + ลบลูก (cascade)
 *
 * ของกลาง: guardApi (products.view/products.edit) + writeAudit → audit_logs + r2MoveToTrash
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { r2MoveToTrash, isR2Configured } from "@/lib/r2";
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
type CostExtra = { label: string; amount: number };
type PatchBody = {
  name?: string; brand_id?: string | null; detail?: string | null; note?: string | null;
  status?: string; order_date?: string | null; deadline?: string | null; drive_link?: string | null;
  is_active?: boolean; parent_sku_code?: string | null; parent_sku_codes?: string[]; cost_extra?: CostExtra[];
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
  if (body.cost_extra !== undefined) {
    // ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย/อื่นๆ) — sanitize: เก็บเฉพาะ {label, amount}
    patch.cost_extra = (Array.isArray(body.cost_extra) ? body.cost_extra : [])
      .map((c) => ({ label: String(c?.label ?? "").slice(0, 200), amount: Number(c?.amount) || 0 }))
      .filter((c) => c.label.trim() !== "" || c.amount !== 0);
  }
  if (body.status !== undefined) patch.status = body.status;   // ตรวจกับ workflow ด้านล่าง (หลังมี admin)
  const admin = supabaseAdmin();

  // สถานะต้องอยู่ในรายการของระบบ Workflow กลาง (เพิ่ม/ลบสถานะได้ที่ /admin/workflows)
  if (patch.status !== undefined && !(await isValidDsStatus(admin, String(patch.status)))) {
    return NextResponse.json({ error: "สถานะไม่ถูกต้อง — เช็ครายการสถานะที่ Admin · Workflows" }, { status: 400 });
  }

  // เฟส 5: ตั้ง Parent SKU (หลายรหัสได้) — รหัสซ้ำกับที่มีอยู่ = ห้ามบันทึก
  if (body.parent_sku_codes !== undefined || body.parent_sku_code !== undefined) {
    const raw = Array.isArray(body.parent_sku_codes)
      ? body.parent_sku_codes
      : (body.parent_sku_code ? [body.parent_sku_code] : []);
    const codes: string[] = [];
    for (const c of raw) {
      const code = String(c ?? "").trim().toUpperCase();
      if (code && !codes.includes(code)) codes.push(code);
    }
    if (codes.length) {
      const { data: dup } = await admin.from("parent_skus_v2").select("code").in("code", codes);
      const taken = (dup ?? []).map((d) => String((d as { code: string }).code).toUpperCase());
      if (taken.length) {
        return NextResponse.json({ error: `รหัส ${taken.join(", ")} มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ` }, { status: 400 });
      }
    }
    patch.parent_sku_codes = codes;
    patch.parent_sku_code = codes[0] ?? null;   // เก็บตัวแรกไว้ด้วย (backward compat)
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
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();

  // ---- ลบถาวร: ย้ายรูปใน R2 เข้า trash/ + ลบใบงาน (ลูก comments/cost_lines/quotes ลบตาม cascade) ----
  if (hard) {
    const { data: sheet } = await admin.from("design_sheets").select("code").eq("id", id).single();

    // รวบรวมรูปทั้งหมดของใบงานนี้จากตารางแนบไฟล์กลาง:
    //  - design_sheet / design_sheet_detail (entity_id = ใบงาน)
    //  - design_sheet_comment (entity_id = id ของแต่ละ comment — ต้องอ่านก่อน comment ถูก cascade ลบ)
    const { data: coms } = await admin.from("design_sheet_comments").select("id").eq("sheet_id", id);
    const commentIds = (coms ?? []).map((c) => (c as { id: string }).id);

    type Att = { id: string; file_path: string | null };
    const attRows: Att[] = [];
    const { data: sheetAtts } = await admin.from("erp_playground_attachments")
      .select("id, file_path").in("entity_type", ["design_sheet", "design_sheet_detail"]).eq("entity_id", id);
    attRows.push(...((sheetAtts ?? []) as Att[]));
    if (commentIds.length > 0) {
      const { data: comAtts } = await admin.from("erp_playground_attachments")
        .select("id, file_path").eq("entity_type", "design_sheet_comment").in("entity_id", commentIds);
      attRows.push(...((comAtts ?? []) as Att[]));
    }

    if (attRows.length > 0 && await isR2Configured()) {
      for (const a of attRows) {
        if (!a.file_path) continue;
        try { await r2MoveToTrash(a.file_path); }
        catch (e) { console.error("[design-sheet] R2 trash move failed:", a.file_path, e); }
      }
    }
    if (attRows.length > 0) await admin.from("erp_playground_attachments").delete().in("id", attRows.map((a) => a.id));

    const { error } = await admin.from("design_sheets").delete().eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

    await writeAudit(admin, {
      action: "delete", entityType: "design_sheet", entityId: id,
      actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { code: sheet?.code, deleted_images: attRows.length, hard: true },
    });
    return NextResponse.json({ id, error: null });
  }

  // ---- ค่าเริ่มต้น: เก็บเข้ากรุ (archive — ไม่ลบจริง) ----
  const { data: row, error } = await admin.from("design_sheets").update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id).select("id, code").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "archive", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { code: row.code },
  });
  return NextResponse.json({ id: row.id, error: null });
}
