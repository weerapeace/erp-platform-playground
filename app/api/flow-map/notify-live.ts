/**
 * สถานะสดของแท็บ "แจ้งเตือน" (ฝั่ง server) — ที่เดียวที่อ่านกลุ่ม LINE · กฎกระดิ่ง · ช่างผูก LINE · สวิตช์ร้าน · สถิติ 90 วัน · รายงานตามเวลา
 * ใช้ที่ /api/flow-map/notify · คืนแค่ "ตั้งแล้วไหม / นับได้เท่าไร" (NotifyLive ใน lib/flow-map-notify.ts) ไม่มี token / group id / channel id
 * ตัวไหนอ่านไม่สำเร็จ = ค่าว่าง (ไม่ล้มทั้งแท็บ) แล้วจดชื่อใน failed
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { emailConfigured } from "@/lib/email";
import { shopLineToken } from "@/lib/webshop-line";
import { readSiteInfo } from "@/lib/website-site-info";
import { BELL_SWITCH_KEY, cleanBellOff } from "@/lib/bell-switch";
import { NOTIFY_DAYS, NOTIFY_RECENT_DAYS, NOTIFY_REMARKS_KEY, cleanNotifyRemarks, type NotifyLive, type NotifyStat } from "@/lib/flow-map-notify";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
type LineCfg = { token?: string; group_id?: string; groups?: Record<string, string>; disabled_events?: Record<string, boolean> };

async function lineState(admin: Admin): Promise<NotifyLive["line"]> {
  const { data, error } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
  if (error) throw new Error(error.message);
  const cfg = ((data as { sval?: LineCfg } | null)?.sval ?? {}) as LineCfg;
  const groups: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(cfg.groups ?? {})) groups[k] = !!String(v ?? "").trim();
  const off: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(cfg.disabled_events ?? {})) if (v === true) off[k] = true;
  return { token: !!cfg.token?.trim(), main: !!cfg.group_id?.trim(), groups, off };
}

/** ป้ายคนรับแบบที่ไม่ใช่ role/user (ใช้กับเอกสาร) */
const RECIPIENT_WORD: Record<string, string> = { approvers: "ผู้อนุมัติ", requester: "ผู้ขอ", mentioned: "คนที่ถูกแท็ก" };

async function rules(admin: Admin): Promise<NotifyLive["rules"]> {
  const { data, error } = await admin.from("erp_notification_rules").select("event_type, name, active, recipients").order("sort_order");
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Row[];
  // ป้ายคนรับ (ภาษาคน) — ชื่อ role + ชื่อคน · ไม่มีเบอร์/อีเมล
  const recips = list.flatMap((r) => (Array.isArray(r.recipients) ? (r.recipients as { type?: string; value?: string }[]) : []));
  const roleKeys = [...new Set(recips.filter((x) => x.type === "role" && x.value).map((x) => String(x.value)))];
  const userIds = [...new Set(recips.filter((x) => x.type === "user" && x.value).map((x) => String(x.value)))];
  const [roleRes, userRes] = await Promise.all([
    roleKeys.length ? admin.from("erp_roles").select("key, label").in("key", roleKeys) : Promise.resolve({ data: [] as Row[] }),
    userIds.length ? admin.from("user_profiles").select("id, display_name, username").in("id", userIds) : Promise.resolve({ data: [] as Row[] }),
  ]);
  const roleLabel = new Map(((roleRes.data ?? []) as Row[]).map((x) => [String(x.key), String(x.label ?? x.key)]));
  const userLabel = new Map(((userRes.data ?? []) as Row[]).map((x) => [String(x.id), String(x.display_name || x.username || "ผู้ใช้")]));
  const toText = (raw: unknown) => {
    const arr = Array.isArray(raw) ? (raw as { type?: string; value?: string }[]) : [];
    const parts = arr.map((x) => (x.type === "role" ? roleLabel.get(String(x.value)) ?? String(x.value ?? "")
      : x.type === "user" ? userLabel.get(String(x.value)) ?? "ผู้ใช้ (ลบแล้ว)" : RECIPIENT_WORD[String(x.type)] ?? "")).filter(Boolean);
    return parts.length ? parts.join(" + ") : "ยังไม่เลือกคนรับ";
  };
  return list.map((r) => ({ event: String(r.event_type), name: String(r.name ?? r.event_type), active: r.active === true, to: toText(r.recipients) }));
}

async function staff(admin: Admin): Promise<NotifyLive["staff"]> {
  const base = () => admin.from("employees").select("id", { count: "exact", head: true }).eq("employment_status", "active");
  const [all, linked] = await Promise.all([base(), base().not("line_user_id", "is", null)]);
  if (all.error) throw new Error(all.error.message);
  if (linked.error) throw new Error(linked.error.message);
  return { active: all.count ?? 0, linked: linked.count ?? 0 };
}

async function pushDevices(admin: Admin): Promise<number> {
  const { count, error } = await admin.from("erp_push_subscriptions").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function shops(admin: Admin): Promise<NotifyLive["shops"]> {
  const { data, error } = await admin.from("shops").select("id, slug");
  if (error) throw new Error(error.message);
  const list = (data ?? []) as { id: string; slug: string | null }[];
  const infos = await Promise.all(list.map((s) => readSiteInfo(admin, s.id)));
  return {
    total: list.length,
    line: infos.filter((i) => i.line_notify_enabled).length,
    email: infos.filter((i) => i.order_email_enabled).length,
    oa: list.filter((s) => !!s.slug && !!shopLineToken(s.slug)).length,
  };
}

/** สถิติกระดิ่ง 90 วันต่อ event_type — ดึงทีละ 1,000 แถวแบบขนาน (นับจำนวนก่อน) */
async function stats(admin: Admin): Promise<NotifyLive["stats"]> {
  const since = new Date(Date.now() - NOTIFY_DAYS * 86400000).toISOString();
  const { count, error } = await admin.from("erp_notifications").select("id", { count: "exact", head: true }).gte("created_at", since);
  if (error) throw new Error(error.message);
  const pages = Math.min(Math.ceil((count ?? 0) / 1000), 60);
  const chunks = await Promise.all(Array.from({ length: pages }, (_, i) =>
    admin.from("erp_notifications").select("event_type, user_id, read_at, created_at").gte("created_at", since).order("created_at").order("id").range(i * 1000, i * 1000 + 999)));
  const recent = new Date(Date.now() - NOTIFY_RECENT_DAYS * 86400000).toISOString();   // แผงกระดิ่งบนกล่อง
  const acc = new Map<string, NotifyStat & { who: Set<string> }>();
  for (const c of chunks) {
    if (c.error) throw new Error(c.error.message);
    for (const r of (c.data ?? []) as Row[]) {
      const k = String(r.event_type ?? "");
      const s = acc.get(k) ?? { n: 0, read: 0, users: 0, last: null, n7: 0, read7: 0, who: new Set<string>() };
      s.n++;
      if (r.read_at) s.read++;
      // created_at จาก PostgREST = "2026-11-10T03:00:00.123+00:00" · recent = "…Z" → เทียบเป็นเวลา ไม่เทียบข้อความ
      if (Date.parse(String(r.created_at ?? "")) >= Date.parse(recent)) { s.n7 = (s.n7 ?? 0) + 1; if (r.read_at) s.read7 = (s.read7 ?? 0) + 1; }
      if (r.user_id) s.who.add(String(r.user_id));
      const d = String(r.created_at ?? "").slice(0, 10);
      if (d && (!s.last || d > s.last)) s.last = d;
      acc.set(k, s);
    }
  }
  const out: Record<string, NotifyStat> = {};
  for (const [k, s] of acc) out[k] = { n: s.n, read: s.read, users: s.who.size, last: s.last, n7: s.n7 ?? 0, read7: s.read7 ?? 0 };
  return out;
}

async function reports(admin: Admin): Promise<{ channels: NotifyLive["channels"]; reports: NotifyLive["reports"] }> {
  const [ch, rep] = await Promise.all([
    admin.from("erp_report_channels").select("email, line, popup, discord").eq("id", 1).maybeSingle(),
    admin.from("email_reports").select("id, name, days, send_time, is_active, is_enabled, email_enabled, popup, discord, line").order("created_at"),
  ]);
  if (rep.error) throw new Error(rep.error.message);
  const c = (ch.data ?? {}) as Row;
  const on = (v: unknown) => !!(v && typeof v === "object" && (v as { enabled?: unknown }).enabled === true);
  return {
    channels: { email: c.email !== false, popup: c.popup !== false, discord: c.discord !== false, line: c.line !== false },
    reports: ((rep.data ?? []) as Row[]).map((r) => ({
      id: String(r.id), name: String(r.name ?? "รายงาน"), time: r.send_time ? String(r.send_time) : null,
      days: Array.isArray(r.days) ? (r.days as unknown[]).map(Number).filter((n) => Number.isFinite(n)) : [],
      on: r.is_active !== false && r.is_enabled !== false,
      email: r.email_enabled === true, popup: on(r.popup), discord: on(r.discord), line: on(r.line),
    })),
  };
}

/** หมายเหตุที่แอดมินเขียนเองต่อเรื่อง (china_app_settings ก้อนเดียว) */
async function remarks(admin: Admin): Promise<Record<string, string>> {
  const { data, error } = await admin.from("china_app_settings").select("sval").eq("skey", NOTIFY_REMARKS_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  return cleanNotifyRemarks((data as { sval?: unknown } | null)?.sval);
}

/** สวิตช์กระดิ่งที่โค้ดส่งตรง (lib/bell-switch) — อ่านตรง ไม่ใช้ค่าที่จำไว้ (หน้าเพิ่งกดสลับต้องเห็นทันที) */
async function bellOff(admin: Admin): Promise<Record<string, boolean>> {
  const { data, error } = await admin.from("china_app_settings").select("sval").eq("skey", BELL_SWITCH_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  return cleanBellOff((data as { sval?: unknown } | null)?.sval);
}

/** รวมทุกส่วน — ส่วนไหนล้มใช้ค่าว่าง + จดชื่อใน failed */
export async function buildNotifyLive(admin: Admin): Promise<{ data: NotifyLive; failed: string[] }> {
  const failed: string[] = [];
  const safe = async <T,>(name: string, fn: () => Promise<T>, empty: T): Promise<T> => {
    try { return await fn(); } catch (e) { failed.push(name); console.error(`[flow-map/notify] ${name}:`, e instanceof Error ? e.message : e); return empty; }
  };
  const [line, ruleList, st, push, sh, stat, rep, rem, boff] = await Promise.all([
    safe("line", () => lineState(admin), { token: false, main: false, groups: {}, off: {} }),
    safe("rules", () => rules(admin), []),
    safe("staff", () => staff(admin), { active: 0, linked: 0 }),
    safe("push", () => pushDevices(admin), 0),
    safe("shops", () => shops(admin), { total: 0, line: 0, email: 0, oa: 0 }),
    safe("stats", () => stats(admin), {}),
    safe("reports", () => reports(admin), { channels: { email: true, popup: true, discord: true, line: true }, reports: [] }),
    safe("remarks", () => remarks(admin), {} as Record<string, string>),
    safe("bellOff", () => bellOff(admin), {} as Record<string, boolean>),
  ]);
  return { data: { line, rules: ruleList, staff: st, push, email: emailConfigured(), shops: sh, stats: stat, ...rep, remarks: rem, bellOff: boff }, failed };
}
