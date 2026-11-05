/**
 * ไฟล์ในอัลบั้ม Contents
 * POST   /api/content-albums/[id]/files
 *        body = { drive_file_id, preview_key?, file_name, mime, size, width?, height?, duration_sec?, checksum?, phash?, phash_color? }
 *               → ลงทะเบียนไฟล์ที่เพิ่งอัปขึ้น Drive (assets source "content") แล้วใส่อัลบั้ม
 *        body = { asset_id } → ใส่ไฟล์ที่มีในคลังอยู่แล้วเข้าอัลบั้ม (เลือก "ใช้รูปเดิม" ตอนเจอรูปซ้ำ)
 * PATCH  /api/content-albums/[id]/files  body = { asset_id, preview_key } → เปลี่ยนปกคลิป (รูปย่อใน R2 ที่อัปจาก /api/admin/upload folder content-albums) ของวิดีโอในอัลบั้ม
 * DELETE /api/content-albums/[id]/files?asset_id=&drive=1
 *        → เอาออกจากอัลบั้ม · ไฟล์ของอัลบั้มเอง (source content ไม่อยู่ที่อื่น) ไปถังขยะคลัง · drive=1 = ต้นฉบับใน Drive ไปถังขยะด้วย (กู้คืนได้ใน Drive)
 *
 * สิทธิ์: เพิ่ม/ตั้งปกคลิป = assets.upload · เอาออก/ลบ = assets.delete · audit content_album file_add / file_cover / file_remove
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { driveFileMeta, driveTrashFile } from "@/lib/google-drive";
import { detectAssetType, extOf } from "@/lib/assets";
import { isUuid } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const hex = (v: unknown, len: number): string | null => (typeof v === "string" && new RegExp(`^[0-9a-f]{${len}}$`, "i").test(v) ? v.toLowerCase() : null);

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { data: album } = await admin.from("content_albums").select("id, brand_id, trashed_at").eq("id", id).maybeSingle();
  if (!album) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  if ((album as { trashed_at: string | null }).trashed_at) return NextResponse.json({ error: "อัลบั้มนี้อยู่ในถังขยะ — กู้คืนก่อนเพิ่มไฟล์" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  // ใช้ไฟล์เดิมในคลัง
  if (body.asset_id !== undefined) {
    if (!isUuid(body.asset_id)) return NextResponse.json({ error: "ไฟล์ไม่ถูกต้อง" }, { status: 400 });
    const { data: a } = await admin.from("assets").select("id, file_name, status").eq("id", body.asset_id).maybeSingle();
    if (!a || (a as { status: string }).status !== "active") return NextResponse.json({ error: "ไม่พบไฟล์ในคลัง" }, { status: 404 });
    const { error } = await admin.from("asset_collection_map").upsert({ asset_id: body.asset_id, collection_id: id }, { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: `เพิ่มไฟล์ไม่สำเร็จ: ${error.message}` }, { status: 500 });
    await writeAudit(admin, { action: "file_add", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { asset_id: body.asset_id, reused: true, file_name: (a as { file_name: string }).file_name } });
    return NextResponse.json({ data: { asset_id: body.asset_id, reused: true }, error: null });
  }

  const fileId = String(body.drive_file_id ?? "");
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return NextResponse.json({ error: "drive_file_id ไม่ถูกต้อง" }, { status: 400 });
  const meta = await driveFileMeta(fileId);
  if (!meta) return NextResponse.json({ error: "ไม่พบไฟล์ใน Drive (อัปไม่ครบ หรือถูกลบไปแล้ว)" }, { status: 404 });
  // รูปย่อ/ภาพปก ต้องเป็นไฟล์ที่เพิ่งอัปผ่านตัวอัปกลาง (โฟลเดอร์ content-albums) — กันชี้ไฟล์คนอื่น
  const previewKey = typeof body.preview_key === "string" && /^content-albums\/[\w./-]+$/.test(body.preview_key) ? body.preview_key : null;
  const fileName = String(body.file_name ?? "").trim() || meta.name || "file";
  const mime = (typeof body.mime === "string" && body.mime) || meta.mimeType || null;
  const { data: dup } = await admin.from("assets").select("id").eq("drive_file_id", fileId).eq("status", "active").maybeSingle();
  let assetId = (dup as { id: string } | null)?.id ?? null;
  if (!assetId) {
    const { data: ins, error } = await admin.from("assets").insert({
      title: fileName.replace(/\.[^.]+$/, "").trim() || fileName, file_name: fileName,
      r2_key: previewKey ?? `drive:${fileId}`, asset_type: detectAssetType(mime, fileName),
      content_type: mime, ext: extOf(fileName) || null, size_bytes: num(body.size) ?? meta.size ?? null,
      width: num(body.width), height: num(body.height), duration_sec: num(body.duration_sec),
      checksum: hex(body.checksum, 64), phash: hex(body.phash, 32), phash_color: hex(body.phash_color, 1536),
      status: "active", source: "content", brand_id: (album as { brand_id: string | null }).brand_id,
      drive_file_id: fileId, uploaded_by: user?.email ?? user?.id ?? null,
    }).select("id").single();
    if (error || !ins) return NextResponse.json({ error: `บันทึกไฟล์ไม่สำเร็จ: ${error?.message ?? ""}` }, { status: 500 });
    assetId = ins.id as string;
  }
  const { error: mapErr } = await admin.from("asset_collection_map").upsert({ asset_id: assetId, collection_id: id }, { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
  if (mapErr) return NextResponse.json({ error: `ใส่ไฟล์เข้าอัลบั้มไม่สำเร็จ: ${mapErr.message}` }, { status: 500 });
  await writeAudit(admin, { action: "file_add", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { asset_id: assetId, drive_file_id: fileId, file_name: fileName, size: meta.size ?? null } });
  return NextResponse.json({ data: { asset_id: assetId, reused: false }, error: null });
}

const COVER_KEY = /^content-albums\/[0-9a-f-]{36}\/[\w.-]+\.(jpe?g|png|webp)$/i;

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  let body: { asset_id?: unknown; preview_key?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const assetId = body.asset_id;
  const key = typeof body.preview_key === "string" ? body.preview_key.trim() : "";
  if (!isUuid(id) || !isUuid(assetId)) return NextResponse.json({ error: "ต้องระบุไฟล์" }, { status: 400 });
  if (!COVER_KEY.test(key) || key.includes("..")) return NextResponse.json({ error: "รูปปกไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  const [{ data: inAlbum }, { data: a }] = await Promise.all([
    admin.from("asset_collection_map").select("asset_id").eq("collection_id", id).eq("asset_id", assetId).maybeSingle(),
    admin.from("assets").select("id, file_name, r2_key, asset_type, status").eq("id", assetId).maybeSingle(),
  ]);
  const asset = a as { id: string; file_name: string; r2_key: string; asset_type: string; status: string } | null;
  if (!inAlbum || !asset || asset.status !== "active") return NextResponse.json({ error: "ไม่พบไฟล์ในอัลบั้มนี้" }, { status: 404 });
  if (asset.asset_type !== "video") return NextResponse.json({ error: "ตั้งปกได้เฉพาะคลิปวิดีโอ" }, { status: 400 });
  const { error } = await admin.from("assets").update({ r2_key: key }).eq("id", assetId);
  if (error) return NextResponse.json({ error: `ตั้งปกไม่สำเร็จ: ${error.message}` }, { status: 500 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "file_cover", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { asset_id: assetId, file_name: asset.file_name, old_key: asset.r2_key, new_key: key } });
  return NextResponse.json({ data: { asset_id: assetId, r2_key: key }, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.delete"); if (denied) return denied;
  const { id } = await params;
  const sp = new URL(request.url).searchParams;
  const assetId = sp.get("asset_id");
  if (!isUuid(id) || !isUuid(assetId)) return NextResponse.json({ error: "ต้องระบุไฟล์" }, { status: 400 });
  const trashDrive = sp.get("drive") === "1";
  const admin = supabaseAdmin();
  const [{ data: a }, { data: others }, { data: uses }] = await Promise.all([
    admin.from("assets").select("id, file_name, source, drive_file_id, status").eq("id", assetId).maybeSingle(),
    admin.from("asset_collection_map").select("collection_id").eq("asset_id", assetId).neq("collection_id", id),
    admin.from("asset_usages").select("record_label").eq("asset_id", assetId),
  ]);
  if (!a) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  const asset = a as { id: string; file_name: string; source: string; drive_file_id: string | null; status: string };
  const usedBy = ((uses ?? []) as { record_label: string | null }[]).map((u) => u.record_label).filter(Boolean) as string[];
  // ไฟล์ของอัลบั้มนี้เอง = มาจากการอัปในอัลบั้ม และไม่ได้อยู่อัลบั้มอื่น · ไม่งั้นแค่เอาออกจากอัลบั้ม (ไฟล์เดิมยังใช้ที่อื่น)
  const ownFile = asset.source === "content" && !(others ?? []).length;
  if (trashDrive && (uses ?? []).length) {
    return NextResponse.json({ error: `ไฟล์นี้ใช้อยู่ใน ${usedBy.slice(0, 3).join(", ") || "โพสต์"} — เอาออกจากอัลบั้มได้ แต่ลบใน Drive ไม่ได้ (โพสต์จะเปิดรูปไม่ได้)` }, { status: 400 });
  }

  const { error } = await admin.from("asset_collection_map").delete().eq("asset_id", assetId).eq("collection_id", id);
  if (error) return NextResponse.json({ error: `เอาออกไม่สำเร็จ: ${error.message}` }, { status: 500 });
  // ไม่ให้ค้างเป็น "รูปที่เลือก" / ปกอัลบั้ม
  const { data: al } = await admin.from("content_albums").select("picked_asset_ids").eq("id", id).maybeSingle();
  const picked = ((al as { picked_asset_ids: string[] | null } | null)?.picked_asset_ids ?? []).filter((x) => x !== assetId);
  await Promise.all([
    admin.from("content_albums").update({ picked_asset_ids: picked, updated_at: new Date().toISOString() }).eq("id", id),
    admin.from("asset_collections").update({ cover_asset_id: null }).eq("id", id).eq("cover_asset_id", assetId),
  ]);
  if (ownFile && !(uses ?? []).length) await admin.from("assets").update({ status: "trashed", trashed_at: new Date().toISOString() }).eq("id", assetId);
  const driveTrashed = trashDrive && ownFile && asset.drive_file_id ? await driveTrashFile(asset.drive_file_id).catch(() => false) : false;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "file_remove", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { asset_id: assetId, file_name: asset.file_name, library_trashed: ownFile && !(uses ?? []).length, drive_file_id: asset.drive_file_id, drive_trashed: driveTrashed } });
  return NextResponse.json({ data: { asset_id: assetId, drive_trashed: driveTrashed }, error: null });
}
