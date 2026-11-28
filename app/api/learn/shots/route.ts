/**
 * 🎬 Video Shot — คลังช็อต (ศูนย์เรียนรู้)
 * GET  /api/learn/shots           → ช็อต + ชุดช็อต ที่ใช้งานอยู่ (learn.view)
 * GET  /api/learn/shots?trash=1   → ช็อต + ชุดช็อต ในถังขยะ (learn.manage)
 * POST /api/learn/shots           → เพิ่มช็อต (learn.manage) · ลิงก์สั้นย่อให้ · ไม่ใส่ชื่อ/ภาพปก = ดึงจากคลิปให้
 * ไม่ดาวน์โหลดไฟล์วิดีโอ — เก็บแค่ลิงก์ + ช่วงเวลา · audit ทุกการเขียน · กติกา lib/video-shot
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { LEARN_MANAGE, LEARN_VIEW } from "@/lib/learn";
import { cleanShotBody, SHOT_COLS, SHOT_LIST_COLS, shotDigest, type VideoShotList } from "@/lib/video-shot";
import { fetchShotMeta, resolveShotLink, rowToShot } from "@/lib/video-shot-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_VIEW); if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const canManage = await apiCan(request, LEARN_MANAGE);
  if (trash && !canManage) return bad("ไม่มีสิทธิ์ดูถังขยะช็อต", 403);
  const admin = supabaseAdmin();
  const [s, l] = await Promise.all([
    admin.from("erp_video_shots").select(SHOT_COLS).eq("is_active", !trash).order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    admin.from("erp_video_shot_lists").select(SHOT_LIST_COLS).eq("is_active", !trash).order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);
  if (s.error || l.error) return bad("โหลดคลังช็อตไม่สำเร็จ กรุณาลองใหม่", 500);
  return NextResponse.json({
    data: { shots: (s.data ?? []).map((r) => rowToShot(r as unknown as Record<string, unknown>)), lists: (l.data ?? []) as unknown as VideoShotList[] },
    canManage, error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const link = await resolveShotLink(String(body.url ?? ""));
  if (!link) return bad("ลิงก์นี้ยังไม่รองรับ — ใช้ลิงก์ YouTube / TikTok / Pinterest / Instagram");
  const needMeta = !String(body.title ?? "").trim() || !String(body.thumb_url ?? "").trim();
  const meta = needMeta && link.id ? await fetchShotMeta(link).catch(() => ({ title: null, thumb_url: null })) : { title: null, thumb_url: null };
  const v = cleanShotBody({
    ...body, url: link.url,
    title: String(body.title ?? "").trim() || meta.title || "ช็อตไม่มีชื่อ",
    thumb_url: String(body.thumb_url ?? "").trim() || meta.thumb_url,
  }, false);
  if (!v.ok) return bad(v.error);

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  let mq = admin.from("erp_video_shots").select("sort_order").eq("is_active", true);
  mq = v.patch.list_id ? mq.eq("list_id", v.patch.list_id) : mq.is("list_id", null);
  const { data: mx } = await mq.order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("erp_video_shots").insert({
    ...v.patch, is_active: true,
    sort_order: v.patch.sort_order ?? (((mx?.sort_order as number | undefined) ?? 0) + 1),
    created_by: actor.name, updated_by: actor.name,
  }).select(SHOT_COLS).single();
  if (error || !data) return bad("เพิ่มช็อตไม่สำเร็จ กรุณาลองใหม่", 500);
  const shot = rowToShot(data as unknown as Record<string, unknown>);
  await writeAuditFor(request, admin, {
    action: "create", entityType: "learn_shot", entityId: shot.id,
    metadata: { name: shot.title, summary: shotDigest(shot), url: shot.url, list_id: shot.list_id },
  });
  return NextResponse.json({ data: shot, error: null });
}
