/**
 * GET  /api/drive           → { configured } (ตั้งค่า Google Drive ครบไหม)
 * POST /api/drive (prepare)  body { name, artworkType?, files:[{filename,mime}] }
 *   → สร้างโฟลเดอร์ชื่อ = name (ใต้โฟลเดอร์ที่แม็ปตามชนิด, ไม่มีก็ใช้โฟลเดอร์แม่)
 *     + เริ่ม resumable session ต่อไฟล์ → คืน { folderId, folderLink, uploads:[{filename,uploadUrl}] }
 *   เบราว์เซอร์เอา uploadUrl ไป PUT ไฟล์ตรงเข้า Drive (รองรับไฟล์ใหญ่)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveEnsureFolder, driveGetFolder, driveCreateResumableSession, DRIVE_ROOT_FOLDER_ID } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ configured: driveConfigured() });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive (env)" }, { status: 503 });

  let body: { name?: string; artworkType?: string; files?: { filename: string; mime: string }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = body.name?.trim();
  if (!name || !body.files?.length) return NextResponse.json({ error: "ต้องมีชื่อ + ไฟล์อย่างน้อย 1" }, { status: 400 });

  try {
    // โฟลเดอร์ปลายทางตามชนิดงาน (ถ้ามีแม็ป) → ไม่มีใช้โฟลเดอร์แม่
    let parent = DRIVE_ROOT_FOLDER_ID;
    if (body.artworkType) {
      const { data } = await supabaseAdmin().from("erp_artwork_drive_folders").select("folder_id").eq("artwork_type", body.artworkType).maybeSingle();
      if (data?.folder_id) parent = String(data.folder_id);
    }
    const folderId = await driveEnsureFolder(name, parent);                 // มีชื่อซ้ำ = ใช้เดิม
    const info = await driveGetFolder(folderId);
    const folderLink = info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;

    const uploads: { filename: string; uploadUrl: string }[] = [];
    for (const f of body.files) uploads.push({ filename: f.filename, uploadUrl: await driveCreateResumableSession(f.filename, f.mime, folderId) });

    return NextResponse.json({ folderId, folderLink, uploads, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
