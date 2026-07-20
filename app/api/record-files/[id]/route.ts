/**
 * DELETE /api/record-files/[id]?actor= — ลบไฟล์แนบ 1 ไฟล์ (Supabase Storage + ทะเบียน)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import type { RecordFileRow } from "@/lib/record-files";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");

  const admin = supabaseAdmin();
  const { data } = await admin.from("erp_record_files").select("*").eq("id", id).maybeSingle();
  const row = data as RecordFileRow | null;
  if (!row) return NextResponse.json({ data: { deleted: true }, error: null });   // ลบไปแล้ว = ถือว่าสำเร็จ

  try { await admin.storage.from(row.bucket).remove([row.storage_path]); } catch { /* best-effort ลบไฟล์จริง */ }
  const { error } = await admin.from("erp_record_files").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "delete", entityType: "record_file", entityId: id, actorId: actor, metadata: { entity_type: row.entity_type, entity_id: row.entity_id, file_name: row.file_name } });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
