/**
 * /api/chat/settings — ค่าตั้งห้องแชท (ui_config chat_settings · lib/chat/settings)
 *   GET              ข้อความสำเร็จรูป (ทุกคนที่มี chat.view) + บอท LINE ทุกตัว/สถานะ (เฉพาะ chat.settings)
 *   GET ?check=<bot> ดูว่า webhook ของ OA ตอนนี้ชี้ไปไหน — อ่านอย่างเดียว ไม่เปลี่ยนอะไรที่ LINE · chat.settings
 *   PUT { line_bots?, quick_replies? }  บันทึก · chat.settings · audit "chat.settings"
 * เพิ่ม/ลบบอท + ใส่ token/Channel secret = ศูนย์ LINE เดิม (components/line-console) — หน้านี้แค่เลือกว่าบอทไหนรับแชท + แบรนด์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { isLineBotKey, lineBot, lineBots, loadLineConfig, MAIN_BOT } from "@/lib/line-send";
import { cleanChatSettings } from "@/lib/chat/rules";
import { loadChatSettings, saveChatSettings } from "@/lib/chat/settings";
import { lineWebhookEndpoint } from "@/lib/chat/line-server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function appOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}
const webhookUrl = (origin: string, key: string) => `${origin}/api/china-pay/line-webhook${key === MAIN_BOT ? "" : `?bot=${key}`}`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "chat.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const canManage = await apiCan(request, "chat.settings");
  const settings = await loadChatSettings(admin);
  const origin = appOrigin(request);

  const check = new URL(request.url).searchParams.get("check");
  if (check) {
    if (!canManage) return NextResponse.json({ error: "ต้องมีสิทธิ์ตั้งค่าแชท (chat.settings)" }, { status: 401, headers: NO_STORE });
    if (check !== MAIN_BOT && !isLineBotKey(check)) return NextResponse.json({ error: "ไม่รู้จักบอทนี้" }, { status: 400, headers: NO_STORE });
    const bot = lineBot(await loadLineConfig(admin), check);
    if (!bot?.token) return NextResponse.json({ error: "บอทนี้ยังไม่มีโทเคน — ใส่ที่ศูนย์ LINE ก่อน" }, { status: 400, headers: NO_STORE });
    const r = await lineWebhookEndpoint(bot.token);
    if (!r.ok) return NextResponse.json({ error: "ถาม LINE ไม่ได้ — โทเคนอาจหมดอายุ" }, { status: 502, headers: NO_STORE });
    const ours = webhookUrl(origin, bot.key);
    return NextResponse.json({ endpoint: r.endpoint, active: r.active, points_here: !!r.endpoint && r.endpoint === ours, ours, error: null }, { headers: NO_STORE });
  }

  let bots: unknown[] = [];
  if (canManage) {
    const cfg = await loadLineConfig(admin);
    bots = lineBots(cfg).map((b) => ({
      key: b.key, label: b.label, is_main: b.isMain, bot_name: b.bot_name, basic_id: b.basic_id,
      has_token: !!b.token,
      has_secret: b.isMain ? !!(process.env.LINE_CHANNEL_SECRET || b.channel_secret) : !!b.channel_secret,
      webhook: webhookUrl(origin, b.key),
      groups: b.isMain ? Object.values(cfg.groups ?? {}).filter(Boolean).length : 0,
    }));
  }
  return NextResponse.json({
    settings: canManage ? settings : { line_bots: {}, quick_replies: settings.quick_replies },
    bots, can_manage: canManage, error: null,
  }, { headers: NO_STORE });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "chat.settings"); if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { line_bots?: unknown; quick_replies?: unknown };
  const admin = supabaseAdmin();
  const cur = await loadChatSettings(admin);
  const next = cleanChatSettings({
    line_bots: body.line_bots !== undefined ? body.line_bots : cur.line_bots,
    quick_replies: body.quick_replies !== undefined ? body.quick_replies : cur.quick_replies,
  });
  const err = await saveChatSettings(admin, next);
  if (err) return NextResponse.json({ error: err }, { status: 500 });

  const onList = (s: typeof cur) => Object.entries(s.line_bots).filter(([, v]) => v.enabled).map(([k, v]) => `${k}${v.brand_id ? `:${v.brand_id}` : ""}`).sort().join(", ");
  const changes = [
    ...(onList(cur) !== onList(next) ? [{ field: "line_bots", label: "บอทที่รับแชท", old: onList(cur) || "—", new: onList(next) || "—" }] : []),
    ...(JSON.stringify(cur.quick_replies) !== JSON.stringify(next.quick_replies) ? [{ field: "quick_replies", label: "ข้อความสำเร็จรูป", old: `${cur.quick_replies.length} ข้อความ`, new: `${next.quick_replies.length} ข้อความ` }] : []),
  ];
  if (changes.length) await writeAuditFor(request, admin, { action: "chat.settings", entityType: "chat_settings", entityId: null, metadata: { name: "ตั้งค่าห้องแชท", changes } });
  return NextResponse.json({ settings: next, error: null });
}
