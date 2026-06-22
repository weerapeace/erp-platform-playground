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
import { writeAuditMany } from "@/lib/audit";

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
    .from("purchase_requests_v2").select("id, pr_no, status, item_name, requester").in("id", prIds);
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

  // audit — 1 แถวต่อ 1 ใบ (ของกลาง, เขียนลงตาราง audit_logs จริง)
  await writeAuditMany(admin, usable.map((p) => ({
    action:     action,                       // approve | reject
    entityType: "purchase_requests_v2",
    entityId:   p.id,
    actorId:    user.id,
    actorName:  actor,
    metadata:   { pr_no: p.pr_no, reason: reason || null },
  })));

  // ---- แจ้งเตือนเมื่อ "ไม่อนุมัติ": ① กระดิ่งถึงผู้ขอ ② LINE กลุ่มขอซื้อ ----
  // ห่อ try/catch — แจ้งเตือนพลาดต้องไม่ทำให้การไม่อนุมัติล้มเหลว
  if (action === "reject") {
    try {
      type PrRow = { id: string; pr_no: string; item_name: string | null; requester: string | null };
      const rejected = usable as PrRow[];
      const n = rejected.length;
      const itemLines = rejected.slice(0, 8).map((p) => `• ${p.pr_no} — ${p.item_name ?? "สินค้า"}`);
      if (n > 8) itemLines.push(`• …อีก ${n - 8} ใบ`);

      // ① กระดิ่ง → ผู้ขอ (จับคู่ requester กับ user_profiles ด้วย display_name หรือ email · หาไม่เจอ → ข้าม)
      const requesters = [...new Set(rejected.map((p) => (p.requester ?? "").trim()).filter(Boolean))];
      if (requesters.length) {
        const { data: profs } = await admin.from("user_profiles").select("id, display_name, email").eq("active", true);
        const idByKey = new Map<string, string>();
        for (const pr of (profs ?? []) as { id: string; display_name: string | null; email: string | null }[]) {
          if (pr.display_name) idByKey.set(pr.display_name.trim().toLowerCase(), pr.id);
          if (pr.email)        idByKey.set(pr.email.trim().toLowerCase(), pr.id);
        }
        const notifRows = rejected
          .map((p) => {
            const key = (p.requester ?? "").trim().toLowerCase();
            const uid = key ? idByKey.get(key) : undefined;
            if (!uid) return null;
            return {
              user_id: uid, event_type: "pr_rejected",
              title: `❌ ใบขอซื้อ ${p.pr_no} ไม่ได้รับอนุมัติ`,
              body: `${p.item_name ?? "สินค้า"} — เหตุผล: ${reason}`,
              link_url: "/purchasing/orders", entity_type: "purchase_requests_v2",
              entity_id: p.id, priority: "high",
            };
          })
          .filter(Boolean) as Record<string, unknown>[];
        if (notifRows.length) await admin.from("erp_notifications").insert(notifRows);
      }

      // ② LINE → กลุ่ม "ขอซื้อ" (groups.purchase_request) · ใช้บอท/โทเคนเดิม
      const { data: lc } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
      const cfg = (lc?.sval ?? {}) as { token?: string; groups?: Record<string, string> };
      const target = cfg.groups?.purchase_request || "";
      if (cfg.token && target) {
        const lineText = `❌ ใบขอซื้อไม่อนุมัติ ${n} ใบ\nโดย: ${actor}\nเหตุผล: ${reason}\n${itemLines.join("\n")}\n→ เปิดแอปจัดซื้อเพื่อดูรายละเอียด`;
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
          body: JSON.stringify({ to: target, messages: [{ type: "text", text: lineText.slice(0, 4900) }] }),
        });
      }
    } catch (e) { console.warn("[pr-approve] reject notify failed:", e); }
  }

  return NextResponse.json({ ok: true, action, updated: ids.length, error: null });
}
