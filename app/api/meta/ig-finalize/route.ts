/**
 * ตามเช็กสถานะวิดีโอ Instagram (Reels) แล้วเผยแพร่เมื่อพร้อม — /api/meta/ig-finalize
 * POST { content_id, creation_id }
 *  - IN_PROGRESS → { processing:true }   (client เรียกซ้ำเรื่อย ๆ จนพร้อม)
 *  - FINISHED    → เผยแพร่ (media_publish) → บันทึกสถานะ posted → { url }
 *  - ERROR       → { error }
 * แยกจาก publish เพราะ IG ประมวลผลวิดีโอนาน (คำขอเดียวรอไม่ได้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { igContainerStatus, igPublish } from "@/lib/meta-graph";
import { getPlatformId, loadConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { content_id?: string; creation_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  const creationId = (body.creation_id ?? "").trim();
  if (!contentId || !creationId) return NextResponse.json({ error: "ต้องมี content_id + creation_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: content } = await admin.from("erp_creative_content").select("id, brand_id, posted_links, post_status").eq("id", contentId).maybeSingle();
  if (!content) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });
  const c = content as { brand_id: string | null; posted_links: Record<string, string> | null; post_status: Record<string, string> | null };
  if (!c.brand_id) return NextResponse.json({ error: "คอนเทนต์ไม่มีแบรนด์" }, { status: 400 });

  const fbId = await getPlatformId(admin, "facebook");
  if (!fbId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม facebook" }, { status: 400 });
  const conn = await loadConn(admin, c.brand_id, fbId);
  if (!conn?.token || !conn.meta.ig_user_id) return NextResponse.json({ error: "ยังไม่ได้เชื่อมต่อ Instagram" }, { status: 400 });

  let status: string;
  try { status = await igContainerStatus(conn.token, creationId); }
  catch (e) { return NextResponse.json({ error: `เช็กสถานะไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  if (status === "ERROR") return NextResponse.json({ error: "Instagram ประมวลผลวิดีโอไม่สำเร็จ (ตรวจสเปกวิดีโอ: MP4, 3วิ–15นาที)" }, { status: 400 });
  if (status !== "FINISHED") return NextResponse.json({ ok: true, processing: true, error: null });

  // พร้อมแล้ว → เผยแพร่
  let posted: { url: string; id: string };
  try { posted = await igPublish(conn.meta.ig_user_id, conn.token, creationId); }
  catch (e) { return NextResponse.json({ error: `Instagram เผยแพร่ไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  const postedLinks = { ...(c.posted_links ?? {}), instagram: posted.url };
  const postStatus = { ...(c.post_status ?? {}), instagram: "posted" };
  await admin.from("erp_creative_content").update({ posted_links: postedLinks, post_status: postStatus, updated_at: new Date().toISOString() }).eq("id", contentId);
  await writeAudit(admin, { action: "update", entityType: "creative_content", entityId: contentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { published_to: "instagram", reel: true, url: posted.url } });

  return NextResponse.json({ ok: true, url: posted.url, error: null });
}
