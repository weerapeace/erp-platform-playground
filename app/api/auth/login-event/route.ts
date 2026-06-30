/**
 * POST /api/auth/login-event — บันทึกการเข้าสู่ระบบต่ออุปกรณ์ + เตือนเมื่อเจอ "อุปกรณ์ใหม่"
 *   body: { device_id }  (client สร้างเก็บใน localStorage)
 *   - dedupe: มี event ของ (user, device) ใน 30 นาที → ไม่บันทึกซ้ำ
 *   - เครื่องใหม่ (ไม่เคยเห็น device นี้) + เคยมีเครื่องอื่นมาก่อน → แจ้งเตือนในแอป + LINE
 *
 * GET /api/auth/login-event — รายการประวัติของตัวเอง (RLS เห็นเฉพาะของตัวเอง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseUserAgent, geoFromHeaders, locationLabel, deviceLabel, pushSecurityLine } from "@/lib/login-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const sb = supabaseFromRequest(request);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ data: [], error: "ต้อง login" }, { status: 401 });
  const { data, error } = await sb.from("user_login_events")
    .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { device_id?: string };
  try { body = await request.json(); } catch { body = {}; }
  const deviceId = (String(body.device_id ?? "").trim() || "unknown").slice(0, 80);

  const ua = request.headers.get("user-agent") ?? "";
  const { browser, os, deviceType } = parseUserAgent(ua);
  const geo = geoFromHeaders(request.headers);
  const admin = supabaseAdmin();

  // dedupe: มี event ของเครื่องนี้ใน 30 นาทีล่าสุด → ไม่บันทึกซ้ำ (กัน refresh/หลายแท็บ)
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recent } = await admin.from("user_login_events")
    .select("id").eq("user_id", user.id).eq("device_id", deviceId).gte("created_at", since).limit(1);
  if (recent && recent.length) return NextResponse.json({ ok: true, skipped: true });

  // เครื่องนี้เคยเข้ามาก่อนไหม + ผู้ใช้มี event มาก่อนกี่ครั้ง (เลี่ยงเตือนตอนล็อกอินครั้งแรกสุด)
  const { data: priorThis } = await admin.from("user_login_events")
    .select("id").eq("user_id", user.id).eq("device_id", deviceId).limit(1);
  const isNewDevice = !(priorThis && priorThis.length);
  const { count: totalCount } = await admin.from("user_login_events")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id);

  await admin.from("user_login_events").insert({
    user_id: user.id, device_id: deviceId, user_agent: ua.slice(0, 400),
    browser, os, device_type: deviceType,
    ip: geo.ip.slice(0, 60), city: geo.city, region: geo.region, country: geo.country,
    is_new_device: isNewDevice,
  });

  if (isNewDevice && (totalCount ?? 0) > 0) {
    const loc = locationLabel(geo);
    const when = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
    const dev = deviceLabel(deviceType, browser, os);
    try {
      await admin.from("erp_notifications").insert({
        user_id: user.id, event_type: "security.new_device", priority: "high",
        title: "🔐 เข้าสู่ระบบจากอุปกรณ์ใหม่",
        body: `${dev}\n${loc} · ${when}\nถ้าไม่ใช่คุณ รีบเปลี่ยนรหัสผ่าน`,
        link_url: "/account/security", entity_type: "security", entity_id: null,
      });
    } catch { /* เงียบ */ }
    await pushSecurityLine(admin, `🔐 เข้าสู่ระบบจากอุปกรณ์ใหม่\nผู้ใช้: ${user.email}\n${dev}\n${loc} · ${when}`);
  }

  return NextResponse.json({ ok: true, is_new_device: isNewDevice });
}
