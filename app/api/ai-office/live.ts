/**
 * สถานะสดของ "ออฟฟิศทีม AI" (ฝั่ง server) — ที่เดียวที่อ่านหลักฐานการทำงานของผู้ช่วยแต่ละตัว
 * ใช้ที่ /api/ai-office/status · ทะเบียนผู้ช่วย + กติกาตัดสินสถานะอยู่ที่ lib/ai-office.ts
 * อ่านอย่างเดียว · ตัวไหนอ่านไม่สำเร็จ = ไม่มีสถานะ (หน้าจอขึ้น "ยังไม่มีบันทึก") แล้วจดชื่อใน failed ไม่ล้มทั้งหน้า
 * ไม่ส่งค่าลับ (token / รหัส) ออกไป — CRON_SECRET ส่งแค่ว่า "ตั้งแล้วไหม"
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { lazConnHealth } from "@/lib/lazada";
import {
  OFFICE_WORKERS, WORKER_BY_ID, AI_AUDIT_ACTIONS, AI_ACTION_LABEL, WORKER_RUN_PREFIX, CRON_SECRET_FIX,
  cronWorkerLive, aiUsageLive,
  type OfficeLive, type WorkerLive, type OfficeEvent, type WorkerRun, type WorkerStat,
} from "@/lib/ai-office";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null; count?: number | null };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const sinceDays = (now: number, d: number) => new Date(now - d * DAY).toISOString();
const s = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const rows = (r: Res): Row[] => { if (r.error) throw new Error(r.error.message); return (r.data ?? []) as Row[]; };
const count = (r: Res): number => { if (r.error) throw new Error(r.error.message); return r.count ?? 0; };
const maxAt = (list: (string | null | undefined)[]): string | null => list.reduce<string | null>((m, x) => (x && (!m || x > m) ? x : m), null);
const thDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ยังไม่เคย");
const hoursAgo = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / HOUR : null);

/** ผลรอบล่าสุดที่งานตั้งเวลาจดไว้ใน ui_config (lib/ai-office-runs.ts) */
async function readRuns(admin: Admin): Promise<Map<string, WorkerRun>> {
  const list = rows(await admin.from("ui_config").select("key, value").like("key", `${WORKER_RUN_PREFIX}%`));
  return new Map(list.map((r) => [String(r.key).slice(WORKER_RUN_PREFIX.length), r.value as WorkerRun]));
}

/** การใช้ปุ่ม AI 30 วัน จาก audit_logs → ต่อผู้ช่วย + ความเคลื่อนไหว */
async function readAiUsage(admin: Admin, now: number) {
  const actions = Object.values(AI_AUDIT_ACTIONS).flat();
  const list = rows(await admin.from("audit_logs").select("action, created_at, actor:metadata->>actor")
    .in("action", actions).gte("created_at", sinceDays(now, 30)).order("created_at", { ascending: false }).limit(2000));
  const per: Record<string, { n7: number; n30: number; lastAt: string | null }> = {};
  const events: OfficeEvent[] = [];
  const t7 = sinceDays(now, 7);
  for (const [id, acts] of Object.entries(AI_AUDIT_ACTIONS)) {
    const mine = list.filter((r) => acts.includes(String(r.action)));
    per[id] = { n30: mine.length, n7: mine.filter((r) => String(r.created_at) >= t7).length, lastAt: s(mine[0]?.created_at) };
    for (const r of mine.slice(0, 6)) {
      const who = s(r.actor);
      events.push({ at: String(r.created_at), worker: id, tone: "info", text: `${AI_ACTION_LABEL[String(r.action)] ?? String(r.action)}${who ? ` (สั่งโดย ${who})` : ""}` });
    }
  }
  return { per, events };
}

/** หลักฐานจากแจ้งเตือนที่งานตั้งเวลาส่งออกไป (ครั้งล่าสุด + กี่วันที่มีการส่ง) */
async function readNotifyEvidence(admin: Admin, now: number) {
  const types = ["wo.due_soon", "subscription.renewal_soon", "content_album.reminder", "cashflow.low_cash", "perf.regression"];
  const list = rows(await admin.from("erp_notifications").select("event_type, created_at")
    .in("event_type", types).gte("created_at", sinceDays(now, 90)).order("created_at", { ascending: false }).limit(1500));
  const out: Record<string, { last: string | null; days: number }> = {};
  for (const t of types) {
    const mine = list.filter((r) => r.event_type === t);
    out[t] = { last: s(mine[0]?.created_at), days: new Set(mine.map((r) => String(r.created_at).slice(0, 10))).size };
  }
  return out;
}

const notifyStat = (e: { last: string | null; days: number } | undefined): WorkerStat[] => [
  { label: "แจ้งเตือนล่าสุด", value: thDate(e?.last ?? null) },
  { label: "วันที่มีการเตือน (90 วัน)", value: `${e?.days ?? 0} วัน` },
];

export async function buildOfficeLive(admin: Admin, now = Date.now()): Promise<OfficeLive> {
  const cronSecret = !!process.env.CRON_SECRET;
  const workers: Record<string, WorkerLive> = {};
  const events: OfficeEvent[] = [];
  const failed: string[] = [];
  let aiUses30 = 0;
  /** อ่านทีละส่วน — ล้มแล้วจดชื่อไว้ ไม่ทำให้ส่วนอื่นล้ม */
  const part = async (ids: string[], fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.error("[ai-office/live]", ids.join(","), e instanceof Error ? e.message : e); failed.push(...ids); } };

  let runs = new Map<string, WorkerRun>();
  let notif: Awaited<ReturnType<typeof readNotifyEvidence>> = {};
  await Promise.all([
    part(["runs"], async () => { runs = await readRuns(admin); }),
    part(["notify"], async () => { notif = await readNotifyEvidence(admin, now); }),
  ]);
  for (const [id, r] of runs) {
    if (!WORKER_BY_ID[id] || !r?.at) continue;
    events.push({ at: r.at, worker: id, tone: r.ok ? (r.warn ? "wait" : "done") : "error", text: r.ok ? (r.summary || "ทำงานรอบนี้เสร็จ") : `รอบนี้ล้ม: ${r.error || "ไม่ทราบสาเหตุ"}` });
  }
  const cron = (id: string, stats: WorkerStat[] = [], evidenceAt: string | null = null) =>
    cronWorkerLive(WORKER_BY_ID[id], { cronSecret, run: runs.get(id) ?? null, stats, evidenceAt }, now);

  await Promise.all([
    // ── ผู้ปลุกงานตามเวลา ──
    part(["scheduler"], async () => {
      const cronIds = OFFICE_WORKERS.filter((w) => w.cron).map((w) => w.id);
      const fresh = cronIds.filter((id) => { const h = hoursAgo(runs.get(id)?.at ?? null, now); return h != null && h <= 48; }).length;
      const stats = [{ label: "งานที่ต้องปลุก", value: `${cronIds.length} ตัว` }, { label: "รายงานตัวใน 2 วัน", value: `${fresh}/${cronIds.length} ตัว`, tone: fresh === cronIds.length ? "good" as const : "warn" as const }];
      workers.scheduler = !cronSecret
        ? { status: "error", headline: `ปลุกงาน ${cronIds.length} ตัวไม่สำเร็จทุกวัน เพราะยังไม่ได้ตั้งรหัสลับ`, lastAt: null, stats, fix: CRON_SECRET_FIX }
        : fresh === cronIds.length
          ? { status: "ok", headline: `ปลุกงานครบ ${fresh}/${cronIds.length} ตัวใน 2 วันที่ผ่านมา`, lastAt: maxAt(cronIds.map((id) => runs.get(id)?.at)), stats }
          : { status: "warn", headline: `ตั้งรหัสลับแล้ว แต่รายงานตัวแค่ ${fresh}/${cronIds.length} ตัวใน 2 วัน`, lastAt: maxAt(cronIds.map((id) => runs.get(id)?.at)), stats, fix: "ดูการ์ดของงานที่ยังไม่รายงานตัว ถ้าเพิ่งตั้งรหัสลับ รอให้ครบ 1 วันก่อน" };
    }),

    // ── ผู้ส่งรายงานตามเวลา ──
    part(["email-reports"], async () => {
      const [runRes, repRes] = await Promise.all([
        admin.from("email_report_runs").select("report_id, ran_at, trigger, status, sent_count, error").gte("ran_at", sinceDays(now, 7)).order("ran_at", { ascending: false }).limit(500),
        admin.from("email_reports").select("id, name, is_enabled, is_active"),
      ]);
      const list = rows(runRes), reps = rows(repRes);
      const name = new Map(reps.map((r) => [String(r.id), String(r.name ?? "รายงาน")]));
      const enabled = reps.filter((r) => r.is_enabled === true && r.is_active !== false).length;
      const sched = list.filter((r) => r.trigger === "schedule");
      const bad = sched.filter((r) => ["failed", "partial", "not_configured"].includes(String(r.status)));
      const sent = sched.filter((r) => r.status === "sent").length;
      const stats: WorkerStat[] = [{ label: "รายงานที่เปิดใช้", value: `${enabled} รายงาน` }, { label: "ส่งตามรอบใน 7 วัน", value: `${sent} ครั้ง` }, { label: "ไม่สำเร็จใน 7 วัน", value: `${bad.length} ครั้ง`, tone: bad.length ? "bad" : "good" }];
      const lastAt = s(list[0]?.ran_at);
      workers["email-reports"] = !enabled ? { status: "idle", headline: "ยังไม่มีรายงานที่เปิดใช้", lastAt, stats }
        : bad.length ? { status: "warn", headline: `ส่งไม่สำเร็จ ${bad.length} ครั้งใน 7 วัน`, lastAt, stats, fix: "เปิดหน้ารายงานตามเวลา ดูรายงานที่ล้มแล้วกดส่งทดสอบ" }
        : sent ? { status: "ok", headline: `ส่งรายงานแล้ว ${sent} ครั้งใน 7 วัน`, lastAt, stats }
        : { status: "idle", headline: "ยังไม่ถึงรอบส่งในสัปดาห์นี้", lastAt, stats };
      for (const r of list.slice(0, 10)) {
        const ok = ["sent", "skipped_empty"].includes(String(r.status));
        events.push({ at: String(r.ran_at), worker: "email-reports", tone: ok ? "done" : "error",
          text: `${r.status === "skipped_empty" ? "ข้าม (ไม่มีข้อมูล)" : ok ? `ส่ง “${name.get(String(r.report_id)) ?? "รายงาน"}” ถึง ${Number(r.sent_count) || 0} คน` : `ส่ง “${name.get(String(r.report_id)) ?? "รายงาน"}” ไม่สำเร็จ`}${r.trigger !== "schedule" ? " (กดเอง)" : ""}` });
      }
    }),

    // ── ผู้ลบรูปลูกค้าตาม PDPA ──
    part(["print-purge"], async () => {
      const last = rows(await admin.from("store_print_designs").select("uploads_purged_at").not("uploads_purged_at", "is", null).order("uploads_purged_at", { ascending: false }).limit(1));
      const at = s(last[0]?.uploads_purged_at);
      workers["print-purge"] = cron("print-purge", [{ label: "ลบรูปล่าสุด", value: thDate(at) }], at);
    }),

    // ── ผู้อ่านอีเมลออเดอร์ ──
    part(["order-email"], async () => {
      const t24 = sinceDays(now, 1);
      const inbox = () => admin.from("platform_email_inbox").select("id", { count: "exact", head: true }).gte("created_at", t24);
      const [setRes, doneRes, badRes] = await Promise.all([
        admin.from("platform_email_settings").select("enabled, interval_min, last_ping_at, last_received_at").eq("id", 1).maybeSingle(),
        inbox().eq("status", "done"),
        inbox().in("status", ["unreadable", "attention"]),
      ]);
      if (setRes.error) throw new Error(setRes.error.message);
      const st = (setRes.data ?? {}) as Row;
      const done = count(doneRes), bad = count(badRes);
      const ping = s(st.last_ping_at), recv = s(st.last_received_at);
      const silentH = hoursAgo(ping, now);
      const stats: WorkerStat[] = [{ label: "นำเข้าใน 24 ชม.", value: `${done} ฉบับ` }, { label: "อ่านไม่ออก/ต้องดู", value: `${bad} ฉบับ`, tone: bad ? "warn" : "good" }, { label: "Gmail ติดต่อล่าสุด", value: thDate(ping) }];
      workers["order-email"] = st.enabled === false ? { status: "idle", headline: "ปิดการนำเข้าอยู่", lastAt: recv, stats }
        : !ping ? { status: "unknown", headline: "Gmail ยังไม่เคยติดต่อมา", lastAt: null, stats, fix: "ตั้งสคริปต์ Gmail ตามหน้าตั้งค่าอีเมลออเดอร์" }
        : silentH != null && silentH > 6 ? { status: "error", headline: `Gmail เงียบไป ${Math.round(silentH)} ชม.`, lastAt: ping, stats, fix: "เปิดหน้าตั้งค่าอีเมลออเดอร์ แล้วตรวจสคริปต์ใน Gmail ว่ายังทำงานอยู่" }
        : bad ? { status: "warn", headline: `มีอีเมลที่อ่านไม่ออก ${bad} ฉบับใน 24 ชม.`, lastAt: recv ?? ping, stats, fix: "เปิดกล่องอีเมลออเดอร์ แล้วดูฉบับที่ระบบอ่านไม่ออก" }
        : { status: "ok", headline: `นำเข้าออเดอร์ ${done} ฉบับใน 24 ชม.`, lastAt: recv ?? ping, stats };
      if (recv) events.push({ at: recv, worker: "order-email", tone: "done", text: `รับอีเมลออเดอร์ล่าสุด (24 ชม. นำเข้า ${done} ฉบับ)` });
    }),

    // ── ผู้ต่ออายุกุญแจ Lazada ──
    part(["lazada-token"], async () => {
      const { data: p, error: pe } = await admin.from("erp_platforms").select("id").eq("code", "lazada").maybeSingle();
      if (pe) throw new Error(pe.message);
      const lazId = (p as { id?: string } | null)?.id;
      const creds = lazId ? rows(await admin.from("platform_credentials").select("stage:meta->>stage, refresh_expires_at:meta->>refresh_expires_at, expires_at:meta->>expires_at").eq("platform_id", lazId)) : [];
      const h = creds.map((c) => lazConnHealth({ stage: s(c.stage) ?? undefined, refresh_expires_at: Number(c.refresh_expires_at) || undefined, expires_at: Number(c.expires_at) || undefined }, now).state);
      const connected = h.filter((x) => x === "connected").length, expiring = h.filter((x) => x === "expiring").length, expired = h.filter((x) => x === "expired").length;
      const stats: WorkerStat[] = [{ label: "ร้านที่เชื่อมอยู่", value: `${connected} ร้าน`, tone: "good" }, { label: "ใกล้หมดอายุ", value: `${expiring} ร้าน`, tone: expiring ? "warn" : "good" }, { label: "หมดอายุแล้ว", value: `${expired} ร้าน`, tone: expired ? "bad" : "good" }];
      const base = cron("lazada-token", stats);
      if (expired) {
        const fix = `ร้าน Lazada ที่กุญแจหมดอายุ ${expired} ร้าน ต้องเข้าไปกดเชื่อมใหม่ที่หน้าบัญชีแพลตฟอร์ม (ระบบต่ออายุแทนไม่ได้แล้ว)`;
        workers["lazada-token"] = { ...base, status: "error", headline: base.status === "error" && !cronSecret ? `กุญแจหมดอายุแล้ว ${expired} ร้าน และตัวต่ออายุถูกปฏิเสธทุกวัน` : `กุญแจหมดอายุแล้ว ${expired} ร้าน ต้องเชื่อมใหม่`, fix: base.fix && base.fix !== fix ? `${fix} · ${base.fix}` : fix };
      } else workers["lazada-token"] = base;
    }),

    // ── AI ใช้ตามปุ่ม + รายการที่รอคน ──
    part(["line-order-ai", "seller-bill-ai", "ai-caption", "ai-planner", "design-line-ai"], async () => {
      const [ai, capRes, inboxRes] = await Promise.all([
        readAiUsage(admin, now),
        admin.from("purchase_order_captures").select("status, updated_at, ai_error").order("updated_at", { ascending: false }).limit(300),
        admin.from("design_sheet_line_inbox").select("status, created_at, ai_read_at, ai_error").order("created_at", { ascending: false }).limit(300),
      ]);
      events.push(...ai.events);
      aiUses30 = Object.values(ai.per).reduce((sum, x) => sum + x.n30, 0);
      for (const id of ["seller-bill-ai", "ai-caption", "ai-planner"]) workers[id] = aiUsageLive(ai.per[id], now);

      const caps = rows(capRes);
      const pending = caps.filter((r) => r.status === "pending").length;
      const capErr = caps.filter((r) => r.ai_error && String(r.updated_at) >= sinceDays(now, 30)).length;
      const lo = aiUsageLive({ ...ai.per["line-order-ai"], stats: [{ label: "รอคนยืนยัน", value: `${pending} รายการ`, tone: pending ? "warn" : "good" }, { label: "AI อ่านพลาดใน 30 วัน", value: `${capErr} ครั้ง`, tone: capErr ? "warn" : "good" }] }, now);
      workers["line-order-ai"] = pending
        ? { ...lo, status: "warn", headline: `มีรายการรอคนยืนยัน ${pending} รายการ`, lastAt: lo.lastAt ?? s(caps[0]?.updated_at), fix: "เปิดหน้าออเดอร์จาก LINE แล้วยืนยันหรือปฏิเสธรายการที่ค้าง" }
        : { ...lo, lastAt: lo.lastAt ?? s(caps[0]?.updated_at) };

      const inbox = rows(inboxRes);
      const wait = inbox.filter((r) => r.status === "pending").length;
      const lastIn = s(inbox[0]?.created_at);
      const dStats: WorkerStat[] = [{ label: "รอแปลงเป็นใบงาน", value: `${wait} รายการ`, tone: wait ? "warn" : "good" }, { label: "รับงานล่าสุด", value: thDate(lastIn) }, { label: "รับทั้งหมด", value: `${inbox.length} รายการ` }];
      const inH = hoursAgo(lastIn, now);
      workers["design-line-ai"] = wait ? { status: "warn", headline: `มีงานรอแปลงเป็นใบงาน ${wait} รายการ`, lastAt: lastIn, stats: dStats, fix: "เปิดแดชบอร์ดงานออกแบบ แล้วแปลงหรือปฏิเสธรายการในกล่อง LINE" }
        : inH != null && inH <= 24 * 30 ? { status: "ok", headline: `รับงานล่าสุด ${thDate(lastIn)}`, lastAt: lastIn, stats: dStats }
        : { status: "idle", headline: lastIn ? "ไม่มีงานส่งเข้ามาใน 30 วัน" : "ยังไม่เคยมีงานส่งเข้ามา", lastAt: lastIn, stats: dStats };
      for (const r of inbox.slice(0, 3)) events.push({ at: String(r.created_at), worker: "design-line-ai", tone: r.status === "pending" ? "wait" : "done", text: r.status === "pending" ? "รับงานออกแบบจาก LINE รอคนแปลงเป็นใบงาน" : "รับงานออกแบบจาก LINE" });
      for (const r of caps.filter((x) => x.status === "pending").slice(0, 3)) events.push({ at: String(r.updated_at), worker: "line-order-ai", tone: "wait", text: "ร่างรายการสั่งซื้อจาก LINE รอคนยืนยัน" });
    }),

    // ── ผู้ซิงก์สต๊อก ──
    part(["stock-sync"], async () => {
      const list = rows(await admin.from("stock_sync_channels").select("label, provider, last_import_at, is_active").eq("is_active", true));
      const last = maxAt(list.map((r) => s(r.last_import_at)));
      const stats: WorkerStat[] = [{ label: "ช่องทางที่เปิด", value: `${list.length} ช่อง` }, { label: "นำเข้าล่าสุด", value: thDate(last) }];
      const h = hoursAgo(last, now);
      workers["stock-sync"] = !list.length ? { status: "idle", headline: "ยังไม่ได้ตั้งช่องทางซิงก์", lastAt: null, stats }
        : !last ? { status: "idle", headline: `ตั้งช่องทางไว้ ${list.length} ช่อง แต่ยังไม่เคยนำเข้าไฟล์`, lastAt: null, stats }
        : h != null && h > 24 * 7 ? { status: "idle", headline: `นำเข้าล่าสุด ${Math.floor(h / 24)} วันก่อน`, lastAt: last, stats }
        : { status: "ok", headline: `นำเข้าล่าสุด ${thDate(last)}`, lastAt: last, stats };
    }),

    // ── คิวโพสต์ ──
    part(["social-publish"], async () => {
      const list = rows(await admin.from("social_publish_jobs").select("status, platform, run_at, updated_at, posted_at, last_error").order("updated_at", { ascending: false }).limit(500));
      const t7 = sinceDays(now, 7);
      const queued = list.filter((r) => r.status === "queued").length;
      const stuck = list.filter((r) => r.status === "queued" && s(r.run_at) && Date.parse(String(r.run_at)) < now - 30 * 60_000).length;
      const failed7 = list.filter((r) => r.status === "failed" && String(r.updated_at) >= t7).length;
      const posted7 = list.filter((r) => r.status === "posted" && String(r.posted_at ?? r.updated_at) >= t7).length;
      const stats: WorkerStat[] = [{ label: "รอโพสต์", value: `${queued} โพสต์` }, { label: "โพสต์แล้วใน 7 วัน", value: `${posted7} โพสต์` }, { label: "ล้มใน 7 วัน", value: `${failed7} โพสต์`, tone: failed7 ? "bad" : "good" }];
      const lastAt = s(list[0]?.updated_at);
      workers["social-publish"] = stuck ? { status: "error", headline: `โพสต์ค้างในคิวเลยเวลา ${stuck} โพสต์`, lastAt, stats, fix: "ตรวจว่าตัวตั้งเวลาในฐานข้อมูลยังเรียกคิวโพสต์อยู่ และการเชื่อม Facebook ยังไม่หมดอายุ" }
        : failed7 ? { status: "warn", headline: `โพสต์ไม่สำเร็จ ${failed7} โพสต์ใน 7 วัน`, lastAt, stats, fix: "เปิดคิวโพสต์ในหน้าคอนเทนต์ ดูสาเหตุแล้วกดลองใหม่" }
        : !list.length ? { status: "idle", headline: "ยังไม่มีโพสต์ในคิว (เครื่องตั้งเวลาเดินทุก 5 นาที)", lastAt: null, stats }
        : posted7 || queued ? { status: "ok", headline: queued ? `รอโพสต์ ${queued} โพสต์ตามเวลา` : `โพสต์แล้ว ${posted7} โพสต์ใน 7 วัน`, lastAt, stats }
        : { status: "idle", headline: "ไม่มีโพสต์ในคิวช่วงนี้", lastAt, stats };
      for (const r of list.slice(0, 6)) {
        const st = String(r.status);
        events.push({ at: String(r.updated_at), worker: "social-publish", tone: st === "posted" ? "done" : st === "failed" ? "error" : "wait",
          text: st === "posted" ? `โพสต์ขึ้น ${String(r.platform ?? "")} แล้ว` : st === "failed" ? `โพสต์ขึ้น ${String(r.platform ?? "")} ไม่สำเร็จ` : `เข้าคิวโพสต์ ${String(r.platform ?? "")}` });
      }
    }),

    // ── งานตั้งเวลาที่ดูหลักฐานจากแจ้งเตือน/คลังรูป ──
    part(["wo-due-soon", "album-reminders", "cashflow-alert", "subscriptions", "perf-watch"], async () => {
      workers["wo-due-soon"] = cron("wo-due-soon", notifyStat(notif["wo.due_soon"]), notif["wo.due_soon"]?.last ?? null);
      workers["album-reminders"] = cron("album-reminders", notifyStat(notif["content_album.reminder"]), notif["content_album.reminder"]?.last ?? null);
      workers["cashflow-alert"] = cron("cashflow-alert", notifyStat(notif["cashflow.low_cash"]), notif["cashflow.low_cash"]?.last ?? null);
      workers.subscriptions = cron("subscriptions", notifyStat(notif["subscription.renewal_soon"]), notif["subscription.renewal_soon"]?.last ?? null);
      workers["perf-watch"] = cron("perf-watch", notifyStat(notif["perf.regression"]), notif["perf.regression"]?.last ?? null);
    }),
    part(["drive-check", "look-hash"], async () => {
      const [missRes, noHashRes] = await Promise.all([
        admin.from("assets").select("id", { count: "exact", head: true }).not("drive_missing_at", "is", null),
        admin.from("assets").select("id", { count: "exact", head: true }).eq("status", "active").eq("asset_type", "image").is("phash", null),
      ]);
      const miss = count(missRes), noHash = count(noHashRes);
      workers["drive-check"] = cron("drive-check", [{ label: "ไฟล์ที่ถูกทำเครื่องหมายว่าหาย", value: `${miss} ไฟล์`, tone: miss ? "warn" : "good" }]);
      workers["look-hash"] = cron("look-hash", [{ label: "รูปที่ยังไม่มีลายนิ้วมือ", value: `${noHash.toLocaleString("th-TH")} รูป`, tone: noHash ? "warn" : "good" }]);
    }),

    // ── ผู้คำนวณเงินเดือน ──
    part(["payroll-calc"], async () => {
      const list = rows(await admin.from("erp_jobs").select("status, created_at, updated_at, error").eq("type", "payroll_calc").gte("created_at", sinceDays(now, 30)).order("created_at", { ascending: false }).limit(300));
      const err = list.filter((r) => r.status === "error").length;
      const running = list.filter((r) => r.status === "running" || r.status === "queued").length;
      const done = list.filter((r) => r.status === "done").length;
      const lastAt = s(list[0]?.updated_at ?? list[0]?.created_at);
      const stats: WorkerStat[] = [{ label: "คำนวณสำเร็จใน 30 วัน", value: `${done} ครั้ง` }, { label: "ล้มใน 30 วัน", value: `${err} ครั้ง`, tone: err ? "bad" : "good" }];
      workers["payroll-calc"] = err ? { status: "warn", headline: `คำนวณล้ม ${err} ครั้งใน 30 วัน`, lastAt, stats, fix: "เปิดหน้างวดเงินเดือน แล้วกดคำนวณใหม่ ถ้ายังล้มให้แจ้งทีมพัฒนา" }
        : running ? { status: "ok", headline: `กำลังคำนวณ ${running} งาน`, lastAt, stats }
        : done ? { status: "ok", headline: `คำนวณสำเร็จ ${done} ครั้งใน 30 วัน`, lastAt, stats }
        : { status: "idle", headline: "ยังไม่มีการคำนวณใน 30 วัน", lastAt, stats };
      const last = list[0];
      if (last) events.push({ at: String(last.updated_at ?? last.created_at), worker: "payroll-calc", tone: last.status === "error" ? "error" : last.status === "done" ? "done" : "wait", text: last.status === "error" ? "คำนวณเงินเดือนไม่สำเร็จ" : last.status === "done" ? "คำนวณเงินเดือนเสร็จ" : "กำลังคำนวณเงินเดือน" });
    }),
  ]);

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { workers, events: events.slice(0, 40), cronSecret, aiUses30, failed, at: new Date(now).toISOString() };
}
