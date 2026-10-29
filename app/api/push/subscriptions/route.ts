/**
 * /api/push/subscriptions — เครื่องที่เปิดรับแจ้งเตือนเด้ง (ของผู้ใช้ที่ล็อกอินเท่านั้น)
 * GET    → { publicKey, devices[], prefs }   publicKey = กุญแจ VAPID สาธารณะ (ระบบสร้างเองครั้งแรก)
 * POST   { subscription:{endpoint,keys:{p256dh,auth}}, standalone? } → บันทึก/ต่ออายุเครื่องนี้ (endpoint เดิม = อัปเดต)
 * DELETE { id } หรือ { endpoint } → เลิกรับบนเครื่องนั้น (ของตัวเองเท่านั้น)
 * ตาราง erp_push_subscriptions เปิด RLS ไม่มี policy → อ่าน/เขียนผ่านเซิร์ฟเวอร์ (supabaseAdmin) หลังเช็กตัวตนแล้ว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { deviceLabel, parseUserAgent } from "@/lib/login-security";
import { isAllowedPushEndpoint } from "@/lib/web-push";
import { getVapidKeys } from "@/lib/push-server";
import { normalizePushPrefs, PUSH_PREFS_KEY } from "@/lib/push-categories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PushDevice = {
  id: string; device_label: string | null; created_at: string; last_success_at: string | null;
  last_error: string | null; last_error_at: string | null; endpoint_host: string; endpoint_tail: string;
  /** null = ทุกเรื่อง · ["report.popup"] = เด้งที่เบราว์เซอร์ (ป๊อปเตือนงานอย่างเดียว) */
  event_filter: string[] | null;
};

const DEVICE_COLS = "id, device_label, endpoint, created_at, last_success_at, last_error, last_error_at, event_filter";
/** เปิดจากสวิตช์ "เด้งที่เบราว์เซอร์นี้" ในเมนูผู้ใช้ = รับเฉพาะป๊อปเตือนงาน (เจ้าของเลือก 2026-10-29) */
const BROWSER_POPUP_EVENTS = ["report.popup"];
const MAX_DEVICES_PER_USER = 10;

function toDevice(r: Record<string, unknown>): PushDevice {
  const ep = String(r.endpoint ?? "");
  let host = ""; try { host = new URL(ep).hostname; } catch { /* */ }
  return {
    id: String(r.id), device_label: (r.device_label as string) ?? null, created_at: String(r.created_at),
    last_success_at: (r.last_success_at as string) ?? null, last_error: (r.last_error as string) ?? null,
    last_error_at: (r.last_error_at as string) ?? null, endpoint_host: host, endpoint_tail: ep.slice(-12),
    event_filter: Array.isArray(r.event_filter) ? (r.event_filter as string[]) : null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const admin = supabaseAdmin();
  try {
    const [vapid, { data: devs, error }, { data: pref }] = await Promise.all([
      getVapidKeys(admin),
      admin.from("erp_push_subscriptions").select(DEVICE_COLS).eq("user_id", user.id).order("created_at", { ascending: false }),
      admin.from("user_ui_prefs").select("value").eq("user_id", user.id).eq("key", PUSH_PREFS_KEY).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      publicKey: vapid.publicKey,
      devices: ((devs ?? []) as Record<string, unknown>[]).map(toDevice),
      prefs: normalizePushPrefs((pref as { value?: unknown } | null)?.value),
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }, { status: 500 });
  }
}

/** scope: "all" = ทุกเรื่อง (เปิดจากแอป /notify) · "popup" = ป๊อปเตือนงานอย่างเดียว (สวิตช์ในเมนูผู้ใช้) · ไม่ส่ง = คงของเดิม (ต่ออายุ) */
type PostBody = { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; standalone?: boolean; scope?: "all" | "popup" };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const actor = await requestActor(client);
  if (!actor.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: PostBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const endpoint = String(body.subscription?.endpoint ?? "").trim();
  const p256dh = String(body.subscription?.keys?.p256dh ?? "").trim();
  const auth = String(body.subscription?.keys?.auth ?? "").trim();
  if (!isAllowedPushEndpoint(endpoint)) return NextResponse.json({ error: "เบราว์เซอร์นี้ส่งที่อยู่รับแจ้งเตือนที่ระบบไม่รู้จัก" }, { status: 400 });
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) {
    return NextResponse.json({ error: "ข้อมูลกุญแจของเครื่องไม่ถูกต้อง" }, { status: 400 });
  }

  const ua = request.headers.get("user-agent") ?? "";
  const p = parseUserAgent(ua);
  const label = body.standalone
    ? `${deviceLabel(p.deviceType, p.browser, p.os).split(" · ")[0]} · ${p.os} (แอปบนหน้าจอโฮม)`
    : deviceLabel(p.deviceType, p.browser, p.os);

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("erp_push_subscriptions").select("id, user_id, event_filter").eq("endpoint", endpoint).maybeSingle();
  const prev = existing as { id: string; user_id: string; event_filter: string[] | null } | null;
  // ตัวกรองเรื่องที่เครื่องนี้รับ: เครื่องที่รับทุกเรื่องอยู่แล้ว (รวมป๊อป) ไม่ลดเหลือแค่ป๊อป
  const mineBefore = prev && prev.user_id === actor.id ? prev : null;
  const eventFilter: string[] | null | undefined =
    body.scope === "all" ? null
    : body.scope === "popup" ? (mineBefore && mineBefore.event_filter === null ? null : BROWSER_POPUP_EVENTS)
    : mineBefore ? undefined : null;

  if (!prev) {
    const { count } = await admin.from("erp_push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", actor.id);
    if ((count ?? 0) >= MAX_DEVICES_PER_USER) {
      return NextResponse.json({ error: `เปิดรับได้สูงสุด ${MAX_DEVICES_PER_USER} เครื่อง — ลบเครื่องเก่าในรายการก่อน` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await admin.from("erp_push_subscriptions").upsert({
    user_id: actor.id, endpoint, p256dh, auth, user_agent: ua.slice(0, 400), device_label: label,
    updated_at: now, fail_count: 0, last_error: null,
    ...(eventFilter !== undefined ? { event_filter: eventFilter } : {}),
  }, { onConflict: "endpoint" }).select(DEVICE_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // บันทึกประวัติเฉพาะตอนเพิ่มเครื่องใหม่ / ย้ายเจ้าของ (ต่ออายุทุกครั้งที่เปิดแอป ไม่ต้องลง log)
  if (!prev || prev.user_id !== actor.id) {
    await writeAudit(admin, {
      action: "create", entityType: "push_subscription", entityId: (data as { id: string }).id,
      actorId: actor.id, actorName: actor.name,
      metadata: { device: label, from_user: prev && prev.user_id !== actor.id ? prev.user_id : undefined },
    });
  }
  return NextResponse.json({ device: toDevice(data as Record<string, unknown>), error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const actor = await requestActor(client);
  if (!actor.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: { id?: string; endpoint?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id && !body.endpoint) return NextResponse.json({ error: "ต้องระบุ id หรือ endpoint" }, { status: 400 });

  const admin = supabaseAdmin();
  let q = admin.from("erp_push_subscriptions").delete().eq("user_id", actor.id);
  q = body.id ? q.eq("id", body.id) : q.eq("endpoint", String(body.endpoint));
  const { data, error } = await q.select("id, device_label");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  for (const r of (data ?? []) as { id: string; device_label: string | null }[]) {
    await writeAudit(admin, { action: "delete", entityType: "push_subscription", entityId: r.id, actorId: actor.id, actorName: actor.name, metadata: { device: r.device_label } });
  }
  return NextResponse.json({ removed: (data ?? []).length, error: null });
}
