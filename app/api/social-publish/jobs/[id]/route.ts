/**
 * 📤 จัดการคิวโพสต์ 1 รายการ — /api/social-publish/jobs/[id]
 * PATCH { action:"cancel" }                        → ยกเลิก (เฉพาะที่ยังไม่ยิง/ล้ม)
 * PATCH { action:"retry", run_at? }                → ลองใหม่ (คิวที่ล้ม · ไม่ส่งเวลา = รอบถัดไป ≤5 นาที)
 * PATCH { action:"caption", caption_text }         → ใช้แคปชั่นล่าสุด (คิวที่ยังไม่ถึงเวลา)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { cancelJob, retryJob, updateQueuedCaption } from "@/lib/social-publish/queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = { id: user?.id ?? null, name: user?.email ?? null };
  let body: { action?: string; run_at?: string | null; caption_text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const res = body.action === "cancel" ? await cancelJob(admin, id, actor)
    : body.action === "retry" ? await retryJob(admin, id, actor, body.run_at ?? null)
    : body.action === "caption" ? await updateQueuedCaption(admin, id, String(body.caption_text ?? ""), actor)
    : { error: "action ไม่ถูกต้อง" };
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ data: res.job, error: null });
}
