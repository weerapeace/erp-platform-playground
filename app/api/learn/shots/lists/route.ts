/**
 * 🎬 Video Shot — สร้างชุดช็อต (Shot list) (learn.manage)
 * POST /api/learn/shots/lists  { name, description? }
 * (อ่านรายการชุด = GET /api/learn/shots) · audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { LEARN_MANAGE } from "@/lib/learn";
import { cleanShotListBody, SHOT_LIST_COLS, type VideoShotList } from "@/lib/video-shot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = cleanShotListBody(body, false);
  if (!v.ok) return bad(v.error);
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const { data: mx } = await admin.from("erp_video_shot_lists").select("sort_order").eq("is_active", true).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("erp_video_shot_lists").insert({
    ...v.patch, is_active: true,
    sort_order: v.patch.sort_order ?? (((mx?.sort_order as number | undefined) ?? 0) + 1),
    created_by: actor.name, updated_by: actor.name,
  }).select(SHOT_LIST_COLS).single();
  if (error || !data) return bad("สร้างชุดช็อตไม่สำเร็จ กรุณาลองใหม่", 500);
  const list = data as unknown as VideoShotList;
  await writeAuditFor(request, admin, { action: "create", entityType: "learn_shot_list", entityId: list.id, metadata: { name: list.name } });
  return NextResponse.json({ data: list, error: null });
}
