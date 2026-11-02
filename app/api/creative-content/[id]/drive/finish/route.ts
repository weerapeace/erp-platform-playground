/**
 * อัปต้นฉบับขึ้น Drive เสร็จ → ผูกกับไฟล์แนบของโพสต์
 *
 * POST /api/creative-content/[id]/drive/finish
 *   { file_id, attachment_id }                   → รูป: เติม drive_file_id ให้ไฟล์แนบเดิม (รูปย่ออยู่ R2 แล้ว)
 *   { file_id, kind:"video", name, mime, size }  → วิดีโอ: สร้างไฟล์แนบใหม่ url = drive:<id> (เล่น/โพสต์ดึงจาก Drive)
 * สิทธิ์ tasks.edit · audit "attachment:drive_original"
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { driveFileMeta } from "@/lib/google-drive";
import { friendlyDbError } from "../../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { file_id?: unknown; attachment_id?: unknown; kind?: unknown; name?: unknown; mime?: unknown; size?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const fileId = String(body.file_id ?? "");
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return NextResponse.json({ error: "file_id ไม่ถูกต้อง" }, { status: 400 });
  const meta = await driveFileMeta(fileId);
  if (!meta) return NextResponse.json({ error: "ไม่พบไฟล์ใน Drive" }, { status: 404 });
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let row: unknown = null;
  if (typeof body.attachment_id === "string" && body.attachment_id) {
    const { data, error } = await admin.from("erp_creative_attachments").update({ drive_file_id: fileId }).eq("id", body.attachment_id).eq("content_id", id).select("*").maybeSingle();
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    if (!data) return NextResponse.json({ error: "ไม่พบไฟล์แนบ (อาจถูกลบไปแล้ว) — ต้นฉบับยังอยู่ใน Drive" }, { status: 404 });
    row = data;
  } else if (body.kind === "video") {
    const { data, error } = await admin.from("erp_creative_attachments").insert({
      content_id: id, kind: "video", url: `drive:${fileId}`, drive_file_id: fileId,
      label: (typeof body.name === "string" && body.name) || meta.name || "Google Drive", file_name: meta.name || null,
      content_type: (typeof body.mime === "string" && body.mime) || meta.mimeType || null,
      size_bytes: typeof body.size === "number" ? body.size : meta.size ?? null, uploaded_by: user?.id ?? null,
    }).select("*").single();
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    row = data;
  } else {
    return NextResponse.json({ error: "ต้องระบุ attachment_id หรือ kind=video" }, { status: 400 });
  }
  await writeAudit(admin, { action: "attachment:drive_original", entityType: "creative_content", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { drive_file_id: fileId, name: meta.name, size: meta.size ?? null } });
  return NextResponse.json({ data: row, error: null });
}
