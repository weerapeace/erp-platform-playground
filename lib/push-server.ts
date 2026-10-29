/**
 * 📲 ระบบเด้งแจ้งเตือนเข้ามือถือ (ของกลาง · ฝั่งเซิร์ฟเวอร์) — ต่อจากกระดิ่งกลาง erp_notifications
 *
 * ทางเดิน: มีแถวใหม่ใน erp_notifications (จากทุกโมดูล) → trigger ใน DB ยิง pg_net มาที่ /api/push/dispatch
 *         → dispatchPush() จองแถว (pushed_at กันส่งซ้ำ) → ส่งเข้าทุกเครื่องที่คนนั้นเปิดรับ ตามประเภทที่เขาเปิดไว้
 * กุญแจ VAPID: ระบบสร้างเองครั้งแรกแล้วเก็บใน china_app_settings (skey=web_push · ฝั่ง server อ่านเท่านั้น · ปิดค่าใน settings-secrets)
 * ⚠️ ห้ามลบ/เปลี่ยนกุญแจ — ทุกเครื่องที่สมัครไว้จะรับไม่ได้จนกว่าจะเปิดแอปให้สมัครใหม่ (แอปสมัครใหม่ให้เองเมื่อเปิด)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { appBaseUrl } from "@/lib/app-url";
import { generateVapidKeys, sendWebPush, type VapidKeys } from "@/lib/web-push";
import { normalizePushPrefs, pushEnabledFor, PUSH_PREFS_KEY, type PushPrefs } from "@/lib/push-categories";

type Admin = ReturnType<typeof supabaseAdmin>;

export const PUSH_SETTINGS_KEY = "web_push";
/** เกินนี้ใน 1 รอบส่ง (ต่อคน) → รวมเป็นแจ้งเตือนสรุปข้อความเดียว กันมือถือสั่นรัว */
const BURST_LIMIT = 3;
/** แถวที่เก่ากว่านี้ไม่ส่งแล้ว (กันยิงซ้ำของเก่า) */
const MAX_AGE_MIN = 30;
/** ส่งพลาดติดกันเกินนี้ → ลบเครื่องออก (เช่น ถอนแอปไปแล้วแต่บริการไม่ตอบ 410) */
const MAX_FAILS = 10;

let vapidCache: VapidKeys | null = null;

export async function getVapidKeys(admin: Admin): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  const read = async (): Promise<VapidKeys | null> => {
    const { data } = await admin.from("china_app_settings").select("sval").eq("skey", PUSH_SETTINGS_KEY).maybeSingle();
    const v = (data as { sval?: { vapid_public?: string; vapid_private?: string } } | null)?.sval;
    return v?.vapid_public && v?.vapid_private ? { publicKey: v.vapid_public, privateKey: v.vapid_private } : null;
  };
  let keys = await read();
  if (!keys) {
    const g = generateVapidKeys();
    // ignoreDuplicates: ถ้ามีคำขออื่นสร้างไปก่อนพร้อมกัน ใช้ของเขา (อ่านซ้ำด้านล่าง)
    await admin.from("china_app_settings").upsert(
      { skey: PUSH_SETTINGS_KEY, sval: { vapid_public: g.publicKey, vapid_private: g.privateKey, created_at: new Date().toISOString() }, updated_at: new Date().toISOString() },
      { onConflict: "skey", ignoreDuplicates: true },
    );
    keys = await read();
  }
  if (!keys) throw new Error("สร้างกุญแจส่งแจ้งเตือนไม่สำเร็จ");
  vapidCache = keys;
  return keys;
}

export type PushSubscriptionRow = {
  id: string; user_id: string; endpoint: string; p256dh: string; auth: string; fail_count: number | null;
  /** null = ทุกเรื่อง · ไม่ null = รับเฉพาะ event_type ในรายการ (เช่น เด้งที่เบราว์เซอร์ = ป๊อปเตือนงานอย่างเดียว) */
  event_filter: string[] | null;
};

type NotifRow = { id: string; user_id: string; event_type: string; title: string; body: string | null; link_url: string | null; priority: string | null; created_at: string };

export type PushPayload = {
  id: string | null; title: string; body: string; url: string | null; priority: string; unread: number | null;
  /** กดแจ้งเตือน = เปิดลิงก์ตรง (ไม่ผ่านแอป /notify) — ป๊อปเตือนงาน */
  direct?: boolean;
};

/** เครื่องนี้รับเรื่องนี้ไหม (ส่งทดสอบผ่านเสมอ) */
export function subscriptionAccepts(filter: string[] | null | undefined, eventType: string): boolean {
  return !filter || eventType === "push.test" || filter.includes(eventType);
}

export type DispatchStats = { notifications: number; sent: number; failed: number; removed: number; skipped: number };

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function unreadCount(admin: Admin, userId: string): Promise<number | null> {
  const { count, error } = await admin.from("erp_notifications").select("id", { count: "exact", head: true })
    .eq("user_id", userId).is("read_at", null)
    .or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`);
  return error ? null : count ?? 0;
}

/** สร้างข้อความ push ต่อคน (เกิน BURST_LIMIT → สรุปเป็นข้อความเดียว) */
export function buildPayloads(rows: NotifRow[], unread: number | null): PushPayload[] {
  if (rows.length <= BURST_LIMIT) {
    return rows.map((n) => ({
      id: n.id, title: clip(n.title, 120) || "แจ้งเตือนใหม่", body: clip(n.body, 300), url: n.link_url,
      priority: n.priority ?? "normal", unread,
      ...(n.event_type.startsWith("report.") && n.link_url ? { direct: true } : {}),
    }));
  }
  const first = rows.slice(0, 3).map((n) => `• ${clip(n.title, 60)}`);
  const more = rows.length - first.length;
  return [{
    id: null, title: `มีแจ้งเตือนใหม่ ${rows.length} เรื่อง`,
    body: [...first, ...(more > 0 ? [`และอีก ${more} เรื่อง`] : [])].join("\n"), url: null,
    priority: rows.some((n) => n.priority === "high") ? "high" : "normal", unread,
  }];
}

/** ส่ง push ของแจ้งเตือนชุดนี้ — จองแถวก่อน (ส่งครั้งเดียวแน่นอน แม้ถูกเรียกซ้ำ) */
export async function dispatchPush(admin: Admin, ids: string[]): Promise<DispatchStats> {
  const stats: DispatchStats = { notifications: 0, sent: 0, failed: 0, removed: 0, skipped: 0 };
  const uniq = Array.from(new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 500);
  if (!uniq.length) return stats;

  const since = new Date(Date.now() - MAX_AGE_MIN * 60_000).toISOString();
  const { data: claimed, error } = await admin.from("erp_notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", uniq).is("pushed_at", null).gte("created_at", since)
    .select("id, user_id, event_type, title, body, link_url, priority, created_at");
  if (error) throw new Error(error.message);
  const rows = ((claimed ?? []) as NotifRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  stats.notifications = rows.length;
  if (!rows.length) return stats;

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: subsData }, { data: prefData }] = await Promise.all([
    admin.from("erp_push_subscriptions").select("id, user_id, endpoint, p256dh, auth, fail_count, event_filter").in("user_id", userIds),
    admin.from("user_ui_prefs").select("user_id, value").eq("key", PUSH_PREFS_KEY).in("user_id", userIds),
  ]);
  const subs = (subsData ?? []) as PushSubscriptionRow[];
  if (!subs.length) { stats.skipped = rows.length; return stats; }
  const prefs = new Map<string, PushPrefs>(((prefData ?? []) as { user_id: string; value: unknown }[]).map((p) => [p.user_id, normalizePushPrefs(p.value)]));

  const vapid = await getVapidKeys(admin);
  const subject = appBaseUrl();
  const jobs: { sub: PushSubscriptionRow; payload: PushPayload }[] = [];

  for (const uid of userIds) {
    const mySubs = subs.filter((s) => s.user_id === uid);
    if (!mySubs.length) continue;
    const p = prefs.get(uid) ?? { off: [] };
    const mine = rows.filter((r) => r.user_id === uid);
    const wanted = mine.filter((r) => pushEnabledFor(p, r.event_type));
    stats.skipped += mine.length - wanted.length;
    if (!wanted.length) continue;
    const unread = await unreadCount(admin, uid);
    // แต่ละเครื่องเลือกรับได้ (เด้งที่เบราว์เซอร์ = ป๊อปเตือนงานอย่างเดียว) → ประกอบข้อความต่อเครื่อง
    for (const s of mySubs) {
      const forSub = wanted.filter((r) => subscriptionAccepts(s.event_filter, r.event_type));
      for (const payload of buildPayloads(forSub, unread)) jobs.push({ sub: s, payload });
    }
  }

  // ส่งพร้อมกันทีละ 20
  const outcome = new Map<string, { ok: boolean; gone: boolean; error?: string }>();
  for (let i = 0; i < jobs.length; i += 20) {
    const chunk = jobs.slice(i, i + 20);
    const res = await Promise.all(chunk.map(({ sub, payload }) =>
      sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, vapid, subject,
        { urgency: payload.priority === "high" ? "high" : "normal", topic: payload.id ? undefined : "summary" })));
    res.forEach((r, k) => {
      const id = chunk[k].sub.id;
      if (r.ok) stats.sent++; else stats.failed++;
      const prev = outcome.get(id);
      outcome.set(id, { ok: (prev?.ok ?? false) || r.ok, gone: (prev?.gone ?? false) || r.gone, error: r.ok ? prev?.error : `${r.status} ${r.error ?? ""}`.trim() });
    });
  }

  // อัปเดตสถานะแต่ละเครื่อง
  const now = new Date().toISOString();
  await Promise.all(Array.from(outcome.entries()).map(async ([id, o]) => {
    const sub = subs.find((s) => s.id === id)!;
    const fails = (sub.fail_count ?? 0) + 1;
    if (o.gone || (!o.ok && fails >= MAX_FAILS)) {
      stats.removed++;
      await admin.from("erp_push_subscriptions").delete().eq("id", id);
    } else if (o.ok) {
      await admin.from("erp_push_subscriptions").update({ last_success_at: now, fail_count: 0, last_error: null }).eq("id", id);
    } else {
      await admin.from("erp_push_subscriptions").update({ last_error: clip(o.error, 300), last_error_at: now, fail_count: fails }).eq("id", id);
    }
  }));
  return stats;
}
