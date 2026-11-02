/**
 * /api/cron/social-publish — ตัวเดินคิวโพสต์โซเชียล (pg_cron เรียกทุก 5 นาที เฉพาะตอนมีคิวถึงเวลา)
 *
 * เรียกได้ 3 ทาง:
 *   1. pg_cron + pg_net: header x-cron-token = โทเคนใน Supabase Vault (ชื่อ social_publish_cron) — ตรวจผ่าน RPC erp_cron_token_ok
 *   2. CRON_SECRET (Authorization: Bearer <CRON_SECRET>) ถ้าตั้ง env ไว้
 *   3. คนที่มีสิทธิ์ tasks.edit เช็กเอง → ดูอย่างเดียว (dry run: บอกว่ามีคิวถึงเวลากี่อัน ไม่ยิง)
 * งานจริงอยู่ที่ lib/social-publish/queue (runDueJobs)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { runDueJobs } from "@/lib/social-publish/queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;   // งานละหลายวินาที (อัปวิดีโอ/รอ IG) · ทีละ ≤5 งาน

async function authorized(request: NextRequest): Promise<"cron" | "dry" | null> {
  const admin = supabaseAdmin();
  const token = request.headers.get("x-cron-token");
  if (token) {
    const { data } = await admin.rpc("erp_cron_token_ok", { p_name: "social_publish_cron", p_token: token });
    if (data === true) return "cron";
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return "cron";
  const denied = await guardApi(request, "tasks.edit");
  return denied ? null : "dry";
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const mode = await authorized(request);
  if (!mode) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();
  if (mode === "dry") {
    const { count } = await admin.from("social_publish_jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lte("run_at", new Date().toISOString());
    const { count: processing } = await admin.from("social_publish_jobs").select("id", { count: "exact", head: true }).eq("status", "processing");
    return NextResponse.json({ ok: true, dry: true, due: count ?? 0, processing: processing ?? 0 });
  }
  try {
    const r = await runDueJobs(admin, 5);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
