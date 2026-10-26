import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { editContextFromRequest } from "@/lib/record-versions";
import { afterAttachmentRemoved, type RemovedAttachment } from "@/lib/attachment-remove";

// ---- DELETE /api/attachments/[id]?actor=.. ----
// ลบ metadata + ย้ายไฟล์ใน R2 เข้า trash/ (นโยบายกลาง: สำรอง 30 วันก่อนลบจริงด้วย lifecycle rule)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");
  const admin = supabaseAdmin();

  // อ่านแถวไว้ก่อนลบ — ถ้าเป็นรูปในแกลเลอรีสินค้า (Parent/SKU) จะเก็บเป็นเวอร์ชันเก่า (🕘 lib/record-versions)
  const { data: row } = await admin.from("erp_playground_attachments")
    .select("entity_type, entity_id, file_name, content_type, sort_order, is_primary").eq("id", id).maybeSingle();

  // ลบ metadata ก่อน — function คืน file_path
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_attachments_delete", { p_id: id, p_actor: actor });
  if (error) {
    console.error("[api/attachments/[id]] DB delete", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 🕘 รูปแกลเลอรีสินค้า → เก็บเป็นเวอร์ชัน (ย้อนได้) · ไฟล์อื่น → ย้ายเข้า trash/ ถ้าไม่มีที่อื่นใช้ (ของกลาง lib/attachment-remove)
  const filePath = (data as { file_path?: string })?.file_path ?? null;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { keptAsVersion, deletedFromR2, warning } = await afterAttachmentRemoved(admin, {
    id, row: (row as RemovedAttachment | null) ?? null, filePath,
    actorId: user?.id ?? null, actorName: actor || user?.email || null, ...editContextFromRequest(request),
  });

  return NextResponse.json({ success: true, deleted_from_r2: deletedFromR2, kept_as_version: keptAsVersion, file_path: filePath ?? null, warning, error: null });
}

// ---- PATCH /api/attachments/[id] (set primary) ----

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabaseFromRequest(request).rpc("erp_playground_attachments_set_primary", { p_id: id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, error: null });
}
