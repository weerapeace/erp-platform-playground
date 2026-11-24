/**
 * 🧱 บล็อกพิมพ์ — จดประวัติ "ส่งออก PDF" (ตัว PDF สร้างในเบราว์เซอร์ · ที่นี่จดแค่ใคร/เมื่อไหร่/ชิ้นไหน ขนาดเท่าไหร่)
 * POST /api/block-print/jobs/<id>/export  body {paper, unit, pieces:[{name,w,h}]}
 * สิทธิ์ block_print.view (คนดูอย่างเดียวก็ดาวน์โหลด PDF ได้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { bad, ENTITY, TABLE, VIEW_PERM } from "../../../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad("ไม่พบงานนี้", 404);
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* ไม่มีรายละเอียดก็จดได้ */ }
  const admin = supabaseAdmin();
  const { data: job } = await admin.from(TABLE).select("id, code, name").eq("id", id).maybeSingle();
  if (!job) return bad("ไม่พบงานนี้", 404);
  const pieces = (Array.isArray(body.pieces) ? body.pieces : []).slice(0, 100).map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return `${String(o.name ?? "").slice(0, 60)} ${Number(o.w) || 0}×${Number(o.h) || 0} มม.`;
  });
  await writeAuditFor(request, admin, {
    action: "export", entityType: ENTITY, entityId: id,
    metadata: { code: job.code, name: job.name, format: "pdf", paper: String(body.paper ?? ""), unit: String(body.unit ?? ""), pieces },
  });
  return NextResponse.json({ ok: true, error: null });
}
