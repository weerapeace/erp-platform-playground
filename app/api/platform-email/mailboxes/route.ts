/**
 * 📥 กล่องเมลที่ให้ ERP ดึงเอง — /api/platform-email/mailboxes (แท็บ "ตั้งค่า" หน้า /admin/platform-email)
 *
 *  GET  (platform_orders.manage)   → { boxes: [{ ...PullBox, run, connected, conn_error }], gmail_configured, script: { last_ping_at, last_received_at } }
 *  POST (platform_orders.manage) { action, ... }
 *    add     { email, label }              เพิ่มกล่อง (ยังไม่เชื่อม Gmail ก็เพิ่มได้ — กดเชื่อมทีหลัง)
 *    update  { email, label?, enabled? }   แก้ชื่อ / พักการดึง
 *    remove  { email }                     เอาออกจากรายการ (ไม่ลบการเชื่อม Gmail — ระบบอื่นอาจใช้อยู่ เช่น บิลค่าบริการ) → คืน box ไว้กดย้อนกลับ
 *    restore { box }                       ย้อนกลับการเอาออก
 *    pull    { email, days? }              ดึงตอนนี้ (ไม่ใส่ days = ตั้งแต่รอบที่สำเร็จล่าสุด) · days = ย้อนหลัง N วัน ทำได้ ~45 วิ/ครั้ง → remaining > 0 กดต่อได้
 *  ทุกการแก้ลง audit (changes: auditDiff) · ตัวดึง lib/platform-email/pull
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { gmailConfigured, listGmailConnections, normEmail } from "@/lib/gmail-api";
import { autoSinceSec, loadPullBoxes, loadPullRuns, normalizeBoxes, pullMailbox, type PullBox } from "@/lib/platform-email/pull";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const PULL_BUDGET_MS = 45_000;
const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [boxes, conns, { data: s }] = await Promise.all([
    loadPullBoxes(admin),
    listGmailConnections(admin),
    admin.from("platform_email_settings").select("last_ping_at, last_received_at, enabled").eq("id", 1).maybeSingle(),
  ]);
  const runs = await loadPullRuns(admin, boxes.map((b) => b.email));
  const connOf = new Map(conns.map((c) => [normEmail(c.email), c]));
  return NextResponse.json({
    boxes: boxes.map((b) => ({ ...b, run: runs[b.email] ?? null, connected: connOf.has(b.email), conn_error: connOf.get(b.email)?.last_error || null })),
    gmail_configured: gmailConfigured(),
    script: { last_ping_at: (s as { last_ping_at?: string } | null)?.last_ping_at ?? null, last_received_at: (s as { last_received_at?: string } | null)?.last_received_at ?? null },
    enabled: (s as { enabled?: boolean } | null)?.enabled !== false,
    error: null,
  }, { headers: NO_STORE });
}

async function saveBoxes(admin: ReturnType<typeof supabaseAdmin>, boxes: PullBox[], uid: string | null) {
  return admin.from("platform_email_settings").update({ pull_boxes: boxes, updated_by: uid, updated_at: new Date().toISOString() }).eq("id", 1);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: { action?: string; email?: string; label?: string; enabled?: boolean; days?: number; box?: unknown };
  try { body = await request.json(); } catch { return err(400, "ข้อมูลไม่ถูกต้อง"); }
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const uid = user?.id ?? null;
  const actorName = user?.email ?? null;
  const audit = (action: string, email: string, before: Record<string, unknown> | null, after: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    writeAudit(admin, { action, entityType: "platform_email_mailbox", entityId: null, actorId: uid, actorName, metadata: { mailbox: email, changes: auditDiff(before, after), ...extra } });

  const boxes = await loadPullBoxes(admin);
  const email = normEmail(body.email);
  const idx = boxes.findIndex((b) => b.email === email);

  if (body.action === "add") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "อีเมลไม่ถูกต้อง");
    if (idx >= 0) return err(400, "มีกล่องนี้อยู่แล้ว");
    const box: PullBox = { email, label: (body.label ?? "").trim().slice(0, 80) || email, enabled: true, added_at: new Date().toISOString() };
    const { error } = await saveBoxes(admin, [...boxes, box], uid);
    if (error) return err(500, "บันทึกไม่สำเร็จ");
    await audit("create", email, null, box);
    return NextResponse.json({ ok: true, box, error: null }, { headers: NO_STORE });
  }

  if (body.action === "restore") {
    const [box] = normalizeBoxes([body.box]);
    if (!box) return err(400, "ข้อมูลกล่องไม่ถูกต้อง");
    if (boxes.some((b) => b.email === box.email)) return NextResponse.json({ ok: true, box, error: null }, { headers: NO_STORE });
    const { error } = await saveBoxes(admin, [...boxes, box], uid);
    if (error) return err(500, "ย้อนกลับไม่สำเร็จ");
    await audit("restore", box.email, null, box);
    return NextResponse.json({ ok: true, box, error: null }, { headers: NO_STORE });
  }

  if (idx < 0) return err(404, "ไม่พบกล่องเมลนี้");
  const before = boxes[idx];

  if (body.action === "update") {
    const after: PullBox = {
      ...before,
      ...(typeof body.label === "string" ? { label: body.label.trim().slice(0, 80) || before.email } : {}),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
    };
    const next = boxes.map((b, i) => (i === idx ? after : b));
    const { error } = await saveBoxes(admin, next, uid);
    if (error) return err(500, "บันทึกไม่สำเร็จ");
    await audit("update", email, before, after);
    return NextResponse.json({ ok: true, box: after, error: null }, { headers: NO_STORE });
  }

  if (body.action === "remove") {
    const { error } = await saveBoxes(admin, boxes.filter((_, i) => i !== idx), uid);
    if (error) return err(500, "เอาออกไม่สำเร็จ");
    await audit("delete", email, before, {});
    return NextResponse.json({ ok: true, box: before, error: null }, { headers: NO_STORE });
  }

  if (body.action === "pull") {
    const days = Number(body.days);
    const back = Number.isFinite(days) && days > 0 ? Math.min(365, Math.round(days)) : 0;
    const runs = await loadPullRuns(admin, [email]);
    const sinceSec = back ? Math.floor(Date.now() / 1000) - back * 86400 : autoSinceSec(runs[email]?.last_ok_at);
    const r = await pullMailbox(admin, before, { sinceSec, budgetMs: PULL_BUDGET_MS, manual: true, actorId: uid, actorName, maxIds: back ? 5000 : 1000 });
    return NextResponse.json({ ...r, days: back }, { status: r.ok ? 200 : 502, headers: NO_STORE });
  }

  return err(400, "ไม่รู้จักคำสั่งนี้");
}
