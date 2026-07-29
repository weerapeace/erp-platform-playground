/**
 * /api/ai/usage — สรุปการใช้ AI เขียนแคปชั่น (จำนวนครั้ง / รูป / ค่าใช้จ่ายประมาณ)
 *   GET ?months=3 → { months: [{ month, calls, images, captions, est_thb }], by_user: [...], total }
 *
 * อ่านจาก audit_logs (action = ai_caption | ai_caption_all) — ไม่มีตารางใหม่
 * ค่าใช้จ่ายเป็น "ประมาณ" จากราคา gpt-4o-mini: in $0.15/1M, out $0.60/1M
 *   รูป 1 ใบ (detail low) ≈ 2,833 token · ข้อความเข้า ≈ 600 · ข้อความออก ≈ 350/แคปชั่น
 * สิทธิ์: ai.caption (คนที่ใช้ได้ควรเห็นว่าใช้ไปเท่าไหร่) — ตัวเลขเป็นภาพรวมทั้งระบบ
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const USD_THB = Number(process.env.USD_THB_RATE || 36);
const IMG_TOKENS = 2833, TEXT_IN = 600, OUT_PER_CAPTION = 350;
const costThb = (images: number, captions: number, calls: number) =>
  ((images * IMG_TOKENS + calls * TEXT_IN) * 0.15 / 1e6 + captions * OUT_PER_CAPTION * 0.6 / 1e6) * USD_THB;

type Row = { action: string; created_at: string; actor_name: string | null; metadata: Record<string, unknown> | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")) && !(await apiCan(request, "tasks.approve")))
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดูการใช้ AI (ai.caption)" }, { status: 401 });

  const months = Math.min(12, Math.max(1, Number(new URL(request.url).searchParams.get("months") || 3)));
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (months - 1), 1)).toISOString();

  const { data, error } = await supabaseAdmin().from("audit_logs")
    .select("action, created_at, actor_name, metadata")
    .in("action", ["ai_caption", "ai_caption_all"]).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const bucket = new Map<string, { month: string; calls: number; images: number; captions: number }>();
  const byUser = new Map<string, { name: string; calls: number; captions: number; images: number }>();
  for (const r of rows) {
    const m = (r.created_at ?? "").slice(0, 7);
    const md = r.metadata ?? {};
    const calls = Number(md.calls ?? 1);
    const images = Number(md.images ?? 0);
    const captions = Array.isArray(md.platforms) ? (md.platforms as unknown[]).length : 1;
    const b = bucket.get(m) ?? { month: m, calls: 0, images: 0, captions: 0 };
    b.calls += calls; b.images += images; b.captions += captions; bucket.set(m, b);
    const who = (r.actor_name ?? "—").toString();
    const u = byUser.get(who) ?? { name: who, calls: 0, captions: 0, images: 0 };
    u.calls += calls; u.captions += captions; u.images += images; byUser.set(who, u);
  }

  const monthsOut = [...bucket.values()].sort((a, b) => b.month.localeCompare(a.month))
    .map((b) => ({ ...b, est_thb: Math.round(costThb(b.images, b.captions, b.calls) * 100) / 100 }));
  const total = monthsOut.reduce((a, b) => ({
    calls: a.calls + b.calls, images: a.images + b.images, captions: a.captions + b.captions,
    est_thb: Math.round((a.est_thb + b.est_thb) * 100) / 100,
  }), { calls: 0, images: 0, captions: 0, est_thb: 0 });

  return NextResponse.json({
    months: monthsOut,
    by_user: [...byUser.values()].sort((a, b) => b.captions - a.captions).slice(0, 10)
      .map((u) => ({ ...u, est_thb: Math.round(costThb(u.images, u.captions, u.calls) * 100) / 100 })),
    total, rate_thb: USD_THB, error: null,
  });
}
