/**
 * โพสต์คอนเทนต์ขึ้น Facebook / Instagram จริง — /api/meta/publish
 * POST { content_id, platform:'facebook'|'instagram', caption_text, media:[{key,type}], scheduled_time }
 *  - Facebook: รูป(อัลบั้ม) / วิดีโอ · ตั้งเวลาได้ (FB จัดคิว)
 *  - Instagram: รูป(เดี่ยว/อัลบั้ม) เผยแพร่เลย · วิดีโอ Reels = สร้าง container แล้วคืน creation_id (ไปตามเช็กที่ ig-finalize) · ตั้งเวลาไม่ได้
 * caption/media ส่งมาจากป๊อปยืนยัน (ตรงกับที่ผู้ใช้เห็น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fbPublish, fbPublishVideo, igPublishImages, igCreateReels } from "@/lib/meta-graph";
import { baseUrl, getPlatformId, loadConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // เผื่อ IG รอ container รูปพร้อม

type Media = { key: string; type: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { content_id?: string; platform?: string; caption_text?: string; media?: Media[]; image_keys?: string[]; scheduled_time?: number; format?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  const platform = (body.platform ?? "").trim();
  const caption = (body.caption_text ?? "").trim();
  const scheduledTime = Number(body.scheduled_time) || 0;
  // รับ media[{key,type}] · เผื่อ backward-compat กับ image_keys เดิม
  let media: Media[] = Array.isArray(body.media) && body.media.length ? body.media.filter((m) => m?.key) : (body.image_keys ?? []).filter(Boolean).map((k) => ({ key: k, type: "image" }));
  // รูปแบบโพสต์ที่ผู้ใช้เลือก (single/carousel/video/reels/story) — ไม่เลือก = เดาจากสื่อเหมือนเดิม
  const format = (body.format ?? "").trim();
  if (format === "story")
    return NextResponse.json({ error: "Story ยังยิงอัตโนมัติไม่ได้ (Meta ต้องขอสิทธิ์เพิ่ม) — กด “คัดลอกแคปชั่น + เปิดหน้าโพสต์” แล้วลง Story เองก่อน" }, { status: 400 });
  if (format === "single") media = media.filter((m) => m.type !== "video").slice(0, 1);
  if (format === "carousel") media = media.filter((m) => m.type !== "video");
  if (format === "video" || format === "reels") {
    const v = media.find((m) => m.type === "video");
    if (!v) return NextResponse.json({ error: "เลือกรูปแบบเป็นวิดีโอ/Reels แต่ยังไม่ได้เลือกไฟล์วิดีโอ — เลือกวิดีโอในช่อง “รูปสำหรับแพลตฟอร์มนี้” ก่อน" }, { status: 400 });
    media = [v];
  }
  if (media.length === 0) return NextResponse.json({ error: "ยังไม่ได้เลือกรูป/วิดีโอสำหรับโพสต์นี้" }, { status: 400 });
  const url = (k: string) => `${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}`;
  const videoUrls = media.filter((m) => m.type === "video").map((m) => url(m.key));
  const imageUrls = media.filter((m) => m.type !== "video").map((m) => url(m.key));

  if (!contentId) return NextResponse.json({ error: "ต้องมี content_id" }, { status: 400 });
  if (platform !== "facebook" && platform !== "instagram") return NextResponse.json({ error: "แพลตฟอร์มนี้ยังยิงอัตโนมัติไม่ได้" }, { status: 400 });
  if (scheduledTime > 0) {
    if (platform === "instagram") return NextResponse.json({ error: "Instagram ตั้งเวลาโพสต์ไม่ได้ — เลือก 'โพสต์เลย' แทน" }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    if (scheduledTime < now + 10 * 60) return NextResponse.json({ error: "ตั้งเวลาต้องล่วงหน้าอย่างน้อย 10 นาที" }, { status: 400 });
    if (scheduledTime > now + 75 * 24 * 3600) return NextResponse.json({ error: "ตั้งเวลาได้ไม่เกิน 75 วันล่วงหน้า" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: content } = await admin.from("erp_creative_content").select("id, brand_id, posted_links, post_status").eq("id", contentId).maybeSingle();
  if (!content) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });
  const c = content as { brand_id: string | null; posted_links: Record<string, string> | null; post_status: Record<string, string> | null };
  if (!c.brand_id) return NextResponse.json({ error: "คอนเทนต์ยังไม่ได้เลือกแบรนด์ — ต้องมีแบรนด์เพื่อรู้ว่าโพสต์ขึ้นเพจ/บัญชีไหน" }, { status: 400 });

  // ทั้ง FB และ IG ใช้ connection เดียวกัน (แบรนด์ × facebook: page token + ig_user_id)
  const fbId = await getPlatformId(admin, "facebook");
  if (!fbId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม facebook" }, { status: 400 });
  const conn = await loadConn(admin, c.brand_id, fbId);
  if (!conn?.token || conn.meta.stage !== "connected" || !conn.meta.page_id) {
    return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้เชื่อมต่อ Facebook/Instagram — ไปเชื่อมต่อที่ 🏪 จัดการร้าน/บัญชีแพลตฟอร์มก่อน" }, { status: 400 });
  }
  const token = conn.token;

  const markPosted = async (statusVal: string, link: string) => {
    const postedLinks = { ...(c.posted_links ?? {}), [platform]: link };
    const postStatus = { ...(c.post_status ?? {}), [platform]: statusVal };
    await admin.from("erp_creative_content").update({ posted_links: postedLinks, post_status: postStatus, updated_at: new Date().toISOString() }).eq("id", contentId);
    await writeAudit(admin, { action: "update", entityType: "creative_content", entityId: contentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { published_to: platform, page: conn.meta.page_name, url: link } });
  };

  try {
    if (platform === "facebook") {
      const posted = videoUrls.length
        ? await fbPublishVideo(conn.meta.page_id, token, caption, videoUrls[0], scheduledTime || undefined)
        : await fbPublish(conn.meta.page_id, token, caption, imageUrls, scheduledTime || undefined);
      await markPosted(posted.scheduled ? "scheduled" : "posted", posted.url);
      return NextResponse.json({ ok: true, url: posted.url, scheduled: posted.scheduled, error: null });
    }
    // Instagram
    const igId = conn.meta.ig_user_id;
    if (!igId) return NextResponse.json({ error: "เพจที่เชื่อมยังไม่ได้ผูก Instagram (ต้องเป็น IG Business + ผูกกับเพจ)" }, { status: 400 });
    if (videoUrls.length) {
      // Reels: สร้าง container แล้วให้ client ไปตามเช็กที่ /api/meta/ig-finalize
      const creationId = await igCreateReels(igId, token, videoUrls[0], caption);
      return NextResponse.json({ ok: true, processing: true, creation_id: creationId, error: null });
    }
    const posted = await igPublishImages(igId, token, caption, imageUrls);
    await markPosted("posted", posted.url);
    return NextResponse.json({ ok: true, url: posted.url, scheduled: false, error: null });
  } catch (e) {
    return NextResponse.json({ error: `${platform === "instagram" ? "Instagram" : "Facebook"} ปฏิเสธ: ${(e as Error).message}` }, { status: 400 });
  }
}
