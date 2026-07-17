/**
 * POST /api/assets/drive-folders/combined — สร้างโฟลเดอร์ Drive "เดียว" แล้วใส่ทุกรูปที่เลือกเข้าไป
 *   body { ids: string[], brand_id?, artwork_type?, folder_name, master_path? }
 *   - resolve/สร้างโฟลเดอร์ชื่อ folder_name (ใต้แบรนด์/ชนิด) 1 อัน
 *   - ก็อปรูป preview ของทุกรูปเข้าโฟลเดอร์นั้น + เก็บ master_url เดียวกัน (+ master_path ถ้าส่งมา)
 *   → { folderLink, count }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured, driveGetFolder } from "@/lib/google-drive";
import { resolveArtworkDriveFolder, copyAssetPreviewToDrive } from "@/lib/artwork-drive";
import { actorId } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Row = { id: string; title: string | null; file_name: string; r2_key: string | null; content_type: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { ids?: string[]; brand_id?: string; artwork_type?: string; folder_name?: string; master_path?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter(Boolean).map(String))].slice(0, 50) : [];
  const folderName = String(body.folder_name ?? "").trim();
  const masterPath = String(body.master_path ?? "").trim();
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });
  if (!folderName) return NextResponse.json({ error: "ต้องตั้งชื่อโฟลเดอร์" }, { status: 400 });

  const admin = supabaseAdmin();
  try {
    // สร้าง/หาโฟลเดอร์เดียว
    const folderId = await resolveArtworkDriveFolder(admin, { brandId: body.brand_id ?? null, artworkType: body.artwork_type ?? null, name: folderName });
    const info = await driveGetFolder(folderId);
    const folderLink = info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;

    const { data } = await admin.from("assets").select("id, title, file_name, r2_key, content_type").in("id", ids);
    let count = 0;
    for (const a of (data ?? []) as Row[]) {
      const name = (a.title || a.file_name || "artwork").trim();
      if (a.r2_key) { try { await copyAssetPreviewToDrive(folderId, { r2_key: a.r2_key, name, content_type: a.content_type }); } catch { /* preview พังไม่เป็นไร */ } }
      const patch: Record<string, unknown> = { master_url: folderLink };
      if (masterPath) patch.master_path = masterPath;
      await admin.from("assets").update(patch).eq("id", a.id);
      count++;
    }

    await writeAudit(admin, { action: "update", entityType: "asset", entityId: ids[0], actorId: await actorId(request), metadata: { combined_drive_folder: { folderId, folderName, count } } });
    return NextResponse.json({ folderLink, count, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
