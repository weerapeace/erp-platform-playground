/**
 * 🎓 ศูนย์เรียนรู้ — คลิปยาว/ไฟล์ประกอบบทเรียน = โฟลเดอร์ Google Drive ต่อบท (กฎที่เก็บไฟล์ learning_videos → Drive)
 * GET  /api/learn/<id>/drive  → { folder_url | null }
 * POST /api/learn/<id>/drive  body { name, mime, size } → { upload_url, folder_url }  (ใช้กับ DriveUploadBox)
 *      โฟลเดอร์ = <งาน ERP>/ศูนย์เรียนรู้/<ชื่อบทเรียน> · สร้างตอนอัปไฟล์แรก แล้วจำลิงก์ไว้ที่บทเรียน
 * สิทธิ์: ดู = learn.view · อัป = learn.manage · ประวัติ learn_lesson.drive_upload ทุกไฟล์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { DRIVE_ROOT_FOLDER_ID, driveConfigured, driveCreateResumableSession, driveEnsureFolder, driveGetFolder, parseDriveFolderId } from "@/lib/google-drive";
import { safeDriveName } from "@/lib/content-drive";
import { LEARN_MANAGE, LEARN_VIEW } from "@/lib/learn";
import { loadLesson } from "@/lib/learn-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB ต่อไฟล์
const PARENT = "ศูนย์เรียนรู้";
type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
const folderUrl = (id: string, link?: string | null) => link || `https://drive.google.com/drive/folders/${id}`;

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_VIEW); if (denied) return denied;
  const l = await loadLesson((await ctx.params).id);
  if (!l) return bad("ไม่พบบทเรียนนี้", 404);
  return NextResponse.json({ data: { folder_url: l.drive_folder_url }, error: null });
}

export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const l = await loadLesson((await ctx.params).id);
  if (!l) return bad("ไม่พบบทเรียนนี้", 404);
  if (!driveConfigured()) return bad("ยังไม่ได้เชื่อม Google Drive (แจ้งผู้ดูแลระบบ)", 503);
  let body: { name?: unknown; mime?: unknown; size?: unknown };
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const name = safeDriveName(String(body.name ?? "")) || "file";
  const mime = typeof body.mime === "string" && body.mime ? body.mime : "application/octet-stream";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) return bad("ไฟล์ว่าง");
  if (size > MAX_BYTES) return bad("ไฟล์ใหญ่เกิน 5GB");

  const admin = supabaseAdmin();
  try {
    // โฟลเดอร์ที่จำไว้ยังอยู่ → ใช้ต่อ · ไม่งั้นหา/สร้าง <งาน ERP>/ศูนย์เรียนรู้/<ชื่อบท>
    let folderId = parseDriveFolderId(l.drive_folder_url ?? "");
    let url = l.drive_folder_url;
    if (folderId && !(await driveGetFolder(folderId).catch(() => null))) folderId = null;
    if (!folderId) {
      const parent = await driveEnsureFolder(PARENT, DRIVE_ROOT_FOLDER_ID);
      folderId = await driveEnsureFolder(safeDriveName(l.title) || l.id, parent);
      const f = await driveGetFolder(folderId).catch(() => null);
      url = folderUrl(folderId, f?.webViewLink);
      await admin.from("erp_help_guides").update({ drive_folder_url: url }).eq("id", l.id);
    }
    const upload_url = await driveCreateResumableSession(name, mime, folderId);
    await writeAuditFor(request, admin, {
      action: "learn_lesson.drive_upload", entityType: "learn_lesson", entityId: l.id,
      metadata: { name: l.title, file: name, size, folder_url: url },
    });
    return NextResponse.json({ data: { upload_url, folder_url: url }, error: null });
  } catch (e) {
    return bad(`เชื่อม Google Drive ไม่สำเร็จ: ${(e as Error).message}`, 502);
  }
}
