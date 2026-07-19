/**
 * POST /api/assets/drive-import — นำเข้าโฟลเดอร์ Drive ที่ยังไม่เชื่อม → สร้างบัตร artwork ในคลัง
 *   body { brand_id, folders: [{folderId, folderName, folderLink, artworkType, master_path}] }
 *   ต่อโฟลเดอร์: หารูป preview ในโฟลเดอร์ → โหลดลง R2 → insert asset (ผูก master_url) · ไม่มีรูป = ข้าม
 *   → { imported, skipped, failed, results }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured, driveListImages, driveDownloadFile } from "@/lib/google-drive";
import { r2PutObject } from "@/lib/r2";
import { sha256Hex, detectAssetType, extOf } from "@/lib/assets";
import { actorId } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Folder = { folderId: string; folderName: string; folderLink?: string; artworkType?: string; master_path?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { brand_id?: string; folders?: Folder[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = String(body.brand_id ?? "").trim() || null;
  const folders = (Array.isArray(body.folders) ? body.folders : []).slice(0, 50);
  if (!folders.length) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  let imported = 0, skipped = 0, failed = 0;
  const results: { folderId: string; ok: boolean; skipped?: boolean; reason?: string }[] = [];

  for (const f of folders) {
    const name = (f.folderName || "artwork").trim();
    try {
      const imgs = await driveListImages(f.folderId);
      // เลือกรูป preview: ชื่อตรงกับโฟลเดอร์ก่อน · ไม่งั้นรูปแรก
      const pick = imgs.find((x) => x.name.replace(/\.[^.]+$/, "").trim() === name) || imgs[0];
      if (!pick) { skipped++; results.push({ folderId: f.folderId, ok: false, skipped: true, reason: "no-image" }); continue; }

      const dl = await driveDownloadFile(pick.id);
      if (!dl) { failed++; results.push({ folderId: f.folderId, ok: false, reason: "download-failed" }); continue; }

      const checksum = await sha256Hex(dl.bytes.buffer as ArrayBuffer);
      const ext = extOf(pick.name);
      const r2Key = `library/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
      await r2PutObject(r2Key, dl.bytes, dl.mimeType || "image/png");

      const artworkType = (f.artworkType || "").trim() || null;
      const { error } = await admin.from("assets").insert({
        title: name, file_name: pick.name, r2_key: r2Key, asset_type: detectAssetType(dl.mimeType, pick.name),
        content_type: dl.mimeType || null, ext: ext || null, size_bytes: dl.bytes.byteLength,
        checksum, uploaded_by: await actorId(request), status: "active",
        source: "artwork", artwork_type: artworkType, artwork_types: artworkType ? [artworkType] : [],
        master_path: (f.master_path || "").trim() || null,
        master_url: (f.folderLink || `https://drive.google.com/drive/folders/${f.folderId}`),
        brand_id: brandId,
      });
      if (error) { failed++; results.push({ folderId: f.folderId, ok: false, reason: error.message }); continue; }
      imported++; results.push({ folderId: f.folderId, ok: true });
    } catch (e) { failed++; results.push({ folderId: f.folderId, ok: false, reason: e instanceof Error ? e.message : "error" }); }
  }

  await writeAudit(admin, { action: "create", entityType: "asset", actorId: await actorId(request), metadata: { drive_import: { imported, skipped, failed } } });
  return NextResponse.json({ imported, skipped, failed, results, error: null });
}
