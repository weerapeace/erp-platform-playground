/**
 * /api/creative-tasks/[id]/drive-folder
 *   GET                                     → ข้อมูล popup (โฟลเดอร์ปลายทาง/ชื่อแนะนำ) · โหมดโครงสร้าง
 *   GET ?check=1&destination=&folder_name=  → { exists } (เช็กชื่อซ้ำ)
 *   POST { destination_name?, folder_name? } → สร้างโฟลเดอร์ + อัปไฟล์ → { url, uploaded, archived }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured } from "@/lib/google-drive";
import { syncTaskFilesToDrive, driveFolderCreateInfo, driveFolderExists } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;   // อัปหลายรูป (แกลเลอรี Parent+child SKU) ใช้เวลานาน — กัน timeout

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  if (sp.get("check") === "1") {
    const exists = await driveFolderExists(admin, id, sp.get("destination") ?? "", sp.get("folder_name") ?? "");
    return NextResponse.json({ exists, error: null });
  }
  return NextResponse.json({ ...(await driveFolderCreateInfo(admin, id)), error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive — เพิ่ม env GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: task } = await admin.from("erp_creative_tasks").select("id").eq("id", id).maybeSingle();
  if (!task) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  let body: { destination_name?: string; folder_name?: string } = {};
  try { body = await request.json(); } catch { /* ไม่มี body = ใช้ค่าเริ่มต้น */ }

  try {
    const r = await syncTaskFilesToDrive(admin, id, { destinationName: body.destination_name, folderName: body.folder_name });
    // side-effect ภายนอก (สร้างโฟลเดอร์/อัปไฟล์ขึ้น Drive) → บันทึกประวัติ
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "drive_folder_sync", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { url: r.url, uploaded: r.uploaded, archived: r.archived } });
    return NextResponse.json({ url: r.url, uploaded: r.uploaded, archived: r.archived, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เชื่อม Google Drive ไม่สำเร็จ — ลองใหม่อีกครั้ง (${(e as Error).message})` }, { status: 500 });
  }
}
