/**
 * POST /api/china-pay/line-webhook — ตัวรับ event กลางของบอท LINE (บอท 1 ตัวตั้ง webhook ได้ URL เดียว จึงแยกงานที่นี่)
 *
 * งานที่ 1 (เดิม) "ดึง Group ID อัตโนมัติ":
 *  1) ตั้ง Webhook URL ใน LINE Developers = <app>/api/china-pay/line-webhook + เปิด Use webhook
 *  2) เชิญบอทเข้ากลุ่ม → พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง
 *  3) route นี้จะจับ source.groupId แล้วบันทึกลง china_app_settings (line_config.group_id) อัตโนมัติ
 *
 * งานที่ 2 "คำสั่งซื้อจากไลน์": รูปที่ส่งในกลุ่ม slot purchase_capture → ของกลาง lib/order-capture
 *  (เก็บรูป → AI อ่าน → กล่องพักรอคนยืนยัน → ตอบกลับในกลุ่ม) · ทำใน after() เพื่อตอบ 200 ให้ LINE ทันที
 *
 * - ตอบ 200 เสมอ (LINE ต้องการ)
 * - เรียกได้โดยไม่ต้องล็อกอิน (LINE เป็นคนเรียก) → 🔒 กันของปลอม:
 *   · จับกลุ่ม: ถามกลับไปที่ LINE ด้วยโทเคนบอทว่า "บอทอยู่ในกลุ่ม/ห้องนี้จริงไหม" (audit 2026-10-21 S7)
 *   · รูปคำสั่งซื้อ: ดึงไฟล์รูปจาก LINE ด้วยโทเคนบอท — id ปลอมดึงไม่ได้ = ไม่บันทึก
 *   · ถ้าตั้ง Channel secret ไว้ (env LINE_CHANNEL_SECRET หรือ line_config.channel_secret) จะตรวจลายเซ็น x-line-signature ก่อนทุกอย่าง
 */
import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { handleOrderImageEvents, pickOrderImageEvents, type LineEvent } from "@/lib/order-capture";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // งานอ่านรูปด้วย AI ใน after() ใช้เวลาหลายวินาที

type Admin = ReturnType<typeof supabaseAdmin>;
type Cfg = Record<string, unknown>;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, hint: "LINE webhook endpoint — ใช้ POST จาก LINE" });
}

/** ลายเซ็นตรงกับ Channel secret ไหม (HMAC-SHA256 ของ body ดิบ → base64) */
function signatureOk(secret: string, raw: string, sig: string | null): boolean {
  if (!sig) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const got = Buffer.from(sig, "base64");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** งานเดิม: จำ group/room ล่าสุดที่บอทเห็น (ให้หน้าตั้งค่ากด "ใช้กลุ่มล่าสุด") */
async function captureGroupId(admin: Admin, rowId: string | undefined, cur: Cfg, events: LineEvent[]): Promise<void> {
  const src = events.map(e => e.source).find(s => s?.groupId || s?.roomId);
  const gid = src?.groupId || src?.roomId;
  if (!gid || !/^[A-Za-z0-9]{10,80}$/.test(gid)) return;   // ไม่มี group/room
  if (cur.group_id === gid) return;   // กลุ่มเดิม ไม่ต้องบันทึกซ้ำ
  const token = typeof cur.token === "string" ? cur.token : "";
  if (!token) return;   // ยังไม่ได้ตั้งโทเคนบอท → ตรวจไม่ได้ ไม่บันทึก
  const check = src?.groupId
    ? `https://api.line.me/v2/bot/group/${encodeURIComponent(gid)}/summary`
    : `https://api.line.me/v2/bot/room/${encodeURIComponent(gid)}/members/count`;
  const verified = await fetch(check, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok).catch(() => false);
  if (!verified) return;   // บอทไม่ได้อยู่ในกลุ่มนี้ = คำขอปลอม
  const next = { ...cur, group_id: gid, group_captured_at: new Date().toISOString() };
  if (rowId) await admin.from("china_app_settings").update({ sval: next }).eq("id", rowId);
  else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text().catch(() => "");
  let body: { events?: LineEvent[] };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) return NextResponse.json({ ok: true });   // LINE กด "Verify" ส่ง events ว่างมา

  try {
    const admin = supabaseAdmin();
    const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
    const cur = (row?.sval ?? {}) as Cfg;

    const secret = String(process.env.LINE_CHANNEL_SECRET ?? cur.channel_secret ?? "").trim();
    if (secret && !signatureOk(secret, raw, request.headers.get("x-line-signature"))) return NextResponse.json({ ok: true });

    try { await captureGroupId(admin, row?.id, cur, events); } catch { /* best-effort */ }

    const orderEvents = pickOrderImageEvents(cur, events);
    if (orderEvents.length > 0) {
      after(() => handleOrderImageEvents(admin, cur, orderEvents).catch((e) => console.error("[line-webhook] order capture", e)));
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
