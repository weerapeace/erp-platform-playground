/**
 * โพสต์คอนเทนต์ขึ้น Facebook / Instagram จริง (ปุ่ม "โพสต์เลย") — /api/meta/publish
 * POST { content_id, platform:'facebook'|'instagram', caption_text, media:[{key,type}], scheduled_time, format }
 *  - Facebook: รูป(อัลบั้ม) / วิดีโอ / Reels / Story · scheduled_time = ให้ FB จัดคิวเอง (ทางเดิม)
 *  - Instagram: รูป(เดี่ยว/อัลบั้ม) / Story เผยแพร่เลย · Reels = คืน creation_id (ไปตามเช็กที่ ig-finalize)
 * ตัวยิงจริงอยู่ที่ของกลาง lib/social-publish/meta (คิวโพสต์ตามเวลาใช้ตัวเดียวกัน)
 * caption/media ส่งมาจากป๊อปยืนยัน (ตรงกับที่ผู้ใช้เห็น) · key = r2 key หรือ drive:<fileId> (รูป/วิดีโอบน Google Drive)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { publishMeta } from "@/lib/social-publish/meta";
import type { PostMedia } from "@/lib/social-publish/media";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // เผื่อ IG รอ container รูปพร้อม

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { content_id?: string; platform?: string; caption_text?: string; media?: PostMedia[]; image_keys?: string[]; scheduled_time?: number; format?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  if (!contentId) return NextResponse.json({ error: "ต้องมี content_id" }, { status: 400 });
  const format = (body.format ?? "").trim();
  const scheduledTime = Number(body.scheduled_time) || 0;
  if (format === "story" && scheduledTime > 0)
    return NextResponse.json({ error: "Story ให้ Facebook ตั้งเวลาไม่ได้ — ใช้ “ตั้งคิวให้ระบบโพสต์” แทน" }, { status: 400 });
  if (scheduledTime > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (scheduledTime < now + 10 * 60) return NextResponse.json({ error: "ตั้งเวลาต้องล่วงหน้าอย่างน้อย 10 นาที" }, { status: 400 });
    if (scheduledTime > now + 75 * 24 * 3600) return NextResponse.json({ error: "ตั้งเวลาได้ไม่เกิน 75 วันล่วงหน้า" }, { status: 400 });
  }
  // รับ media[{key,type}] · เผื่อ backward-compat กับ image_keys เดิม
  const media: PostMedia[] = Array.isArray(body.media) && body.media.length ? body.media : (body.image_keys ?? []).filter(Boolean).map((k) => ({ key: k, type: "image" }));

  const res = await publishMeta(supabaseAdmin(), {
    contentId, platform: (body.platform ?? "").trim(), caption: (body.caption_text ?? "").trim(), media, format, scheduledTime,
    actor: { id: user?.id ?? null, name: user?.email ?? null }, via: "manual",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
  if (res.state === "processing") return NextResponse.json({ ok: true, processing: true, creation_id: res.creationId, error: null });
  return NextResponse.json({ ok: true, url: res.url, scheduled: res.state === "scheduled", story: !!res.story, error: null });
}
