/**
 * โพสต์คอนเทนต์ขึ้น Facebook Page จริง — /api/meta/publish
 * POST { content_id, platform:'facebook', caption_text, image_keys[] }
 *  → ใช้ page token ของแบรนด์ (จาก connection) โพสต์รูปแรก + แคปชั่นที่ส่งมา
 *  → บันทึกลิงก์โพสต์ลง posted_links + สถานะ post_status='posted'
 * caption_text/image_keys ส่งมาจากหน้าคอนเทนต์ (ตรงกับที่ผู้ใช้เห็นในพรีวิว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fbPublish } from "@/lib/meta-graph";
import { baseUrl, getPlatformId, loadConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { content_id?: string; platform?: string; caption_text?: string; image_keys?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  const platform = (body.platform ?? "").trim();
  const caption = (body.caption_text ?? "").trim();
  const imageKeys = (body.image_keys ?? []).filter(Boolean);
  if (!contentId) return NextResponse.json({ error: "ต้องมี content_id" }, { status: 400 });
  if (platform !== "facebook") return NextResponse.json({ error: "ตอนนี้ยิงอัตโนมัติได้เฉพาะ Facebook (Instagram รอ Meta อนุมัติ)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: content } = await admin.from("erp_creative_content").select("id, brand_id, posted_links, post_status").eq("id", contentId).maybeSingle();
  if (!content) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });
  const c = content as { brand_id: string | null; posted_links: Record<string, string> | null; post_status: Record<string, string> | null };
  if (!c.brand_id) return NextResponse.json({ error: "คอนเทนต์ยังไม่ได้เลือกแบรนด์ — ต้องมีแบรนด์เพื่อรู้ว่าโพสต์ขึ้นเพจไหน" }, { status: 400 });

  const fbId = await getPlatformId(admin, "facebook");
  if (!fbId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม facebook" }, { status: 400 });
  const conn = await loadConn(admin, c.brand_id, fbId);
  if (!conn?.token || conn.meta.stage !== "connected" || !conn.meta.page_id) {
    return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้เชื่อมต่อ Facebook — ไปเชื่อมต่อที่ 🏪 จัดการร้าน/บัญชีแพลตฟอร์มก่อน" }, { status: 400 });
  }

  const imageUrl = imageKeys[0] ? `${baseUrl()}/api/r2-image?key=${encodeURIComponent(imageKeys[0])}` : undefined;
  let posted: { url: string; id: string };
  try {
    posted = await fbPublish(conn.meta.page_id, conn.token, caption, imageUrl);
  } catch (e) {
    return NextResponse.json({ error: `Facebook ปฏิเสธ: ${(e as Error).message}` }, { status: 400 });
  }

  const postedLinks = { ...(c.posted_links ?? {}), [platform]: posted.url };
  const postStatus = { ...(c.post_status ?? {}), [platform]: "posted" };
  await admin.from("erp_creative_content").update({ posted_links: postedLinks, post_status: postStatus, updated_at: new Date().toISOString() }).eq("id", contentId);
  await writeAudit(admin, { action: "update", entityType: "creative_content", entityId: contentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { published_to: "facebook", page: conn.meta.page_name, url: posted.url } });

  return NextResponse.json({ ok: true, url: posted.url, error: null });
}
