/**
 * 📥 ดึงออเดอร์จากเมล แบบ "ERP ดึงเอง" — อ่าน Gmail ผ่านการเชื่อม Gmail ของกลาง (lib/gmail-api · ตาราง gmail_connections)
 * เจ้าของเลือก 2026-11-27: กล่อง IG International = ERP ดึงเอง · กล่อง Louis Montini = สคริปต์ใน Gmail แบบเดิม (ทำงานคู่กันได้)
 *
 * ทำงานยังไง (ทุกรอบ 15 นาที ต่อท้ายตัวดึงออเดอร์ /api/cron/tiktok-orders · หรือกด "ดึงตอนนี้"/"ดึงย้อนหลัง" ที่แท็บตั้งค่า)
 *   ค้นเมลด้วยคำค้นเดียวกับสคริปต์ + after:<เวลา> → ตัดรหัสเมลที่เคยรับแล้ว (platform_email_inbox.message_id)
 *   → อ่านเนื้อเมลทีละฉบับ (เก่า→ใหม่ เพื่อให้เมลยกเลิก/ชำระเงินเรียงถูก) → ตัวอ่านกลาง processInbound (กฎเดียวกับสคริปต์ทุกอย่าง)
 *   ออเดอร์ซ้ำข้ามกล่อง (เช่น ยังมีเมลส่งต่อค้าง) ไม่นับซ้ำ: ตัวบันทึกเช็กเลขออเดอร์อยู่แล้ว ("มีออเดอร์อยู่แล้ว — ไม่บันทึกซ้ำ")
 * ค่าตั้ง = platform_email_settings.pull_boxes · ผลรอบล่าสุด = ui_config `email_pull:<email>` (แยกกัน กันเขียนทับ)
 * ⚠️ อ่านอย่างเดียว (สิทธิ์ gmail.readonly) — ไม่ติดป้าย/ไม่ลบเมลใน Gmail
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import { getGmailToken, gmailGetMessageContent, gmailSearchAll, normEmail } from "@/lib/gmail-api";
import { sendPullProblemAlerts } from "@/lib/order-pull-server";
import { DEFAULT_SEARCH_QUERY, loadEmailSettings, loadPlatformIds, processInbound } from "./server";

export type PullBox = { email: string; label: string; enabled: boolean; added_at: string };
export type PullBoxRun = {
  at: string; ok: boolean; error?: string; manual?: boolean;
  fetched: number; created: number; remaining: number;
  last_ok_at: string | null; fails: number;
  /** หมดอายุ/ถูกยกเลิก → ต้องกดเชื่อมใหม่ */
  reconnect?: boolean;
};
export type PullResult = { ok: boolean; error: string | null; reconnect: boolean; found: number; fetched: number; created: number; remaining: number };

export const PULL_RUN_PREFIX = "email_pull:";
export const pullRunKey = (email: string) => `${PULL_RUN_PREFIX}${normEmail(email)}`;
export const SETTINGS_PATH = "/admin/platform-email?tab=settings";
/** รอบอัตโนมัติ: ย้อนจากรอบที่สำเร็จล่าสุด 6 ชม. (เผื่อเมลมาช้า) แต่ไม่เกิน 3 วัน · ไม่เคยสำเร็จ = 3 วัน */
const AUTO_OVERLAP_SEC = 6 * 3600;
const AUTO_MAX_SEC = 3 * 86400;
const ALERT_FAILS = 2;

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** อ่านรายการกล่องจากค่าในฐานข้อมูล (กันค่าพัง/ซ้ำ) — pure */
export function normalizeBoxes(v: unknown): PullBox[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: PullBox[] = [];
  for (const raw of v) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const email = normEmail(typeof r.email === "string" ? r.email : "");
    if (!isEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email, label: typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 80) : email,
      enabled: r.enabled !== false, added_at: typeof r.added_at === "string" ? r.added_at : new Date(0).toISOString(),
    });
  }
  return out;
}

/** คำค้น Gmail ของรอบนี้ = คำค้นเดียวกับสคริปต์ + ตั้งแต่เวลา sinceSec — pure */
export function pullQuery(base: string | null | undefined, sinceSec: number): string {
  const q = (base ?? "").trim() || DEFAULT_SEARCH_QUERY;
  return `${q} after:${Math.max(0, Math.floor(sinceSec))}`;
}

/** รอบอัตโนมัติควรย้อนถึงเมื่อไร (วินาที) — pure */
export function autoSinceSec(lastOkAt: string | null | undefined, nowMs = Date.now()): number {
  const now = Math.floor(nowMs / 1000);
  const t = lastOkAt ? Date.parse(lastOkAt) : NaN;
  if (!Number.isFinite(t)) return now - AUTO_MAX_SEC;
  return Math.max(now - AUTO_MAX_SEC, Math.floor(t / 1000) - AUTO_OVERLAP_SEC);
}

/** กระดิ่งของกล่องที่มีปัญหา — pure */
export function boxAlerts(boxes: readonly PullBox[], runs: Readonly<Record<string, PullBoxRun | null | undefined>>): { key: string; title: string; body: string }[] {
  const out: { key: string; title: string; body: string }[] = [];
  for (const b of boxes) {
    if (!b.enabled) continue;
    const r = runs[b.email];
    if (!r || r.ok) continue;
    if (r.reconnect) out.push({ key: `mail-reconnect:${b.email}`, title: `ดึงออเดอร์จากเมล (${b.label}): การเชื่อม Gmail หลุด`, body: "เปิดแท็บตั้งค่า แล้วกด เชื่อม Gmail ใหม่ — ระหว่างนี้ออเดอร์จากกล่องนี้ไม่เข้า" });
    else if (r.fails >= ALERT_FAILS) out.push({ key: `mail-fail:${b.email}`, title: `ดึงออเดอร์จากเมล (${b.label}): ดึงไม่สำเร็จ ${r.fails} รอบติด`, body: r.error || "ไม่ทราบสาเหตุ" });
  }
  return out;
}

type Admin = SupabaseClient;

export async function loadPullBoxes(admin: Admin): Promise<PullBox[]> {
  const { data } = await admin.from("platform_email_settings").select("pull_boxes").eq("id", 1).maybeSingle();
  return normalizeBoxes((data as { pull_boxes?: unknown } | null)?.pull_boxes);
}

export async function loadPullRuns(admin: Admin, emails: string[]): Promise<Record<string, PullBoxRun | null>> {
  const out: Record<string, PullBoxRun | null> = Object.fromEntries(emails.map((e) => [e, null]));
  if (!emails.length) return out;
  const { data } = await admin.from("ui_config").select("key, value").in("key", emails.map(pullRunKey));
  for (const r of (data ?? []) as { key: string; value: PullBoxRun }[]) out[r.key.slice(PULL_RUN_PREFIX.length)] = r.value;
  return out;
}

async function recordRun(admin: Admin, email: string, r: Omit<PullBoxRun, "at" | "last_ok_at" | "fails">): Promise<void> {
  try {
    const key = pullRunKey(email);
    const { data } = await admin.from("ui_config").select("value").eq("key", key).maybeSingle();
    const prev = ((data as { value?: PullBoxRun } | null)?.value ?? null) as PullBoxRun | null;
    const at = new Date().toISOString();
    const value: PullBoxRun = { ...r, at, last_ok_at: r.ok ? at : prev?.last_ok_at ?? null, fails: r.ok ? 0 : (prev?.fails ?? 0) + 1 };
    if (value.error) value.error = value.error.slice(0, 300);
    await admin.from("ui_config").upsert({ key, value, updated_at: at }, { onConflict: "key" });
  } catch (e) { console.error("[email-pull] record", email, e instanceof Error ? e.message : e); }
}

/** ดึง 1 กล่อง: เมลตั้งแต่ sinceSec ที่ยังไม่เคยรับ (ทำได้ในงบเวลา · ที่เหลือรอบหน้า/กดต่อ) */
export async function pullMailbox(admin: Admin, box: PullBox, opts: { sinceSec: number; budgetMs: number; manual?: boolean; actorId?: string | null; actorName?: string | null; maxIds?: number }): Promise<PullResult> {
  const started = Date.now();
  const empty = { found: 0, fetched: 0, created: 0, remaining: 0 };
  const fail = async (error: string, reconnect = false): Promise<PullResult> => {
    await recordRun(admin, box.email, { ok: false, error, reconnect, manual: opts.manual, fetched: 0, created: 0, remaining: 0 });
    return { ok: false, error, reconnect, ...empty };
  };
  const settings = await loadEmailSettings(admin);
  if (settings.enabled === false) return { ok: false, error: "ปิดการรับเมลไว้ในหน้าตั้งค่า", reconnect: false, ...empty };

  const tok = await getGmailToken(admin, box.email);
  if ("error" in tok) return fail(tok.message, tok.error === "reconnect" || tok.error === "not_connected");

  const search = await gmailSearchAll(tok.token, pullQuery(settings.search_query as string | null, opts.sinceSec), opts.maxIds ?? 1000);
  if (search.error) return fail(`ค้นเมลใน Gmail ไม่สำเร็จ: ${search.error}`);

  // ตัดเมลที่เคยรับแล้ว (ทางไหนก็ได้ — รหัสเมลเดียวกันในกล่องเดียวกัน)
  const seen = new Set<string>();
  for (let i = 0; i < search.ids.length; i += 200) {
    const part = search.ids.slice(i, i + 200);
    const { data } = await admin.from("platform_email_inbox").select("message_id").in("message_id", part);
    for (const r of (data ?? []) as { message_id: string }[]) seen.add(r.message_id);
  }
  const todo = search.ids.filter((id) => !seen.has(id)).reverse();   // Gmail ให้ใหม่สุดก่อน → ทำเก่าก่อน

  const ctx = { shops: settings.shops, platformIds: await loadPlatformIds(admin), source: box.email };
  const tally: Record<string, number> = {};
  let fetched = 0, created = 0, readErr = 0;
  for (const id of todo) {
    if (Date.now() - started > opts.budgetMs) break;
    const m = await gmailGetMessageContent(tok.token, id);
    if (!m) { readErr++; fetched++; continue; }
    const out = await processInbound(admin, { id: m.id, from: m.from, subject: m.subject, date: m.date, html: m.html, text: m.text }, ctx);
    fetched++;
    tally[out.status] = (tally[out.status] ?? 0) + 1;
    if (out.created) created++;
  }
  const remaining = todo.length - fetched + (search.more ? 1 : 0);
  const processed = fetched - readErr;

  if (processed > 0) {
    // หน้าสถานะดึงออเดอร์ (ร้านที่เข้าทางเมล) ดูเวลานี้
    await admin.from("platform_email_settings").update({ last_received_at: new Date().toISOString() }).eq("id", 1);
  }
  if (processed > 0 || opts.manual) {
    await writeAudit(admin, {
      action: "import", entityType: "platform_email", entityId: null,
      actorId: opts.actorId ?? null, actorName: opts.actorName ?? "ERP ดึงจาก Gmail",
      metadata: { mailbox: box.email, manual: !!opts.manual, found: todo.length, received: processed, orders_created: created, read_errors: readErr, ...tally },
    });
  }
  const error = readErr ? `อ่านเมลไม่ได้ ${readErr} ฉบับ (จะลองใหม่รอบหน้า)` : null;
  // อ่านไม่ได้ทุกฉบับ = นับว่าล้ม · อ่านได้บางส่วน = สำเร็จ (ฉบับที่พลาดไม่ถูกจด → รอบหน้าหยิบใหม่เอง)
  const ok = !(readErr > 0 && processed === 0);
  await recordRun(admin, box.email, { ok, ...(error ? { error } : {}), manual: opts.manual, fetched: processed, created, remaining });
  return { ok, error, reconnect: false, found: todo.length, fetched: processed, created, remaining };
}

/** รอบอัตโนมัติ: ทุกกล่องที่เปิดอยู่ (แบ่งงบเวลา) + กระดิ่งกล่องที่มีปัญหา */
export async function pullAllBoxes(admin: Admin, budgetMs: number): Promise<{ boxes: number; created: number; failed: string[]; alerts: number }> {
  const boxes = (await loadPullBoxes(admin)).filter((b) => b.enabled);
  if (!boxes.length) return { boxes: 0, created: 0, failed: [], alerts: 0 };
  const started = Date.now();
  const runs = await loadPullRuns(admin, boxes.map((b) => b.email));
  let created = 0;
  const failed: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const left = budgetMs - (Date.now() - started);
    if (left < 5_000) break;
    const b = boxes[i];
    const r = await pullMailbox(admin, b, { sinceSec: autoSinceSec(runs[b.email]?.last_ok_at), budgetMs: Math.floor(left / (boxes.length - i)) });
    created += r.created;
    if (!r.ok) failed.push(`${b.label}: ${r.error}`);
  }
  const after = await loadPullRuns(admin, boxes.map((b) => b.email));
  const alerts = await sendPullProblemAlerts(admin, boxAlerts(boxes, after), SETTINGS_PATH);
  return { boxes: boxes.length, created, failed, alerts };
}
