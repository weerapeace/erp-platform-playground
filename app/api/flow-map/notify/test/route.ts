/**
 * POST /api/flow-map/notify/test  { id } — ปุ่ม "ทดสอบส่งเข้ากระดิ่งของฉัน" ในแผงกระดิ่งบนกล่องของแผนผัง (/master/flow-map)
 *   ส่งแจ้งเตือนตัวอย่างของเรื่องนั้น (ข้อความจาก NOTIFY_SAMPLES ใน lib/flow-map-notify.ts) เข้ากระดิ่งของ "คนกดคนเดียว"
 *   → เห็นหน้าตาจริงในกระดิ่ง + มือถือ (ถ้าเปิดรับไว้ trigger ส่งต่อให้เอง) โดยไม่รบกวนคนอื่น · ไม่กินโควตา LINE
 *   สิทธิ์: admin.users (เดียวกับปุ่มจัดการแจ้งเตือนในแผนผัง) · ลงประวัติ flow_map.notify_test
 *   ทดสอบ LINE ใช้ของเดิม: /api/admin/line-console { slot, test:true } (ศูนย์ LINE)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { NOTIFY_SAMPLES, NOTIFY_TOPICS } from "@/lib/flow-map-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NOTIFY_TEST_EVENT = "flow_map.notify_test";   // route ห้าม export ชื่ออื่นนอกจาก GET/POST/… (Next build ล้ม)

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const topic = NOTIFY_TOPICS.find((t) => t.id === id);
  const sample = NOTIFY_SAMPLES[id]?.bell;
  if (!topic) return NextResponse.json({ error: "ไม่รู้จักเรื่องแจ้งเตือนนี้" }, { status: 400 });
  if (!sample) return NextResponse.json({ error: "เรื่องนี้ไม่ได้ส่งเข้ากระดิ่ง จึงทดสอบในกระดิ่งไม่ได้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_notifications").insert({
    user_id: user.id, event_type: NOTIFY_TEST_EVENT, title: `[ทดสอบ] ${sample[0]}`,
    body: `${sample[1]}\n— ตัวอย่างจากแผนผังการทำงาน (ส่งถึงคุณคนเดียว)`, link_url: "/master/flow-map", priority: "normal",
  });
  if (error) return NextResponse.json({ error: "ส่งทดสอบไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  await writeAuditFor(request, admin, { action: "flow_map.notify_test", entityType: "flow_notify_topic", entityId: null, metadata: { topic: id } });
  return NextResponse.json({ ok: true, error: null });
}
