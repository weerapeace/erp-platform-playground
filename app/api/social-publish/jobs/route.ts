/**
 * 📤 คิวโพสต์โซเชียล — /api/social-publish/jobs  (ตัวจริงอยู่ที่ lib/social-publish/queue)
 * GET  ?content_id=<id>   → คิวทั้งหมดของคอนเทนต์ (ล่าสุดก่อน · drawer โชว์สถานะ)
 * GET  (ไม่ส่ง content_id) → ภาพรวม: คิวที่รออยู่ + ล้ม 14 วัน + โพสต์แล้ว 3 วัน (ป๊อปคิวในปฏิทิน)
 * POST { content_id, items:[{ platform, format, caption_text, media:[{key,type}], run_at(ISO) }] } → ตั้งคิว (แทนคิวเดิมของแพลตฟอร์มนั้น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { enqueueJobs, type EnqueueItem } from "@/lib/social-publish/queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECT = "*, content:erp_creative_content!content_id(title, content_no, brand_id, scheduled_at)";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const contentId = new URL(request.url).searchParams.get("content_id")?.trim();
  if (contentId) {
    const { data, error } = await admin.from("social_publish_jobs").select("*").eq("content_id", contentId).order("created_at", { ascending: false }).limit(50);
    if (error) return NextResponse.json({ data: [], error: "โหลดคิวไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ data: data ?? [], error: null });
  }
  const since = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
  const [active, failed, posted] = await Promise.all([
    admin.from("social_publish_jobs").select(SELECT).in("status", ["queued", "running", "processing"]).order("run_at").limit(200),
    admin.from("social_publish_jobs").select(SELECT).eq("status", "failed").gte("updated_at", since(14)).order("updated_at", { ascending: false }).limit(100),
    admin.from("social_publish_jobs").select(SELECT).eq("status", "posted").gte("posted_at", since(3)).order("posted_at", { ascending: false }).limit(100),
  ]);
  const err = active.error ?? failed.error ?? posted.error;
  if (err) return NextResponse.json({ data: [], error: "โหลดคิวไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ data: [...(active.data ?? []), ...(failed.data ?? []), ...(posted.data ?? [])], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { content_id?: string; items?: EnqueueItem[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const contentId = (body.content_id ?? "").trim();
  if (!contentId) return NextResponse.json({ error: "ต้องมี content_id" }, { status: 400 });
  const items = Array.isArray(body.items) ? body.items.slice(0, 10) : [];
  const res = await enqueueJobs(supabaseAdmin(), contentId, items, { id: user?.id ?? null, name: user?.email ?? null });
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ data: res.jobs, error: null });
}
