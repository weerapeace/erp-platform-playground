/**
 * POST /api/staff-apps/access-request { path, app_key? } — พนักงานที่ถูกล็อกกด "ขอสิทธิ์จากแอดมิน" ในหน้า "หน้านี้ไม่อยู่ในแอป"
 *   → แจ้งเตือนแอดมินทุกคน (erp_notifications · กระดิ่ง) ลิงก์ไปตั้งค่าแอปนั้น + ลง audit_logs
 * กันกดรัว: คนเดิม + หน้าเดิม ภายใน 1 ชม. ส่งครั้งเดียว
 * ส่งแล้วดึงกลับไม่ได้ (เป็นการแจ้งเตือน) — หน้าเว็บถามยืนยันก่อนส่ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EVENT = "staff_app.access_request";

export async function POST(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  let body: { path?: string; app_key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const path = String(body.path ?? "").split(/[?#]/)[0].slice(0, 200);
  if (!path.startsWith("/")) return NextResponse.json({ error: "ไม่รู้ว่าขอหน้าไหน" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: prof } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const name = (prof as { display_name?: string | null } | null)?.display_name || user.email || "พนักงาน";
  const appKey = String(body.app_key ?? "").slice(0, 40);
  const { data: app } = appKey ? await admin.from("erp_app_groups").select("id, label").eq("key", appKey).maybeSingle() : { data: null };
  const a = app as { id: string; label: string } | null;
  const title = `${name} ขอเข้าหน้า ${path}`;

  // กันส่งซ้ำ 1 ชม.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { data: dup } = await admin.from("erp_notifications").select("id").eq("event_type", EVENT).eq("title", title).gte("created_at", since).limit(1);
  if (dup?.length) return NextResponse.json({ ok: true, duplicate: true, error: null });

  const { data: admins } = await admin.from("user_profiles").select("id").eq("role", "admin").eq("active", true);
  const rows = ((admins ?? []) as { id: string }[]).map((x) => ({
    user_id: x.id, event_type: EVENT, title,
    body: a ? `จากแอป “${a.label}” — เพิ่มเมนูนี้เข้าแอป หรือใส่เป็นข้อยกเว้นดูอย่างเดียว` : "เพิ่มเมนูนี้เข้าแอปของพนักงาน หรือใส่เป็นข้อยกเว้น",
    link_url: a ? `/admin/app-manager?staff=${a.id}` : "/admin/app-manager",
    entity_type: "erp_app_groups", entity_id: a?.id ?? null, priority: "normal",
  }));
  if (rows.length) {
    const { error } = await admin.from("erp_notifications").insert(rows);
    if (error) return NextResponse.json({ error: "ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
  await writeAudit(admin, { action: EVENT, entityType: "erp_app_groups", entityId: a?.id ?? null, actorId: user.id, actorName: name, metadata: { path, app_key: appKey || null, admins: rows.length } });
  return NextResponse.json({ ok: true, sent: rows.length, error: null });
}
