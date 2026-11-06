/**
 * PATCH /api/flow-map/notify/remarks  { id, text } — หมายเหตุของเรื่องแจ้งเตือน (แท็บแจ้งเตือน / แผงกล่องในแผนผัง)
 *   เก็บก้อนเดียวที่ china_app_settings skey NOTIFY_REMARKS_KEY (id → ข้อความ) · ข้อความว่าง = ซ่อนข้อสังเกตในทะเบียนของเรื่องนั้น
 *   สิทธิ์: admin.users (เดียวกับปุ่มแก้ไขในแผนผัง) · ลงประวัติ flow_map.notify_remark (ก่อน/หลัง)
 *   อ่าน: มากับ GET /api/flow-map/notify (NotifyLive.remarks) · ตัวช่วย lib/flow-map-notify (notifyRemark / cleanNotifyRemarks)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { NOTIFY_REMARKS_KEY, NOTIFY_REMARK_MAX, cleanNotifyRemarks, isNotifyTopicId } from "@/lib/flow-map-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: unknown; text?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!isNotifyTopicId(id)) return NextResponse.json({ error: "ไม่รู้จักเรื่องแจ้งเตือนนี้" }, { status: 400 });
  if (typeof body?.text !== "string") return NextResponse.json({ error: "ต้องส่งข้อความหมายเหตุ" }, { status: 400 });
  const text = body.text.trim();
  if (text.length > NOTIFY_REMARK_MAX) return NextResponse.json({ error: `หมายเหตุยาวเกิน ${NOTIFY_REMARK_MAX} ตัวอักษร` }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error: readErr } = await admin.from("china_app_settings").select("sval").eq("skey", NOTIFY_REMARKS_KEY).maybeSingle();
  if (readErr) return NextResponse.json({ error: "อ่านหมายเหตุเดิมไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  const all = cleanNotifyRemarks((data as { sval?: unknown } | null)?.sval);
  const before = Object.prototype.hasOwnProperty.call(all, id) ? all[id] : null;
  all[id] = text;
  const { error } = await admin.from("china_app_settings")
    .upsert({ skey: NOTIFY_REMARKS_KEY, sval: all, updated_at: new Date().toISOString() }, { onConflict: "skey" });
  if (error) return NextResponse.json({ error: "บันทึกหมายเหตุไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  await writeAuditFor(request, admin, { action: "flow_map.notify_remark", entityType: "flow_notify_topic", entityId: null, metadata: { topic: id, before, after: text } });
  return NextResponse.json({ data: { id, text }, error: null });
}
