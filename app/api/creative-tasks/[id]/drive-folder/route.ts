/**
 * POST /api/creative-tasks/[id]/drive-folder — สร้าง (หรือคืนของเดิม) โฟลเดอร์ Google Drive ของงานนี้
 * ตั้งชื่อ "<task_no> <title>" ในโฟลเดอร์แม่ (Shared Drive) → เก็บลิงก์ลง drive_folder_url + drive_folder_id
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveCreateFolder, DRIVE_ROOT_FOLDER_ID } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive — เพิ่ม env GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY ใน Vercel แล้ว redeploy" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: task } = await admin.from("erp_creative_tasks").select("id, task_no, title, drive_folder_url, drive_folder_id").eq("id", id).maybeSingle();
  if (!task) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
  const t = task as { task_no?: string | null; title?: string | null; drive_folder_url?: string | null; drive_folder_id?: string | null };

  // มีโฟลเดอร์อยู่แล้ว → คืนของเดิม (idempotent)
  if (t.drive_folder_id && t.drive_folder_url) return NextResponse.json({ url: t.drive_folder_url, id: t.drive_folder_id, existed: true, error: null });

  const name = `${t.task_no ?? ""} ${t.title ?? ""}`.trim() || "งาน";
  try {
    const f = await driveCreateFolder(name, DRIVE_ROOT_FOLDER_ID);
    await admin.from("erp_creative_tasks").update({ drive_folder_url: f.webViewLink, drive_folder_id: f.id }).eq("id", id);
    return NextResponse.json({ url: f.webViewLink, id: f.id, existed: false, error: null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
