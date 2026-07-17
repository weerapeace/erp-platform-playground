/**
 * /api/subscriptions/personal/shares — จัดการว่าฉันแชร์ลิสต์ "ส่วนตัว" ให้ใครดู (view-only)
 *
 * PUT body { viewer_ids: string[] } → แทนที่รายชื่อทั้งหมด (owner = คนที่ล็อกอิน)
 *
 * แชร์ระดับ "ทั้งหน้า": คนที่ถูกแชร์เห็นรายการส่วนตัวทุกอันของฉัน แต่แก้ไม่ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const me = user?.id ?? "";
  if (!me) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });

  let body: { viewer_ids?: string[]; actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // ล้างค่าว่าง/ตัวเอง/ซ้ำ
  const viewerIds = [...new Set((body.viewer_ids ?? []).map(String).filter((v) => v && v !== me))];

  const db = supabaseAdmin();
  // แทนที่ทั้งชุด: ลบของเดิม (owner = me) แล้วใส่ใหม่
  const { error: delErr } = await db.from("subscription_personal_shares").delete().eq("owner_id", me);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (viewerIds.length) {
    const rows = viewerIds.map((viewer_id) => ({ owner_id: me, viewer_id }));
    const { error: insErr } = await db.from("subscription_personal_shares").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await writeAudit(db, {
    action: "update", entityType: "subscription_personal_shares", entityId: null,
    actorId: me, actorName: body.actor ?? null,
    metadata: { shared_with: viewerIds },
  });

  return NextResponse.json({ ok: true, count: viewerIds.length, error: null });
}
