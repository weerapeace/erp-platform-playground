/**
 * 🎬 อัปโหลดรูป/คลิปของเว็บร้านแบบไฟล์ใหญ่ — POST /api/website/video-upload
 *
 *   { name, type, size, folder? } → { key, url } — url = ลิงก์ PUT ตรงเข้า R2 (หมดอายุ 15 นาที) เบราว์เซอร์ส่งไฟล์เองไม่ผ่าน Vercel
 *   วิดีโอ ≤ 200 MB · รูป JPG/PNG/WebP ≤ 20 MB (lib/media-upload-limits) · folder ต้องอยู่ใน BIG_UPLOAD_FOLDERS
 *   ไฟล์ ≤ 4 MB ให้ใช้ /api/admin/upload ตามเดิม (ไม่ต้องตั้งอะไรเพิ่ม) — ของกลาง lib/media-upload เลือกทางให้เอง
 *   ⚠️ ทางนี้ใช้ได้เมื่อ bucket R2 ตั้ง CORS ให้ ERP PUT ได้ (ดู docs/website-video.md) — ยังไม่ตั้ง = เบราว์เซอร์อัปโหลดไม่ผ่าน
 *   📚 ไฟล์ชื่อ + ขนาดเดียวกันอยู่ในคลังแล้ว → คืน { key เดิม, existing: true } ไม่ต้องอัปซ้ำ
 *   อัปเสร็จแล้วตัวอัปโหลดกลางเรียก /api/assets/register ให้ลงคลัง (ERP ไม่เห็นเนื้อไฟล์ จึงกันซ้ำด้วยชื่อ+ขนาด)
 *
 * ของกลาง: guardApi(files.upload) · writeAudit · lib/r2 (r2PresignPut) · lib/media-upload-limits
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { r2PresignPut } from "@/lib/r2";
import { BIG_UPLOAD_EXT, BIG_UPLOAD_FOLDERS, fileMb, uploadMaxBytes } from "@/lib/media-upload-limits";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { name?: unknown; type?: unknown; size?: unknown; folder?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const type = String(body.type ?? "");
  const size = Number(body.size ?? 0);
  const name = String(body.name ?? "").slice(0, 120);
  const ext = BIG_UPLOAD_EXT[type];
  if (!ext) return NextResponse.json({ error: "ไฟล์ใหญ่รับเฉพาะวิดีโอ MP4 / WebM / MOV หรือรูป JPG / PNG / WebP" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "ไม่รู้ขนาดไฟล์" }, { status: 400 });
  const max = uploadMaxBytes(type);
  const isVideo = type.startsWith("video/");
  if (size > max)
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${fileMb(max)} (${fileMb(size)}) — ${isVideo ? "คลิปยาวให้ใช้ลิงก์ YouTube/Vimeo" : "ย่อรูปก่อนอัปโหลด"}` }, { status: 400 });
  const folder = BIG_UPLOAD_FOLDERS.includes(String(body.folder)) ? String(body.folder) : isVideo ? "storefront-videos" : "storefront-images";

  // 📚 มีไฟล์นี้ในคลังแล้ว (ชื่อ + ขนาดเท่ากันเป๊ะ) → ใช้ไฟล์เดิม ไม่ต้องส่งซ้ำ
  if (name) {
    const { data: dup } = await supabaseAdmin().from("assets").select("id, r2_key").eq("status", "active").eq("file_name", name).eq("size_bytes", size).limit(1).maybeSingle();
    if (dup?.r2_key) return NextResponse.json({ key: dup.r2_key, existing: true, assetId: dup.id });
  }

  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  const url = await r2PresignPut(key, 900);
  if (!url) return NextResponse.json({ error: "ระบบตอนนี้อัปโหลดไฟล์ใหญ่ไม่ได้ (ยังไม่ได้ตั้งกุญแจ R2) — ใช้ไฟล์ ≤ 4 MB หรือลิงก์ YouTube" }, { status: 503 });

  await writeAudit(supabaseAdmin(), {
    action: "create",
    entityType: isVideo ? "storefront_video" : "storefront_image",
    // entity_id เป็น uuid → key ของไฟล์ต้องอยู่ใน metadata (เดิมใส่ entityId แล้วหายเงียบ = ตามไฟล์ย้อนหลังไม่ได้)
    entityId: null,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { r2_key: key, name, type, size, folder, via: "presigned-put" },
  });
  return NextResponse.json({ key, url, maxBytes: max });
}
