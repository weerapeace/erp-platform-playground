/**
 * 🎬 อัปโหลดคลิปของเว็บร้านแบบไฟล์ใหญ่ — POST /api/website/video-upload
 *
 *   { name, type, size } → { key, url } — url = ลิงก์ PUT ตรงเข้า R2 (หมดอายุ 15 นาที) เบราว์เซอร์ส่งไฟล์เองไม่ผ่าน Vercel
 *   ไฟล์ ≤ 4 MB ให้ใช้ /api/admin/upload ตามเดิม (ไม่ต้องตั้งอะไรเพิ่ม) — ตัวช่องอัปโหลดคลิปเลือกทางให้เอง
 *   ⚠️ ทางนี้ใช้ได้เมื่อ bucket R2 ตั้ง CORS ให้ ERP PUT ได้ (ดู docs/website-video.md) — ยังไม่ตั้ง = เบราว์เซอร์อัปโหลดไม่ผ่าน
 *
 * ของกลาง: guardApi(files.upload) · writeAudit · lib/r2 (r2PresignPut)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { r2PresignPut } from "@/lib/r2";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
/** เพดานไฟล์ใหญ่ (คลิปยาวกว่านี้ใช้ลิงก์ YouTube/Vimeo) */
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { name?: unknown; type?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const type = String(body.type ?? "");
  const size = Number(body.size ?? 0);
  const name = String(body.name ?? "").slice(0, 120);
  const ext = EXT[type];
  if (!ext) return NextResponse.json({ error: "รับเฉพาะไฟล์วิดีโอ MP4 / WebM / MOV" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "ไม่รู้ขนาดไฟล์" }, { status: 400 });
  if (size > VIDEO_MAX_BYTES)
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${VIDEO_MAX_BYTES / 1024 / 1024} MB (${(size / 1024 / 1024).toFixed(0)} MB) — คลิปยาวให้ใช้ลิงก์ YouTube/Vimeo` }, { status: 400 });

  const key = `storefront-videos/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  const url = await r2PresignPut(key, 900);
  if (!url) return NextResponse.json({ error: "ระบบตอนนี้อัปโหลดไฟล์ใหญ่ไม่ได้ (ยังไม่ได้ตั้งกุญแจ R2) — ใช้ไฟล์ ≤ 4 MB หรือลิงก์ YouTube" }, { status: 503 });

  await writeAudit(supabaseAdmin(), {
    action: "create",
    entityType: "storefront_video",
    entityId: key,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { name, type, size, via: "presigned-put" },
  });
  return NextResponse.json({ key, url, maxBytes: VIDEO_MAX_BYTES });
}
