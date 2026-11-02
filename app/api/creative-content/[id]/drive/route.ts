/**
 * ต้นฉบับใน Google Drive ของงานจริงที่ใช้ลง (ป๊อปโพสต์)
 *
 * GET  /api/creative-content/[id]/drive          → { ok, folder_url, label, pending } หรือ { ok:false, reason } (ดูอย่างเดียว ไม่สร้างโฟลเดอร์)
 * POST /api/creative-content/[id]/drive          → เริ่มอัปต้นฉบับ { name, mime, size } → { upload_url, folder_url }
 *      (สร้างโฟลเดอร์ให้ถ้ายังไม่มี · ตัวไฟล์ส่งต่อทีละชิ้นที่ /api/drive/upload-chunk · จบแล้วเรียก ./finish)
 *
 * กติกาโฟลเดอร์ดู lib/content-drive.ts · สิทธิ์ ดู = tasks.view · อัป = tasks.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { driveCreateResumableSession } from "@/lib/google-drive";
import { resolveContentDriveTarget, safeDriveName } from "@/lib/content-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB ต่อไฟล์

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  try {
    const t = await resolveContentDriveTarget(supabaseAdmin(), id, false);
    if (!t.ok) return NextResponse.json({ data: { ok: false, reason: t.reason }, error: null });
    return NextResponse.json({ data: { ok: true, folder_url: t.folderUrl, label: t.label, pending: !t.folderId }, error: null });
  } catch (e) {
    return NextResponse.json({ data: { ok: false, reason: `ติดต่อ Google Drive ไม่ได้: ${(e as Error).message}` }, error: null });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { name?: unknown; mime?: unknown; size?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = safeDriveName(String(body.name ?? "")) || "file";
  const mime = typeof body.mime === "string" && body.mime ? body.mime : "application/octet-stream";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "ไฟล์ว่าง" }, { status: 400 });
  if (size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5GB" }, { status: 400 });
  try {
    const t = await resolveContentDriveTarget(supabaseAdmin(), id, true);
    if (!t.ok || !t.folderId) return NextResponse.json({ error: t.ok ? "สร้างโฟลเดอร์ใน Drive ไม่สำเร็จ" : t.reason }, { status: 400 });
    const upload_url = await driveCreateResumableSession(name, mime, t.folderId);
    return NextResponse.json({ data: { upload_url, folder_url: t.folderUrl }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เริ่มอัปขึ้น Drive ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
