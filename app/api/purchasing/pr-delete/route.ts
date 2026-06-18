/**
 * POST /api/purchasing/pr-delete
 * ลบใบขอซื้อ (PR v2) แบบ "ซ่อน" (soft delete) — is_active=false · ข้อมูลยังอยู่ใน DB กู้ได้
 *
 * body: { pr_ids: string[], actor?: string }
 *
 * - ลบได้เฉพาะใบที่ยังไม่ออก PO (po_id ว่าง)
 * - สิทธิ์: admin หรือ pr.reject / pr.approve (ของกลาง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditMany } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { pr_ids?: unknown; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const prIds = Array.isArray(body.pr_ids) ? body.pr_ids.filter((x): x is string => typeof x === "string") : [];
  if (prIds.length === 0) return NextResponse.json({ error: "ไม่ได้เลือกรายการ" }, { status: 400 });

  const admin = supabaseAdmin();

  // ---- สิทธิ์: admin หรือมี pr.reject/pr.approve ----
  const { data: prof } = await admin.from("user_profiles").select("role, active").eq("id", user.id).maybeSingle();
  const role = prof?.active ? (prof.role as string | null) : null;
  let allowed = role === "admin";
  if (!allowed && role) {
    const { data: perm } = await admin.from("erp_role_permissions").select("permission_key")
      .eq("role_key", role).in("permission_key", ["pr.reject", "pr.approve"]).limit(1);
    allowed = !!(perm && perm.length > 0);
  }
  if (!allowed) return NextResponse.json({ error: "คุณไม่มีสิทธิ์ลบใบขอซื้อ" }, { status: 403 });

  // ---- ลบได้เฉพาะใบที่ยังไม่ออก PO ----
  const { data: prs, error: prErr } = await admin
    .from("purchase_requests_v2").select("id, pr_no, po_id").in("id", prIds);
  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  const usable = (prs ?? []).filter((p) => !p.po_id);
  if (usable.length === 0) return NextResponse.json({ error: "ลบไม่ได้ — รายการที่เลือกออกใบสั่งซื้อไปแล้ว" }, { status: 400 });

  const actor = body.actor ?? user.email ?? "system";
  const ids = usable.map((p) => p.id);
  const { error: updErr } = await admin.from("purchase_requests_v2").update({ is_active: false }).in("id", ids);
  if (updErr) return NextResponse.json({ error: "ลบไม่สำเร็จ: " + updErr.message }, { status: 500 });

  await writeAuditMany(admin, usable.map((p) => ({
    action: "delete", entityType: "purchase_requests_v2", entityId: p.id,
    actorId: user.id, actorName: actor, metadata: { pr_no: p.pr_no, soft: true },
  })));

  return NextResponse.json({ ok: true, deleted: ids.length, error: null });
}
