/**
 * 🔔 ป๊อปเตือนงานตอนเข้า ERP (ช่องทางที่ 3 ของรายงาน ต่อจากอีเมล/Discord) — ฝั่งเซิร์ฟเวอร์
 * เนื้อหา = รายงานเดียวกับอีเมล (buildReport) · "งานของคุณ" = ข้อเช็กลิสต์ค้างที่ใส่ชื่อคนนั้น ขึ้นก่อนเสมอ
 * ใครเห็น (normalizeReportPopup):
 *   ตำแหน่ง/รายคนที่เลือก → เห็นทั้งป๊อป (งานของคุณ + ต้องตามวันนี้)
 *   ผู้รับผิดชอบข้อที่ค้าง (ถ้าเปิด assignees) → เห็นเฉพาะ "งานของคุณ"
 * เมื่อไหร่: รายงานเปิดใช้อยู่ + สวิตช์ทั้งระบบ "ERP ป๊อป" เปิด · วันส่งของรายงาน · ช่วงเวลา from–to (ไทย) · daily = กดรับทราบแล้ววันนั้นไม่เด้งอีก / every = ทุกครั้งที่เปิด ERP
 * ที่เก็บรับทราบ: erp_popup_acks (ack / later) · หน้าจอ: components/work-popup
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { buildReport, SOURCE_CHECKLIST_MODULE } from "@/lib/email-report/sources";
import { normalizeReportPopup, type EmailReport, type EmailReportPopup } from "@/lib/email-report/shared";
import { nowTH } from "@/lib/email-report/send";
import { loadReportChannels } from "@/lib/email-report/channels";
import type { BuiltReport, ReportTone } from "@/lib/email-report/render";

type Admin = ReturnType<typeof supabaseAdmin>;

export type WorkPopupFlag = { text: string; tone: ReportTone };
/** งานของคุณ: 1 ใบ + ข้อที่ค้างซึ่งใส่ชื่อคุณ (ติ๊กเสร็จในป๊อปได้) */
export type WorkPopupMine = { id: string; title: string; code: string | null; path: string; imageUrl: string | null; flag: WorkPopupFlag; tasks: { id: string; title: string }[] };
export type WorkPopupItem = { id: string; title: string; code: string | null; path: string; imageUrl: string | null; flag: WorkPopupFlag; waiting: string[] };
export type WorkPopupPayload = {
  report_id: string;
  heading: string;
  /** all = เห็นทั้งป๊อป · mine = เห็นเฉพาะงานของตัวเอง (ผู้รับผิดชอบที่ไม่ได้อยู่ในตำแหน่งที่เลือก) */
  audience: "all" | "mine";
  require_ack: boolean;
  date: string;
  stats: { total: number; overdue: number; due_soon: number; waiting: number };
  mine: WorkPopupMine[];
  /** ต้องตามวันนี้ (เกิน/ใกล้กำหนด แล้วตามด้วยใบที่มีของรอ) — ไม่ซ้ำกับงานของคุณ · ปิด only_alert = ทุกงานเรียงด่วนก่อน */
  urgent: WorkPopupItem[];
  urgent_label: string;
  /** ต้องตามที่เหลือ (ไม่ได้โชว์) */
  more: number;
  view_all: string | null;
};

const URGENT_MAX = 8;
const BUILD_TTL = 60_000;   // คนเข้า ERP พร้อมกันตอนเช้า → ประกอบรายงานครั้งเดียวต่อนาที
const buildCache = new Map<string, { at: number; built: BuiltReport }>();

async function cachedBuild(admin: Admin, r: Pick<EmailReport, "id" | "source_key" | "filters" | "options">, fresh: boolean) {
  const key = JSON.stringify([r.id, r.source_key, r.filters, r.options]);
  const hit = buildCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < BUILD_TTL) return hit.built;
  const built = await buildReport(admin, r);
  if (buildCache.size > 20) buildCache.clear();
  buildCache.set(key, { at: Date.now(), built });
  return built;
}

/** ข้อเช็กลิสต์ค้างที่ใส่ชื่อคนนี้ (record_id → ข้อ) */
async function myOpenTasks(admin: Admin, moduleKey: string, userId: string, recordIds?: string[]) {
  let q = admin.from("erp_record_tasks").select("id, record_id, title").eq("module_key", moduleKey).eq("assigned_to", userId).eq("status", "open")
    .order("created_at", { ascending: true }).limit(500);
  if (recordIds) q = q.in("record_id", recordIds);
  const { data } = await q;
  const by = new Map<string, { id: string; title: string }[]>();
  for (const t of (data ?? []) as { id: string; record_id: string; title: string }[]) (by.get(t.record_id) ?? by.set(t.record_id, []).get(t.record_id)!).push({ id: t.id, title: t.title });
  return by;
}

const inWindow = (cfg: EmailReportPopup, hm: string) => hm >= cfg.from && hm < cfg.to;

/** ประกอบเนื้อหาป๊อปของรายงานหนึ่ง สำหรับผู้ใช้หนึ่งคน (null = ไม่ต้องเด้ง) */
export async function buildPopupPayload(admin: Admin, report: Pick<EmailReport, "id" | "name" | "source_key" | "filters" | "options" | "popup">,
  userId: string, audience: "all" | "mine", opts: { fresh?: boolean; force?: boolean } = {}): Promise<WorkPopupPayload | null> {
  const cfg = normalizeReportPopup(report.popup);
  const built = await cachedBuild(admin, report, !!opts.fresh);
  const items = built.popup?.items ?? [];
  const moduleKey = built.checklist?.moduleKey ?? SOURCE_CHECKLIST_MODULE[report.source_key];
  const mineBy = moduleKey && items.length ? await myOpenTasks(admin, moduleKey, userId, items.map((i) => i.id)) : new Map<string, { id: string; title: string }[]>();
  const mine: WorkPopupMine[] = items.filter((i) => mineBy.has(i.id))
    .map((i) => ({ id: i.id, title: i.title, code: i.code, path: i.path, imageUrl: i.imageUrl, flag: i.flag, tasks: mineBy.get(i.id)! }));

  const follow = items.filter((i) => (i.urgent || i.waiting.length > 0) && !mineBy.has(i.id));
  const stats = {
    total: built.total,
    overdue: items.filter((i) => i.overdue).length,
    due_soon: items.filter((i) => i.urgent && !i.overdue).length,
    waiting: items.filter((i) => i.waiting.length > 0).length,
  };
  if (!opts.force) {
    if (audience === "mine" && mine.length === 0) return null;
    if (audience === "all" && (cfg.only_alert ? follow.length + mine.length === 0 : built.total === 0)) return null;
  }
  const urgent = audience === "all"
    ? (cfg.only_alert ? follow : items.filter((i) => !mineBy.has(i.id))).slice(0, URGENT_MAX)
      .map((i) => ({ id: i.id, title: i.title, code: i.code, path: i.path, imageUrl: i.imageUrl, flag: i.flag, waiting: i.waiting }))
    : [];
  const pool = audience === "all" ? (cfg.only_alert ? follow.length : items.length - mine.length) : 0;
  return {
    report_id: report.id, heading: built.heading, audience, require_ack: cfg.require_ack, date: nowTH().date,
    stats, mine, urgent, urgent_label: cfg.only_alert ? "🔥 ต้องตามวันนี้" : "📋 งานค้าง (ด่วนก่อน)",
    more: Math.max(0, pool - urgent.length), view_all: built.popup?.viewAllPath ?? null,
  };
}

type ReportRow = Pick<EmailReport, "id" | "name" | "source_key" | "filters" | "options" | "days" | "popup">;

/**
 * ป๊อปที่ผู้ใช้คนนี้ต้องเห็นตอนนี้
 * reportId = เปิดจากกระดิ่ง ("ไว้ทีหลัง") → ข้ามเงื่อนไขเวลา/รับทราบ แต่ยังต้องเป็นคนที่ควรเห็น
 */
export async function activePopupsFor(admin: Admin, userId: string, opts: { reportId?: string; now?: Date } = {}): Promise<WorkPopupPayload[]> {
  const { data: prof } = await admin.from("user_profiles").select("role, active").eq("id", userId).maybeSingle();
  const p = prof as { role?: string | null; active?: boolean | null } | null;
  if (!p || p.active === false) return [];

  // สวิตช์ทั้งระบบ "ERP ป๊อป" ปิด = ไม่มีป๊อปเลย · รายงานต้อง "เปิดใช้" อยู่ (is_enabled)
  if (!(await loadReportChannels(admin)).popup) return [];
  let q = admin.from("email_reports").select("id, name, source_key, filters, options, days, popup").eq("is_active", true).eq("is_enabled", true).order("created_at", { ascending: true });
  if (opts.reportId) q = q.eq("id", opts.reportId);
  const { data } = await q;
  const n = nowTH(opts.now);
  const candidates = ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ ...(r as unknown as ReportRow), popup: normalizeReportPopup(r.popup) }))
    .filter((r) => r.popup.enabled && (opts.reportId || (r.days.map(Number).includes(n.dow) && inWindow(r.popup, n.hm))));
  if (!candidates.length) return [];

  // daily = รับทราบแล้ววันนี้ไม่เด้งอีก
  const acked = new Set<string>();
  if (!opts.reportId) {
    const { data: acks } = await admin.from("erp_popup_acks").select("report_id").eq("user_id", userId).eq("ack_date", n.date).eq("action", "ack")
      .in("report_id", candidates.map((r) => r.id));
    for (const a of (acks ?? []) as { report_id: string }[]) acked.add(a.report_id);
  }

  const out: WorkPopupPayload[] = [];
  for (const r of candidates) {
    if (r.popup.frequency === "daily" && acked.has(r.id)) continue;
    const listed = (!!p.role && r.popup.roles.includes(p.role)) || r.popup.users.some((u) => u.id === userId);
    if (!listed) {
      if (!r.popup.assignees) continue;
      // เช็กถูก ๆ ก่อน: คนนี้มีข้อค้างที่ใส่ชื่อไว้ไหม (ไม่มี = ไม่ต้องประกอบรายงาน)
      const mod = SOURCE_CHECKLIST_MODULE[r.source_key];
      if (!mod || (await myOpenTasks(admin, mod, userId)).size === 0) continue;
    }
    try {
      const payload = await buildPopupPayload(admin, r, userId, listed ? "all" : "mine", { force: !!opts.reportId });
      if (payload) out.push(payload);
    } catch (e) { console.error("[popup] build", r.id, e); }   // รายงานหนึ่งพัง ไม่ให้ป๊อปอื่นหาย
  }
  return out;
}
