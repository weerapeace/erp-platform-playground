/**
 * Design Sheets — Comment ลูกค้า รายแถว (เฟส 3)
 *
 * PATCH  /api/design-sheets/[id]/comments/[cid] → แก้ { comment_date, body }
 * DELETE /api/design-sheets/[id]/comments/[cid] → ลบจริง + ลบรูปประกอบใน R2 ด้วย (กันไฟล์ขยะค้าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { r2MoveToTrash, isR2Configured } from "@/lib/r2";
import { friendlyDbError } from "../../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id, cid } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { comment_date?: string; body?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.body !== undefined) {
    const text = (body.body ?? "").trim();
    if (!text) return NextResponse.json({ error: "กรุณาใส่รายการ comment" }, { status: 400 });
    patch.body = text;
  }
  if (body.comment_date !== undefined) patch.comment_date = body.comment_date || new Date().toISOString().slice(0, 10);

  const admin = supabaseAdmin();
  const { error } = await admin.from("design_sheet_comments").update(patch).eq("id", cid).eq("sheet_id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "comment_update", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { comment_id: cid },
  });
  return NextResponse.json({ id: cid, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id, cid } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();

  // ลบรูปประกอบของ comment นี้ — metadata ลบเลย ส่วนไฟล์ใน R2 ย้ายเข้า trash/ (สำรอง 30 วันตามนโยบายกลาง)
  const { data: atts } = await admin.from("erp_playground_attachments")
    .select("id, file_path").eq("entity_type", "design_sheet_comment").eq("entity_id", cid);
  const attRows = (atts ?? []) as Array<{ id: string; file_path: string | null }>;
  if (attRows.length > 0) {
    if (await isR2Configured()) {
      for (const a of attRows) {
        if (!a.file_path) continue;
        try { await r2MoveToTrash(a.file_path); }
        catch (e) { console.error("[design-sheet-comment] R2 trash move failed:", a.file_path, e); }
      }
    }
    await admin.from("erp_playground_attachments").delete().in("id", attRows.map((a) => a.id));
  }

  const { error } = await admin.from("design_sheet_comments").delete().eq("id", cid).eq("sheet_id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "comment_delete", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { comment_id: cid, deleted_images: attRows.length },
  });
  return NextResponse.json({ id: cid, error: null });
}
