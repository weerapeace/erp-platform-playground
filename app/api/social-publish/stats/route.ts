/**
 * ภาพรวมการโพสต์ต่อแพลตฟอร์มของแบรนด์ — GET /api/social-publish/stats?brand_id=
 * → { stats: { [platform]: { posted30, queued, failed, next_run_at, last_posted_at } } }
 *   posted30 = คอนเทนต์ที่ติ๊ก/ระบบตั้งว่า "โพสต์แล้ว" ซึ่งกำหนดลงภายใน 30 วันที่ผ่านมา (รวมแพลตฟอร์มที่โพสต์มือ)
 *   queued   = คิวที่รอ/กำลังโพสต์ (social_publish_jobs) · next_run_at = คิวถัดไป
 *   failed   = คอนเทนต์ที่ตอนนี้สถานะ "ล้ม" (ยังไม่ได้แก้)
 *   last_posted_at = ครั้งล่าสุดที่โพสต์ (เวลาจริงจากคิว · ไม่มีคิว = วันที่กำหนดลงของคอนเทนต์)
 * ⚠️ scheduled_at ของคอนเทนต์ = เวลาไทยเก็บแบบ naive (14:00+00 = 14:00 ไทย) → แปลงเป็นเวลาจริงก่อนเทียบ/ส่งออก
 * ใช้ที่หน้า /admin/platform-accounts (ส่วน "ภาพรวม 30 วัน")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Stat = { posted30: number; queued: number; failed: number; next_run_at: string | null; last_posted_at: string | null };
const TH_MS = 7 * 3600_000;
const DAY_MS = 86400_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!brandId) return NextResponse.json({ stats: {}, error: null });
  const admin = supabaseAdmin();
  const now = Date.now();

  const [contents, jobs] = await Promise.all([
    admin.from("erp_creative_content").select("post_status, scheduled_at").eq("brand_id", brandId).not("post_status", "is", null).not("is_active", "is", false).limit(5000),
    admin.from("social_publish_jobs")
      .select("platform, status, run_at, posted_at, content:erp_creative_content!content_id!inner(brand_id)")
      .eq("content.brand_id", brandId)
      .or(`status.in.(queued,running,processing),and(status.eq.posted,posted_at.gte.${new Date(now - 90 * DAY_MS).toISOString()})`)
      .limit(2000),
  ]);
  if (contents.error || jobs.error) return NextResponse.json({ stats: {}, error: "โหลดภาพรวมไม่สำเร็จ" }, { status: 500 });

  const stats: Record<string, Stat> = {};
  const of = (p: string): Stat => (stats[p] ??= { posted30: 0, queued: 0, failed: 0, next_run_at: null, last_posted_at: null });
  const later = (a: string | null, b: string) => (!a || b > a ? b : a);

  for (const c of (contents.data ?? []) as { post_status: Record<string, string> | null; scheduled_at: string | null }[]) {
    const real = c.scheduled_at ? new Date(c.scheduled_at).getTime() - TH_MS : NaN;   // naive ไทย → เวลาจริง
    for (const [p, st] of Object.entries(c.post_status ?? {})) {
      if (st === "failed") of(p).failed++;
      if (st !== "posted") continue;
      const s = of(p);
      if (Number.isFinite(real) && real >= now - 30 * DAY_MS) s.posted30++;
      if (Number.isFinite(real) && real <= now) s.last_posted_at = later(s.last_posted_at, new Date(real).toISOString());
    }
  }
  for (const j of (jobs.data ?? []) as { platform: string; status: string; run_at: string; posted_at: string | null }[]) {
    const s = of(j.platform);
    if (j.status === "posted" && j.posted_at) { s.last_posted_at = later(s.last_posted_at, new Date(j.posted_at).toISOString()); continue; }
    s.queued++;
    const r = new Date(j.run_at).toISOString();
    if (!s.next_run_at || r < s.next_run_at) s.next_run_at = r;
  }
  return NextResponse.json({ stats, error: null });
}
