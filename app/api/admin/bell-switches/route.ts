/**
 * POST /api/admin/bell-switches  { events: string[], enabled: boolean } — เปิด/ปิด "กระดิ่งที่โค้ดส่งตรง" (ไม่ผ่านกฎ)
 *   เก็บก้อนเดียวที่ china_app_settings skey BELL_SWITCH_KEY (lib/bell-switch) — แบบเดียวกับสวิตช์ LINE · ไม่มีตารางใหม่
 *   รับเฉพาะ event_type ที่ทะเบียนบอกว่าปิดได้ (NOTIFY_BELL_SWITCH_EVENTS ใน lib/flow-map-notify) — ความปลอดภัย/ปุ่มกดขอเอง ปิดไม่ได้
 *   สิทธิ์: admin.users (เดียวกับปุ่มจัดการแจ้งเตือนในแผนผัง) · ลงประวัติ notify.bell_switch (ก่อน/หลัง)
 *   ใช้ที่: แผงกระดิ่งบนกล่อง + ป๊อปแก้การแจ้งเตือน ในแผนผังการทำงาน (/master/flow-map) ผ่าน saveNotifyTopicSwitch
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { BELL_SWITCH_KEY, cleanBellOff, clearBellSwitchCache } from "@/lib/bell-switch";
import { NOTIFY_BELL_SWITCH_EVENTS } from "@/lib/flow-map-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { events?: unknown; enabled?: unknown } | null;
  const events = [...new Set(Array.isArray(body?.events) ? body.events.filter((e): e is string => typeof e === "string") : [])];
  if (!events.length || typeof body?.enabled !== "boolean") return NextResponse.json({ error: "ต้องระบุเรื่องและเปิด/ปิด" }, { status: 400 });
  const bad = events.filter((e) => !NOTIFY_BELL_SWITCH_EVENTS.has(e));
  if (bad.length) return NextResponse.json({ error: `เรื่องนี้ปิดจากที่นี่ไม่ได้: ${bad.join(", ")}` }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error: readErr } = await admin.from("china_app_settings").select("sval").eq("skey", BELL_SWITCH_KEY).maybeSingle();
  if (readErr) return NextResponse.json({ error: "อ่านสวิตช์เดิมไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  const before = cleanBellOff((data as { sval?: unknown } | null)?.sval);
  const after = { ...before };
  for (const e of events) { if (body.enabled) delete after[e]; else after[e] = true; }
  const { error } = await admin.from("china_app_settings")
    .upsert({ skey: BELL_SWITCH_KEY, sval: after, updated_at: new Date().toISOString() }, { onConflict: "skey" });
  if (error) return NextResponse.json({ error: "บันทึกสวิตช์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  clearBellSwitchCache();
  await writeAuditFor(request, admin, {
    action: "notify.bell_switch", entityType: "notify_bell_switch", entityId: null,
    metadata: { events, enabled: body.enabled, before: Object.keys(before), after: Object.keys(after) },
  });
  return NextResponse.json({ data: { off: after }, error: null });
}
