/**
 * 🔗 ย่อหลายลิงก์ทีเดียว (ใช้ลิงก์เดิมซ้ำ) — ใช้ตอนประกอบแคปชั่นอัตโนมัติ
 * POST /api/short-links/ensure { urls: string[], label?, source_module?, source_id? } → { data: { [ลิงก์ยาว]: ลิงก์สั้น } }
 * สิทธิ์: short_links.create (ไม่มีสิทธิ์ = คืน {} เงียบ ๆ แคปชั่นใช้ลิงก์ยาวตามเดิม ไม่พัง)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAuditMany } from "@/lib/audit";
import { isShortenableShopUrl } from "@/lib/short-links";
import { ensureShortLinks } from "@/lib/short-links-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await apiCan(request, "short_links.create"))) return NextResponse.json({ data: {}, error: null, skipped: "no_permission" });
  const body = await request.json().catch(() => ({})) as { urls?: unknown; label?: string; source_module?: string; source_id?: string };
  const urls = (Array.isArray(body.urls) ? body.urls : []).map((u) => String(u ?? "").trim()).filter(isShortenableShopUrl);
  if (!urls.length) return NextResponse.json({ data: {}, error: null });
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { map, created } = await ensureShortLinks(admin, urls, { label: body.label ?? null, sourceModule: body.source_module ?? null, sourceId: body.source_id ?? null, userId: user?.id ?? null });
  if (created.length) {
    await writeAuditMany(admin, created.map((row) => ({
      action: "create", entityType: "short_link", entityId: row.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { code: row.code, name: row.label ?? row.code, target_url: row.target_url, source_module: row.source_module, auto: true },
    })));
  }
  return NextResponse.json({ data: map, error: null });
}
