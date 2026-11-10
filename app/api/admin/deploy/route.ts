/**
 * POST /api/admin/deploy — "ขึ้นเว็บทันที" (ไม่รอรอบ 10 นาที) · สิทธิ์ admin.users · ลง audit
 *   สั่งรัน GitHub Actions deploy-batch.yml (บนสาขา main) → เลื่อนสาขา prod ไปงานล่าสุด → Vercel build เว็บจริง
 *   ต้องมี env GITHUB_DEPLOY_TOKEN (fine-grained token เฉพาะ repo นี้ สิทธิ์ Actions: Read and write)
 *   ยังไม่ตั้ง → 409 { needsSetup, url } ให้หน้าจอเปิดหน้า GitHub ไปกด "Run workflow" เอง
 * สถานะคิว (งานรอขึ้นเว็บ) หน้าจออ่านจาก GitHub API สาธารณะเอง — lib/deploy-queue.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { DEPLOY_REPO, DEPLOY_WORKFLOW, DEPLOY_WORKFLOW_PAGE } from "@/lib/deploy-queue";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const token = (process.env.GITHUB_DEPLOY_TOKEN ?? "").trim();
  if (!token) return NextResponse.json({ needsSetup: true, url: DEPLOY_WORKFLOW_PAGE, error: null }, { status: 409 });

  const res = await fetch(`https://api.github.com/repos/${DEPLOY_REPO}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "erp-deploy-button" },
    body: JSON.stringify({ ref: "main", inputs: { reason: "กดปุ่มขึ้นเว็บทันทีในแอป" } }),
  });
  if (!res.ok) {
    const msg = res.status === 401 || res.status === 403 ? "กุญแจ GitHub ใช้ไม่ได้/หมดอายุ — กดขึ้นเว็บที่หน้า GitHub แทน" : `สั่งขึ้นเว็บไม่สำเร็จ (${res.status})`;
    return NextResponse.json({ needsSetup: res.status === 401 || res.status === 403, url: DEPLOY_WORKFLOW_PAGE, error: msg }, { status: 502 });
  }
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(supabaseAdmin(), { action: "deploy_now", entityType: "system", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { via: "admin_deploy_button" } });
  return NextResponse.json({ ok: true, error: null });
}
