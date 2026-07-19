/**
 * POST /api/assets/drive-import — นำเข้ารูปจาก Drive → สร้างบัตร artwork ในคลัง (กรอกรายละเอียดได้)
 *   body {
 *     brand_id,
 *     items: [{ fileId, fileName, folderLink, master_path, title, artwork_types, sizes, parent_sku_codes }],
 *     tags?: string[], keywords?, collection_ids?: string[]   // batch ใช้กับทุกรูป
 *   }
 *   ต่อรูป: โหลดจาก Drive → ย่อ ≤1200px → R2 → insert asset + แท็ก/อัลบั้ม
 *   → { imported, failed, results }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured, driveDownloadFile } from "@/lib/google-drive";
import { r2PutObject } from "@/lib/r2";
import { sha256Hex, detectAssetType, extOf } from "@/lib/assets";
import { actorId, attachTags, setCollections, normalizeSizes, normalizeCodes } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Item = { fileId?: string; fileName?: string; folderLink?: string; master_path?: string; title?: string; artwork_types?: unknown; sizes?: unknown; parent_sku_codes?: unknown };

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

  let body: { brand_id?: string; items?: Item[]; tags?: string[]; keywords?: string; collection_ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = String(body.brand_id ?? "").trim() || null;
  const items = (Array.isArray(body.items) ? body.items : []).filter((x) => x.fileId).slice(0, 100);
  if (!items.length) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });
  const tags = Array.isArray(body.tags) ? body.tags.map((s) => String(s).trim()).filter(Boolean) : [];
  const keywords = (body.keywords ?? "").trim() || null;
  const collectionIds = Array.isArray(body.collection_ids) ? body.collection_ids.map(String).filter(Boolean) : [];

  const admin = supabaseAdmin();
  const actor = await actorId(request);
  let imported = 0, failed = 0;
  const results: { fileId: string; ok: boolean; reason?: string }[] = [];

  for (const it of items) {
    const fileId = String(it.fileId);
    try {
      const dl = await driveDownloadFile(fileId);
      if (!dl) { failed++; results.push({ fileId, ok: false, reason: "download-failed" }); continue; }
      const { bytes, mime } = await downscaleServer(dl.bytes, dl.mimeType || "image/png", 1200);
      const fileName = (it.fileName || dl.name || "image").trim();
      const title = (it.title || "").trim() || fileName.replace(/\.[^.]+$/, "").trim() || "artwork";
      const artworkTypes = normalizeCodes(it.artwork_types);
      const ext = extOf(fileName) || (mime.split("/")[1] ?? "");
      const r2Key = `library/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
      await r2PutObject(r2Key, bytes, mime);

      const { data: ins, error } = await admin.from("assets").insert({
        title, file_name: fileName, r2_key: r2Key, asset_type: detectAssetType(mime, fileName),
        content_type: mime || null, ext: ext || null, size_bytes: bytes.byteLength,
        checksum: await sha256Hex(bytes.buffer as ArrayBuffer), uploaded_by: actor, status: "active",
        source: "artwork", artwork_type: artworkTypes[0] ?? null, artwork_types: artworkTypes,
        keywords, sizes: normalizeSizes(it.sizes), parent_sku_codes: normalizeCodes(it.parent_sku_codes),
        master_path: (it.master_path || "").trim() || null,
        master_url: (it.folderLink || "").trim() || null, brand_id: brandId,
      }).select("id").single();
      if (error || !ins) { failed++; results.push({ fileId, ok: false, reason: error?.message }); continue; }
      if (tags.length) await attachTags(admin, ins.id as string, tags);
      if (collectionIds.length) await setCollections(admin, ins.id as string, collectionIds);
      imported++; results.push({ fileId, ok: true });
    } catch (e) { failed++; results.push({ fileId, ok: false, reason: e instanceof Error ? e.message : "error" }); }
  }

  await writeAudit(admin, { action: "create", entityType: "asset", actorId: actor, metadata: { drive_import: { imported, failed } } });
  return NextResponse.json({ imported, failed, results, error: null });
}
