/**
 * 🔔 กดในป๊อปเตือนงาน — POST /api/popups/ack  body: { report_id, action: "ack" | "later" }
 *   ack   = รับทราบ (ป๊อปแบบวันละครั้ง จะไม่เด้งอีกวันนี้) · ทับ "later" ได้
 *   later = ไว้ทีหลัง (ครั้งแรกของวัน → ใส่กระดิ่งให้กดเปิดป๊อปนี้อีกครั้งได้) · ไม่ทับ "ack"
 * เก็บใน erp_popup_acks (หน้าตั้งค่ารายงานโชว์ว่าวันนี้ใครรับทราบแล้ว) · ต้องล็อกอิน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { nowTH } from "@/lib/email-report/send";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const actor = await requestActor(supabaseFromRequest(request));
  if (!actor.id) return NextResponse.json({ ok: false, error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { report_id?: unknown; action?: unknown } | null;
  const reportId = typeof body?.report_id === "string" && /^[0-9a-f-]{36}$/i.test(body.report_id) ? body.report_id : null;
  const action = body?.action === "later" ? "later" : body?.action === "ack" ? "ack" : null;
  if (!reportId || !action) return NextResponse.json({ ok: false, error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: rep } = await admin.from("email_reports").select("id, name").eq("id", reportId).eq("is_active", true).maybeSingle();
  if (!rep) return NextResponse.json({ ok: false, error: "ไม่พบรายงานนี้" }, { status: 404 });
  const row = { report_id: reportId, user_id: actor.id, ack_date: nowTH().date, action, acked_at: new Date().toISOString() };

  if (action === "ack") {
    const { error } = await admin.from("erp_popup_acks").upsert(row, { onConflict: "report_id,user_id,ack_date" });
    if (error) return NextResponse.json({ ok: false, error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ ok: true, error: null });
  }

  // later: เพิ่มเฉพาะครั้งแรกของวัน (มี ack/later อยู่แล้ว = ไม่ทับ)
  const { data: inserted, error } = await admin.from("erp_popup_acks").upsert(row, { onConflict: "report_id,user_id,ack_date", ignoreDuplicates: true }).select("report_id");
  if (error) return NextResponse.json({ ok: false, error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  if ((inserted ?? []).length > 0) {
    try {
      await admin.rpc("erp_notify", {
        p_user_ids: [actor.id], p_event_type: "report.popup_later",
        p_title: `🔔 ${(rep as { name: string }).name}`.slice(0, 200),
        p_body: "คุณกด \"ไว้ทีหลัง\" — กดที่นี่เพื่อเปิดป๊อปเตือนงานอีกครั้ง",
        p_link_url: `/apps?popup=${reportId}`, p_entity_type: "email_report", p_entity_id: reportId, p_priority: "normal",
      });
    } catch (e) { console.error("[popups/ack] notify", e); }
  }
  return NextResponse.json({ ok: true, error: null });
}
