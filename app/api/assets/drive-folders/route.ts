/**
 * POST /api/assets/drive-folders — bulk: สร้างโฟลเดอร์ Drive + ก็อปรูป preview ให้หลายไฟล์ที่เลือก
 *   body { ids: string[] } (≤50)
 *   ต่อไฟล์: ถ้ามีโฟลเดอร์แล้ว (master_url มี /folders/) → ข้าม · ไม่งั้น ensure โฟลเดอร์ + ก็อป preview จาก R2 + เก็บ master_url
 *   → { created, skipped, failed, results:[{id, ok, skipped?, folderLink?, error?}] }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured, driveGetFolder, parseDriveFolderId } from "@/lib/google-drive";
import { resolveArtworkDriveFolder, copyAssetPreviewToDrive } from "@/lib/artwork-drive";
import { actorId } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Row = { id: string; title: string | null; file_name: string; r2_key: string; content_type: string | null; brand_id: string | null; artwork_type: string | null; master_url: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter(Boolean).map(String))].slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data } = await admin.from("assets")
    .select("id, title, file_name, r2_key, content_type, brand_id, artwork_type, master_url").in("id", ids);

  let created = 0, skipped = 0, failed = 0;
  const results: { id: string; ok: boolean; skipped?: boolean; folderLink?: string; error?: string }[] = [];
  for (const a of (data ?? []) as Row[]) {
    // มีโฟลเดอร์อยู่แล้ว → ข้าม (ไม่สร้างซ้ำ/ไม่ก็อป preview ซ้ำ)
    if (parseDriveFolderId(a.master_url ?? "")) { skipped++; results.push({ id: a.id, ok: true, skipped: true, folderLink: a.master_url ?? undefined }); continue; }
    try {
      const name = (a.title || a.file_name || "artwork").trim();
      const folderId = await resolveArtworkDriveFolder(admin, { brandId: a.brand_id, artworkType: a.artwork_type, name });
      if (a.r2_key) { try { await copyAssetPreviewToDrive(folderId, { r2_key: a.r2_key, name, content_type: a.content_type }); } catch { /* preview พังไม่เป็นไร */ } }
      const info = await driveGetFolder(folderId);
      const folderLink = info?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;
      await admin.from("assets").update({ master_url: folderLink }).eq("id", a.id);
      created++; results.push({ id: a.id, ok: true, folderLink });
    } catch (e) { failed++; results.push({ id: a.id, ok: false, error: e instanceof Error ? e.message : "error" }); }
  }

  await writeAudit(admin, { action: "update", entityType: "asset", entityId: ids[0], actorId: await actorId(request), metadata: { bulk_drive_folders: { created, skipped, failed } } });
  return NextResponse.json({ created, skipped, failed, results, error: null });
}
