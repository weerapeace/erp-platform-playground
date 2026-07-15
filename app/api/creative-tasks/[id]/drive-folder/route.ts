/**
 * POST /api/creative-tasks/[id]/drive-folder — สร้างโฟลเดอร์ Google Drive ของงาน (ถ้ายังไม่มี)
 *   + อัปไฟล์แนบทั้งหมดที่ยังไม่ขึ้น Drive → คืน { url, uploaded }
 * ตั้งชื่อ "<task_no> <title>" ในโฟลเดอร์แม่ (Shared Drive) · เก็บลิงก์ drive_folder_url/id
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured } from "@/lib/google-drive";
import { syncTaskFilesToDrive } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive — เพิ่ม env GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: task } = await admin.from("erp_creative_tasks").select("id").eq("id", id).maybeSingle();
  if (!task) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  try {
    const r = await syncTaskFilesToDrive(admin, id);
    // side-effect ภายนอก (สร้างโฟลเดอร์/อัปไฟล์ขึ้น Drive) → บันทึกประวัติ
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "drive_folder_sync", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { url: r.url, uploaded: r.uploaded } });
    return NextResponse.json({ url: r.url, uploaded: r.uploaded, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เชื่อม Google Drive ไม่สำเร็จ — ลองใหม่อีกครั้ง (${(e as Error).message})` }, { status: 500 });
  }
}
