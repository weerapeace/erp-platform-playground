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
 * งานที่ 4 "ไอเดียจากไลน์": รูป/ลิงก์/ข้อความในกลุ่ม slot design_idea → กล่องรอคัดในหน้าไอเดีย (lib/design-idea-line)
 * งานที่ 3 "งานออกแบบจากไลน์": ข้อความ+รูปในกลุ่ม slot design_intake → ของกลาง lib/design-line-inbox
 *  (ของคนเดิมใน 5 นาที = ร่างเดียว → AI เดาชื่อ/แบรนด์/วันส่ง → กล่อง "จากไลน์" บน Design Dashboard → ตอบกลับในกลุ่ม)
 *
 * - ตอบ 200 เสมอ (LINE ต้องการ)
 * - เรียกได้โดยไม่ต้องล็อกอิน (LINE เป็นคนเรียก) → 🔒 กันของปลอม:
 *   · จับกลุ่ม: ถามกลับไปที่ LINE ด้วยโทเคนบอทว่า "บอทอยู่ในกลุ่ม/ห้องนี้จริงไหม" (audit 2026-10-21 S7)
 *   · รูปคำสั่งซื้อ: ดึงไฟล์รูปจาก LINE ด้วยโทเคนบอท — id ปลอมดึงไม่ได้ = ไม่บันทึก
 *   · ข้อความงานออกแบบ: ต้องเป็นสมาชิกกลุ่มจริง (ถามชื่อคนส่งจาก LINE ไม่ได้ = ไม่บันทึก)
 *   · ถ้าตั้ง Channel secret ไว้ (env LINE_CHANNEL_SECRET หรือ line_config.channel_secret) จะตรวจลายเซ็น x-line-signature ก่อนทุกอย่าง
 *
 * หลายบอท: บอทเสริมตั้ง Webhook URL = <app>/api/china-pay/line-webhook?bot=<key> (ศูนย์ LINE มีปุ่มคัดลอก)
 *   · บอทเสริมต้องมี Channel secret เสมอ (ตรวจลายเซ็นทุกครั้ง) · กลุ่มล่าสุดเก็บแยกต่อบอท (bots[key].group_id)
 *   · งานรับเข้า (คำสั่งซื้อ/งานออกแบบ) ทำเฉพาะบอทที่ถูกเลือกให้ดูแลกลุ่มนั้น (slot_bot)
 */
import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { handleOrderImageEvents, pickOrderImageEvents, type LineEvent } from "@/lib/order-capture";
import { handleDesignEvents, pickDesignEvents } from "@/lib/design-line-inbox";
import { DESIGN_IDEA_SLOT, handleIdeaEvents, pickIdeaEvents } from "@/lib/design-idea-line";
import { MAIN_BOT, isLineBotKey, lineBot, lineBotKeyFor, lineConfigForBot, type LineBotView, type LineConfig } from "@/lib/line-send";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // งานอ่านรูปด้วย AI ใน after() ใช้เวลาหลายวินาที

type Admin = ReturnType<typeof supabaseAdmin>;

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

/** งานเดิม: จำ group/room ล่าสุดที่บอทตัวนี้เห็น (ให้หน้าตั้งค่ากด "ใช้กลุ่มล่าสุด") · บอทหลัก = ระดับบนสุดเดิม · บอทเสริม = bots[key] */
async function captureGroupId(admin: Admin, rowId: string | undefined, cur: LineConfig, bot: LineBotView, events: LineEvent[]): Promise<void> {
  const src = events.map(e => e.source).find(s => s?.groupId || s?.roomId);
  const gid = src?.groupId || src?.roomId;
  if (!gid || !/^[A-Za-z0-9]{10,80}$/.test(gid)) return;   // ไม่มี group/room
  if (bot.group_id === gid) return;   // กลุ่มเดิม ไม่ต้องบันทึกซ้ำ
  if (!bot.token) return;   // ยังไม่ได้ตั้งโทเคนบอท → ตรวจไม่ได้ ไม่บันทึก
  const check = src?.groupId
    ? `https://api.line.me/v2/bot/group/${encodeURIComponent(gid)}/summary`
    : `https://api.line.me/v2/bot/room/${encodeURIComponent(gid)}/members/count`;
  const verified = await fetch(check, { headers: { Authorization: `Bearer ${bot.token}` } })
    .then(r => r.ok).catch(() => false);
  if (!verified) return;   // บอทไม่ได้อยู่ในกลุ่มนี้ = คำขอปลอม
  const at = new Date().toISOString();
  const next: LineConfig = bot.isMain
    ? { ...cur, group_id: gid, group_captured_at: at }
    : { ...cur, bots: { ...(cur.bots ?? {}), [bot.key]: { ...(cur.bots?.[bot.key] ?? {}), group_id: gid, group_captured_at: at } } };
  if (rowId) await admin.from("china_app_settings").update({ sval: next }).eq("id", rowId);
  else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text().catch(() => "");
  let body: { events?: LineEvent[] };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) return NextResponse.json({ ok: true });   // LINE กด "Verify" ส่ง events ว่างมา

  // ?bot=<key> = บอทเสริม (แต่ละบอทตั้ง Webhook URL ของตัวเอง) · ไม่มี = บอทหลักตามเดิม
  const botKey = new URL(request.url).searchParams.get("bot") || MAIN_BOT;
  if (botKey !== MAIN_BOT && !isLineBotKey(botKey)) return NextResponse.json({ ok: true });

  try {
    const admin = supabaseAdmin();
    const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
    const cur = (row?.sval ?? {}) as LineConfig;
    const bot = lineBot(cur, botKey);
    if (!bot) return NextResponse.json({ ok: true });   // ไม่รู้จักบอทนี้ (ลบไปแล้ว/ปลอม)

    // บอทหลัก: ตรวจลายเซ็นถ้าตั้งรหัสลับไว้ (ตามเดิม) · บอทเสริม: บังคับต้องมีรหัสลับ + ลายเซ็นถูกเสมอ
    const secret = bot.isMain ? String(process.env.LINE_CHANNEL_SECRET ?? bot.channel_secret ?? "").trim() : bot.channel_secret;
    if (!bot.isMain && !secret) return NextResponse.json({ ok: true });
    if (secret && !signatureOk(secret, raw, request.headers.get("x-line-signature"))) return NextResponse.json({ ok: true });

    try { await captureGroupId(admin, row?.id, cur, bot, events); } catch { /* best-effort */ }

    // งานรับเข้า: รับเฉพาะเมื่อบอทตัวนี้ "ดูแลกลุ่มนั้น" (กันรับซ้ำถ้าบอท 2 ตัวอยู่กลุ่มเดียวกัน)
    // แล้วส่งค่าตั้งในมุมของบอทนี้ → ตอบกลับ/ดึงรูปด้วยโทเคนของบอทที่รับข้อความมาจริง
    const botCfg = lineConfigForBot(cur, bot.key);

    const orderEvents = lineBotKeyFor(cur, "purchase_capture") === bot.key ? pickOrderImageEvents(botCfg, events) : [];
    if (orderEvents.length > 0) {
      after(() => handleOrderImageEvents(admin, botCfg, orderEvents).catch((e) => console.error("[line-webhook] order capture", e)));
    }

    const designEvents = lineBotKeyFor(cur, "design_intake") === bot.key ? pickDesignEvents(botCfg, events) : [];
    if (designEvents.length > 0) {
      after(() => handleDesignEvents(admin, botCfg, designEvents).catch((e) => console.error("[line-webhook] design inbox", e)));
    }

    // งานที่ 4 "ไอเดียจากไลน์": กลุ่ม slot design_idea → กล่องรอคัดในหน้าไอเดีย (lib/design-idea-line)
    const ideaEvents = lineBotKeyFor(cur, DESIGN_IDEA_SLOT) === bot.key ? pickIdeaEvents(botCfg, events) : [];
    if (ideaEvents.length > 0) {
      after(() => handleIdeaEvents(admin, botCfg, ideaEvents).catch((e) => console.error("[line-webhook] idea inbox", e)));
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
