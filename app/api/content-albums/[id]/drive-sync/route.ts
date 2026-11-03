/**
 * POST /api/content-albums/[id]/drive-sync — "ดึงไฟล์ใหม่จาก Drive" ของอัลบั้ม
 *   1) ตรวจไฟล์ในอัลบั้มว่ายังอยู่ใน Drive ไหม (ขึ้น/ล้างป้าย "หายจาก Drive")
 *   2) หาไฟล์รูป/วิดีโอที่ใส่เองในโฟลเดอร์อัลบั้ม (เช่น อัปจากแอป Google Drive บนมือถือ) ที่ระบบยังไม่รู้จัก → ลงอัลบั้ม
 *      รูป = ทำรูปย่อ ≤1600px ลง R2 · วิดีโอ = ไม่มีภาพปก (ขึ้นไอคอน) · ทีละไม่เกิน BATCH ไฟล์ → { remaining } > 0 = เรียกซ้ำ
 *   ไฟล์ที่เคยเอาออกจากอัลบั้มแล้ว (รายการในคลังถูกทิ้ง) ไม่ดึงกลับ
 *   → { added, remaining, missing (ทั้งอัลบั้มตอนนี้), restored, skipped (ชนิดที่ไม่รับ) }
 * สิทธิ์ assets.upload · audit content_album drive_sync
 * ข้อจำกัด: อ่านโฟลเดอร์ได้ครั้งละ 100 ไฟล์แรก (lib/google-drive driveListFiles)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { driveListFiles, driveDownloadFile } from "@/lib/google-drive";
import { r2PutObject } from "@/lib/r2";
import { detectAssetType, extOf } from "@/lib/assets";
import { analyzeImageBuffer } from "@/lib/image-hash-server";
import { resolveAlbumDriveFolder, checkDriveFiles } from "@/lib/content-albums-server";
import { isUuid } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const BATCH = 12;
const PREVIEW_MAX_BYTES = 60 * 1024 * 1024;   // รูปใหญ่กว่านี้ไม่โหลดมาย่อ (ขึ้นไอคอนแทน)
const isMedia = (mime: string) => mime.startsWith("image/") || mime.startsWith("video/");

async function makePreview(bytes: Uint8Array): Promise<{ buf: Buffer; width: number | null; height: number | null } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(bytes, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    const buf = await img.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const portrait = meta.orientation && meta.orientation >= 5;
    return { buf, width: (portrait ? meta.height : meta.width) ?? null, height: (portrait ? meta.width : meta.height) ?? null };
  } catch { return null; }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  const admin = supabaseAdmin();
  const { data: album } = await admin.from("content_albums").select("id, brand_id, trashed_at").eq("id", id).maybeSingle();
  if (!album) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });

  // 1) ไฟล์ในอัลบั้มยังอยู่ใน Drive ไหม
  const { data: maps } = await admin.from("asset_collection_map").select("asset:assets!asset_id(id, drive_file_id, drive_missing_at, status)").eq("collection_id", id).limit(2000);
  type A = { id: string; drive_file_id: string | null; drive_missing_at: string | null; status: string };
  const inAlbum = ((maps ?? []) as { asset: A | A[] | null }[]).map((m) => (Array.isArray(m.asset) ? m.asset[0] : m.asset)).filter((a): a is A => !!a && a.status === "active");
  const withDrive = inAlbum.filter((a): a is A & { drive_file_id: string } => !!a.drive_file_id);
  const check = await checkDriveFiles(admin, withDrive);
  const { count: missingNow } = withDrive.length
    ? await admin.from("assets").select("id", { count: "exact", head: true }).in("id", withDrive.map((a) => a.id)).not("drive_missing_at", "is", null)
    : { count: 0 };

  // 2) ไฟล์ใหม่ในโฟลเดอร์
  const folder = await resolveAlbumDriveFolder(admin, id, false);
  if (!folder.ok || !folder.folderId || (album as { trashed_at: string | null }).trashed_at) {
    return NextResponse.json({ data: { added: 0, remaining: 0, missing: missingNow ?? 0, restored: check.restored, skipped: 0, reason: folder.ok ? null : folder.reason }, error: null });
  }
  let listed: Awaited<ReturnType<typeof driveListFiles>>;
  try { listed = await driveListFiles(folder.folderId); }
  catch (e) { return NextResponse.json({ error: `อ่านโฟลเดอร์ Drive ไม่ได้: ${(e as Error).message}` }, { status: 502 }); }
  const media = listed.filter((f) => isMedia(f.mimeType));
  const skipped = listed.length - media.length;
  const ids = media.map((f) => f.id);
  const { data: known } = ids.length ? await admin.from("assets").select("drive_file_id").in("drive_file_id", ids) : { data: [] as unknown[] };
  const knownIds = new Set(((known ?? []) as { drive_file_id: string }[]).map((k) => k.drive_file_id));
  const fresh = media.filter((f) => !knownIds.has(f.id));
  const batch = fresh.slice(0, BATCH);

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const brandId = (album as { brand_id: string | null }).brand_id;
  let added = 0;
  const failed: string[] = [];
  for (const f of batch) {
    try {
      let r2Key = `drive:${f.id}`, width: number | null = null, height: number | null = null, phash: string | null = null, phashColor: string | null = null;
      if (f.mimeType.startsWith("image/") && (f.size ?? 0) <= PREVIEW_MAX_BYTES) {
        const dl = await driveDownloadFile(f.id);
        const pv = dl ? await makePreview(dl.bytes) : null;
        if (pv) {
          r2Key = `content-albums/drive-sync/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          await r2PutObject(r2Key, pv.buf, "image/jpeg");
          width = pv.width; height = pv.height;
          const look = await analyzeImageBuffer(pv.buf);
          phash = look?.look?.phash ?? null; phashColor = look?.look?.color ?? null;
        }
      }
      const { data: ins, error } = await admin.from("assets").insert({
        title: f.name.replace(/\.[^.]+$/, "").trim() || f.name, file_name: f.name, r2_key: r2Key,
        asset_type: detectAssetType(f.mimeType, f.name), content_type: f.mimeType || null, ext: extOf(f.name) || null, size_bytes: f.size ?? null,
        width, height, checksum: f.sha256 ?? null, phash, phash_color: phashColor,
        status: "active", source: "content", brand_id: brandId, drive_file_id: f.id, uploaded_by: user?.email ?? user?.id ?? null,
      }).select("id").single();
      if (error || !ins) { failed.push(f.name); continue; }
      await admin.from("asset_collection_map").upsert({ asset_id: ins.id, collection_id: id }, { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
      added++;
    } catch { failed.push(f.name); }
  }

  if (added || check.missing || check.restored) {
    await writeAudit(admin, { action: "drive_sync", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { added, failed, missing_found: check.missing, restored: check.restored } });
  }
  return NextResponse.json({ data: { added, remaining: Math.max(0, fresh.length - batch.length), missing: missingNow ?? 0, restored: check.restored, skipped, failed }, error: null });
}
