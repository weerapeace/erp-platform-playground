/**
 * โฟลเดอร์ Google Drive ของอัลบั้ม Contents
 * GET  /api/content-albums/[id]/drive   → { ok, label, folder_url, pending } หรือ { ok:false, reason } (ดูอย่างเดียว ไม่สร้างโฟลเดอร์)
 * POST /api/content-albums/[id]/drive   body = { name, mime, size } → { upload_url, folder_url }
 *      (สร้างโฟลเดอร์ <แบรนด์>/Content/อัลบั้ม/<YYYY-MM ชื่อ> ถ้ายังไม่มี · ตัวไฟล์ส่งทีละชิ้นที่ /api/drive/upload-chunk · จบแล้วเรียก ../files)
 *
 * สิทธิ์: ดู = assets.view · อัป = assets.upload
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveCreateResumableSession } from "@/lib/google-drive";
import { safeDriveName, driveFolderUrl } from "@/lib/content-drive";
import { resolveAlbumDriveFolder } from "@/lib/content-albums-server";
import { isUuid } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB ต่อไฟล์ (เพดานตัวส่งทีละชิ้น)
type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  try {
    const t = await resolveAlbumDriveFolder(supabaseAdmin(), id, false);
    if (!t.ok) return NextResponse.json({ data: { ok: false, reason: t.reason }, error: null });
    return NextResponse.json({ data: { ok: true, label: t.label, folder_url: t.folderId ? driveFolderUrl(t.folderId) : null, pending: !t.folderId }, error: null });
  } catch (e) {
    return NextResponse.json({ data: { ok: false, reason: `ติดต่อ Google Drive ไม่ได้: ${(e as Error).message}` }, error: null });
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  let body: { name?: unknown; mime?: unknown; size?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = safeDriveName(String(body.name ?? "")) || "file";
  const mime = typeof body.mime === "string" && body.mime ? body.mime : "application/octet-stream";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "ไฟล์ว่าง" }, { status: 400 });
  if (size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5GB — อัปผ่านแอป Google Drive เข้าโฟลเดอร์อัลบั้มแทน" }, { status: 400 });
  try {
    const t = await resolveAlbumDriveFolder(supabaseAdmin(), id, true);
    if (!t.ok || !t.folderId) return NextResponse.json({ error: t.ok ? "สร้างโฟลเดอร์ใน Drive ไม่สำเร็จ" : t.reason }, { status: 400 });
    const upload_url = await driveCreateResumableSession(name, mime, t.folderId);
    return NextResponse.json({ data: { upload_url, folder_url: driveFolderUrl(t.folderId) }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เริ่มอัปขึ้น Drive ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
