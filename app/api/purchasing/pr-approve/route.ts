/**
 * POST /api/purchasing/pr-approve
 * อนุมัติ / ไม่อนุมัติ ใบขอซื้อ (PR v2) — ขั้น 2 ของการยกระดับจัดซื้อ
 *
 * body: { pr_ids: string[], action: "approve" | "reject", reason?: string, actor?: string }
 *
 * กฎ:
 *  - อนุมัติได้เฉพาะใบที่ยัง "waiting" (รออนุมัติ) เท่านั้น
 *  - approve → status = "approved"   (จึงจะนำไปสร้างใบสั่งซื้อได้)
 *  - reject  → status = "rejected"   (ต้องระบุเหตุผล)
 *  - สิทธิ์: admin ผ่านหมด, role อื่นต้องมี permission pr.approve / pr.reject (ของกลาง)
 *
 * เขียนผ่าน service role (supabaseAdmin) — bypass RLS
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { pr_ids?: unknown; action?: string; reason?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const action = body.action === "approve" || body.action === "reject" ? body.action : null;
  if (!action) return NextResponse.json({ error: "action ต้องเป็น approve หรือ reject" }, { status: 400 });

  const prIds = Array.isArray(body.pr_ids) ? body.pr_ids.filter((x): x is string => typeof x === "string") : [];
  if (prIds.length === 0) return NextResponse.json({ error: "ไม่ได้เลือกรายการ" }, { status: 400 });

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (action === "reject" && !reason) return NextResponse.json({ error: "การไม่อนุมัติต้องระบุเหตุผล" }, { status: 400 });

  const admin = supabaseAdmin();

  // ---- ตรวจสิทธิ์ (mirror ตรรกะ erp_can: admin override + ดู role_permissions) ----
  const permKey = action === "approve" ? "pr.approve" : "pr.reject";
  const { data: prof } = await admin.from("user_profiles").select("role, active").eq("id", user.id).maybeSingle();
  const role = prof?.active ? (prof.role as string | null) : null;
  let allowed = role === "admin";
  if (!allowed && role) {
    const { data: perm } = await admin
      .from("erp_role_permissions").select("permission_key")
      .eq("role_key", role).eq("permission_key", permKey).maybeSingle();
    allowed = !!perm;
  }
  if (!allowed) {
    return NextResponse.json({ error: `คุณไม่มีสิทธิ์${action === "approve" ? "อนุมัติ" : "ไม่อนุมัติ"}ใบขอซื้อ (${permKey})` }, { status: 403 });
  }

  // ---- โหลดเฉพาะใบที่ยังรออนุมัติ (waiting) ----
  const { data: prs, error: prErr } = await admin
    .from("purchase_requests_v2").select("id, pr_no, status").in("id", prIds);
  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  const usable = (prs ?? []).filter((p) => p.status === "waiting");
  if (usable.length === 0) {
    return NextResponse.json({ error: "รายการที่เลือกไม่อยู่ในสถานะ 'รออนุมัติ' (อาจถูกอนุมัติ/ไม่อนุมัติ/สั่งซื้อไปแล้ว)" }, { status: 400 });
  }

  const actor = body.actor ?? user.email ?? "system";
  const nowIso = new Date().toISOString();
  const ids = usable.map((p) => p.id);

  const patch = action === "approve"
    ? { status: "approved", approved_by: actor, approved_at: nowIso, reject_reason: null }
    : { status: "rejected", approved_by: actor, approved_at: nowIso, reject_reason: reason };

  const { error: updErr } = await admin.from("purchase_requests_v2").update(patch).in("id", ids);
  if (updErr) return NextResponse.json({ error: "อัปเดตสถานะไม่สำเร็จ: " + updErr.message }, { status: 500 });

  // audit (best-effort — ขั้น 3 จะทำให้ครบ)
  await admin.from("erp_audit_logs").insert({
    actor_name: actor,
    action: action === "approve" ? "purchase.pr_approve" : "purchase.pr_reject",
    module: "purchase-requests-v2",
    record_label: usable.map((p) => p.pr_no).filter(Boolean).join(", ") || `${ids.length} ใบ`,
    new_value: { count: ids.length, reason: reason || null },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, action, updated: ids.length, error: null });
}
