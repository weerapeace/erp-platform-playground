/**
 * 📥 รับเมลจากสคริปต์ Gmail — POST /api/platform-email/inbound
 *
 * ไม่ใช้การล็อกอิน: ยืนยันตัวด้วยกุญแจ "Authorization: Bearer <key>" (สร้าง/เปลี่ยนที่หน้า /admin/platform-email)
 * body: { ping: true }                                             → ทดสอบเชื่อมต่อ
 *       { messages: [{ id, from, subject, date, html, text }] }    → เมลใหม่ (≤ 20 ฉบับ/ครั้ง · สคริปต์ส่งทีละ 10)
 * ตอบ:  { ok: true, results: [{ id, status, note }] } — สคริปต์ติดป้าย "ส่งแล้ว" ให้เธรดเมื่อได้ ok
 * ตัวอ่าน/ตัวบันทึก: lib/platform-email/server.ts · เอกสาร docs/platform-email-orders.md
 */
import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptSecret } from "@/lib/secret-box";
import { writeAudit } from "@/lib/audit";
import { loadEmailSettings, loadPlatformIds, processInbound, type InboundMessage } from "@/lib/platform-email/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_MESSAGES = 20;
const sha = (s: string) => createHash("sha256").update(s).digest();
const sameKey = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const key = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!key) return fail(401, "ไม่มีกุญแจ");

  const admin = supabaseAdmin();
  const settings = await loadEmailSettings(admin);
  const enc = typeof settings.inbound_key_enc === "string" ? settings.inbound_key_enc : "";
  if (!enc) return fail(401, "ERP ยังไม่ได้สร้างกุญแจ — เปิดหน้า ดึงออเดอร์จากเมล ใน ERP ก่อน");
  let real = "";
  try { real = await decryptSecret(enc); } catch { return fail(500, "ถอดรหัสกุญแจไม่ได้ (ตั้งค่า PLATFORM_SECRET_KEY ใน Vercel ไม่ครบ)"); }
  if (!sameKey(real, key)) return fail(401, "กุญแจไม่ถูกต้อง — คัดลอกสคริปต์ล่าสุดจากหน้า ERP มาวางใหม่");
  if (settings.enabled === false) return fail(403, "ปิดการรับเมลไว้ในหน้าตั้งค่า ERP (เมลจะรอส่งรอบหน้า)");

  let body: { ping?: boolean; messages?: InboundMessage[] };
  try { body = await request.json(); } catch { return fail(400, "ข้อมูลไม่ใช่ JSON"); }
  const now = new Date().toISOString();

  if (body.ping) {
    await admin.from("platform_email_settings").update({ last_ping_at: now }).eq("id", 1);
    return NextResponse.json({ ok: true, message: "เชื่อมต่อ ERP สำเร็จ" });
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && typeof m.id === "string" && m.id.trim())
    .slice(0, MAX_MESSAGES);
  if (!messages.length) return NextResponse.json({ ok: true, results: [] });

  const { data: seen } = await admin.from("platform_email_inbox").select("message_id").in("message_id", messages.map((m) => m.id));
  const dup = new Set(((seen ?? []) as { message_id: string }[]).map((r) => r.message_id));
  const ctx = { shops: settings.shops, platformIds: await loadPlatformIds(admin) };

  const results: { id: string; status: string; note: string }[] = [];
  const tally: Record<string, number> = {};
  let created = 0;
  for (const m of messages) {
    if (dup.has(m.id)) { results.push({ id: m.id, status: "duplicate", note: "เคยได้รับแล้ว" }); continue; }
    const out = await processInbound(admin, m, ctx);
    results.push({ id: m.id, status: out.status, note: out.note });
    tally[out.status] = (tally[out.status] ?? 0) + 1;
    if (out.created) created++;
  }

  const processed = results.filter((r) => r.status !== "duplicate").length;
  await admin.from("platform_email_settings").update({ last_ping_at: now, ...(processed ? { last_received_at: now } : {}) }).eq("id", 1);
  if (processed) {
    await writeAudit(admin, {
      action: "import", entityType: "platform_email", entityId: null, actorId: null, actorName: "สคริปต์ Gmail",
      metadata: { received: processed, orders_created: created, ...tally },
    });
  }
  return NextResponse.json({ ok: true, results });
}
