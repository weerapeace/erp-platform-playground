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

const IMG_RE = /^image\/(png|jpe?g|webp|gif)$/i;   // เฉพาะไฟล์รูปจริง (กัน .psd/.ai ที่ mime ขึ้นต้น image/ เหมือนกัน)

// ย่อรูปฝั่ง server เหลือกว้าง ≤1200px (คง png/webp · อื่น→jpeg) · gif/svg ไม่ย่อ · sharp พังก็คืนของเดิม
async function downscaleServer(bytes: Uint8Array, mime: string, maxW = 1200): Promise<{ bytes: Uint8Array; mime: string }> {
  if (/gif|svg/i.test(mime)) return { bytes, mime };
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(bytes).metadata();
    if (!meta.width || meta.width <= maxW) return { bytes, mime };
    const fmt = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpeg";
    const p = sharp(bytes).rotate().resize({ width: maxW, withoutEnlargement: true });
    const out = fmt === "png" ? await p.png().toBuffer() : fmt === "webp" ? await p.webp({ quality: 80 }).toBuffer() : await p.jpeg({ quality: 85 }).toBuffer();
    return { bytes: new Uint8Array(out), mime: `image/${fmt}` };
  } catch { return { bytes, mime }; }
}

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

  const actor = await actorId(request);
  const artworkTypeOf = (f: Folder) => (f.artworkType || "").trim() || null;
  const folderLinkOf = (f: Folder) => f.folderLink || `https://drive.google.com/drive/folders/${f.folderId}`;

  for (const f of folders) {
    const folderName = (f.folderName || "artwork").trim();
    try {
      const imgs = (await driveListImages(f.folderId)).filter((x) => IMG_RE.test(x.mimeType));   // เฉพาะไฟล์รูปจริง
      if (!imgs.length) { skipped++; results.push({ folderId: f.folderId, ok: false, skipped: true, reason: "no-image" }); continue; }

      let folderOk = 0;
      for (const img of imgs) {   // นำเข้าทุกรูปในโฟลเดอร์ (หลายสี = หลายบัตร)
        try {
          const dl = await driveDownloadFile(img.id);
          if (!dl) { failed++; continue; }
          const { bytes, mime } = await downscaleServer(dl.bytes, dl.mimeType || "image/png", 1200);   // ย่อ ≤1200px
          const title = img.name.replace(/\.[^.]+$/, "").trim() || folderName;   // ชื่อบัตร = ชื่อไฟล์รูป (แยกแต่ละสี)
          const ext = extOf(img.name) || (mime.split("/")[1] ?? "");
          const r2Key = `library/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
          await r2PutObject(r2Key, bytes, mime);
          const at = artworkTypeOf(f);
          const { error } = await admin.from("assets").insert({
            title, file_name: img.name, r2_key: r2Key, asset_type: detectAssetType(mime, img.name),
            content_type: mime || null, ext: ext || null, size_bytes: bytes.byteLength,
            checksum: await sha256Hex(bytes.buffer as ArrayBuffer), uploaded_by: actor, status: "active",
            source: "artwork", artwork_type: at, artwork_types: at ? [at] : [],
            master_path: (f.master_path || "").trim() || null, master_url: folderLinkOf(f), brand_id: brandId,
          });
          if (error) { failed++; continue; }
          imported++; folderOk++;
        } catch { failed++; }
      }
      results.push({ folderId: f.folderId, ok: folderOk > 0 });
    } catch (e) { failed++; results.push({ folderId: f.folderId, ok: false, reason: e instanceof Error ? e.message : "error" }); }
  }

  await writeAudit(admin, { action: "create", entityType: "asset", actorId: actor, metadata: { drive_import: { imported, skipped, failed } } });
  return NextResponse.json({ imported, skipped, failed, results, error: null });
}
