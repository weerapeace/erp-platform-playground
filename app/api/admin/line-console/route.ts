/**
 * ศูนย์จัดการ LINE รวมทุกระบบ (ของกลาง) — คุม china_app_settings.line_config ก้อนเดียว
 *   GET  → บอททุกตัว (โควตาเดือนนี้ · webhook) + กลุ่มทุก slot (ใช้บอทไหน · กี่คน) + สวิตช์เปิด/ปิด + ทะเบียนระบบ
 *   POST → หลายคำสั่ง (แยกด้วยฟิลด์):
 *     { slot, group_id }      ตั้งกลุ่มปลายทางของ slot
 *     { slot, clear:true }    ล้างกลุ่มของ slot
 *     { slot, test:true }     ส่งข้อความทดสอบเข้ากลุ่มของ slot (ด้วยบอทของกลุ่มนั้น)
 *     { slot, bot }           เลือกบอทที่ดูแลกลุ่มนี้ ("main" = บอทหลัก)
 *     { event, enabled }      เปิด/ปิดแจ้งเตือนต่อเหตุการณ์ (เก็บใน disabled_events)
 *     { token }               ตั้ง/เปลี่ยนโทเคนบอทหลัก
 *     { channel_secret }      ตั้ง/ล้างรหัสลับบอทหลัก
 *     { add_bot:{label,token,channel_secret} }   เพิ่มบอทเสริม (ถาม LINE ก่อนว่าโทเคนใช้ได้)
 *     { bot, label }          เปลี่ยนชื่อบอท
 *     { bot, token } / { bot, channel_secret }   เปลี่ยนโทเคน/รหัสลับของบอทเสริม
 *     { bot, remove:true }    ลบบอทเสริม (ต้องย้ายกลุ่มที่ใช้บอทนี้ออกก่อน)
 *
 * สิทธิ์: admin.users (ระดับผู้บริหาร) — ข้อมูลอ่อนไหว (โทเคนบอท ไม่ส่งค่าจริงออกไป) · ทุกการแก้ลง audit
 * ตัวส่งจริงทุกตัวผ่าน lib/line-send → เลือกบอทตาม slot_bot ที่ตั้งที่นี่ · ปิดสวิตช์ที่นี่ = หยุดส่งจริง
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { LINE_SYSTEMS, LINE_SLOTS, LINE_ALL_SLOTS, LINE_ALL_EVENTS, type LineSlotKey } from "@/lib/line-registry";
import {
  MAIN_BOT, isLineBotKey, lineBot, lineBotFor, lineBotInfo, lineBotKeyFor, lineBotQuota, lineBots, lineGroupMembers,
  linePush, lineText, type LineConfig,
} from "@/lib/line-send";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;   // ถามโควตา/จำนวนคนจาก LINE หลายคำขอพร้อมกัน

type Admin = ReturnType<typeof supabaseAdmin>;

async function readCfg(admin: Admin): Promise<{ id?: string; cfg: LineConfig }> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
  return { id: (row as { id?: string } | null)?.id, cfg: ((row as { sval?: LineConfig } | null)?.sval ?? {}) as LineConfig };
}
const isSlot = (s: string): s is LineSlotKey => (LINE_ALL_SLOTS as string[]).includes(s);
const tokenHint = (t?: string) => (t && t.length >= 4 ? "…" + t.slice(-4) : "");
const SECRET_RE = /^[0-9a-f]{32}$/i;
const SECRET_ERR = "Channel secret ต้องเป็นตัวอักษร 0-9 a-f ยาว 32 ตัว (ก๊อปจาก LINE Developers แท็บ Basic settings)";

/** ที่อยู่เว็บจริงของ request (ใช้ประกอบ Webhook URL ให้คัดลอกไปวางใน LINE Developers) */
function appOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { cfg } = await readCfg(supabaseAdmin());
  const origin = appOrigin(request);
  const bots = lineBots(cfg);

  // ถาม LINE พร้อมกัน (อ่านอย่างเดียว ไม่กินโควตา): โควตาเดือนนี้ต่อบอท + จำนวนคนในกลุ่มต่อ slot
  const [quotas, members] = await Promise.all([
    Promise.all(bots.map((b) => (b.token ? lineBotQuota(b.token) : Promise.resolve({ ok: false, limit: null, used: null })))),
    Promise.all(LINE_ALL_SLOTS.map((s) => {
      const gid = cfg.groups?.[s] ?? "";
      return gid ? lineGroupMembers(lineBotFor(cfg, s).token, gid) : Promise.resolve(null);
    })),
  ]);

  const groups: Record<string, string> = {};
  const slot_bot: Record<string, string> = {};
  const slot_members: Record<string, number | null> = {};
  LINE_ALL_SLOTS.forEach((s, i) => {
    groups[s] = cfg.groups?.[s] ?? "";
    slot_bot[s] = lineBotKeyFor(cfg, s);
    slot_members[s] = members[i];
  });

  return NextResponse.json({
    has_token: !!cfg.token, token_hint: tokenHint(cfg.token),
    // Channel secret = ใช้ตรวจลายเซ็นว่าข้อความมาจาก LINE จริง (ตั้งใน env LINE_CHANNEL_SECRET ก็ได้)
    has_secret: !!(process.env.LINE_CHANNEL_SECRET || cfg.channel_secret),
    secret_hint: process.env.LINE_CHANNEL_SECRET ? "ตั้งใน env" : tokenHint(typeof cfg.channel_secret === "string" ? cfg.channel_secret : ""),
    captured: cfg.group_id ?? "", captured_at: cfg.group_captured_at ?? null,
    bots: bots.map((b, i) => ({
      key: b.key, label: b.label, is_main: b.isMain,
      bot_name: b.bot_name, basic_id: b.basic_id,
      has_token: !!b.token, token_hint: tokenHint(b.token),
      has_secret: b.isMain ? !!(process.env.LINE_CHANNEL_SECRET || b.channel_secret) : !!b.channel_secret,
      captured: b.group_id, captured_at: b.group_captured_at,
      webhook: `${origin}/api/china-pay/line-webhook${b.isMain ? "" : `?bot=${b.key}`}`,
      quota: quotas[i],
      slots: LINE_ALL_SLOTS.filter((s) => slot_bot[s] === b.key && !!groups[s]),
    })),
    groups, slot_bot, slot_members,
    disabled_events: cfg.disabled_events ?? {},
    systems: LINE_SYSTEMS, slots: LINE_SLOTS,
    error: null,
  });
}

type Body = {
  slot?: string; group_id?: string; clear?: boolean; test?: boolean; event?: string; enabled?: boolean;
  token?: string; channel_secret?: string; bot?: string; label?: string; remove?: boolean;
  add_bot?: { label?: string; token?: string; channel_secret?: string };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { id, cfg } = await readCfg(admin);
  const save = async (next: LineConfig) => {
    if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id);
    else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  };
  const audit = (metadata: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "line_config", entityId: null,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata,
  });
  const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

  // ---- เพิ่มบอทเสริม ----
  if (body.add_bot && typeof body.add_bot === "object") {
    const label = String(body.add_bot.label ?? "").trim().slice(0, 40);
    const tk = String(body.add_bot.token ?? "").trim();
    const sec = String(body.add_bot.channel_secret ?? "").trim();
    if (!label) return err("ตั้งชื่อบอทก่อน เช่น \"บอทผลิต\"");
    if (!tk) return err("ยังไม่มีโทเคน (Channel access token)");
    if (!SECRET_RE.test(sec)) return err(SECRET_ERR);
    if (lineBots(cfg).some((b) => b.token === tk)) return err("โทเคนนี้เป็นของบอทที่มีอยู่แล้ว");
    const info = await lineBotInfo(tk);
    if (!info) return err("LINE ไม่รับโทเคนนี้ — ตรวจว่าก๊อปมาครบ (Messaging API → Channel access token)");
    if (info.basic_id && lineBots(cfg).some((b) => b.basic_id === info.basic_id)) return err(`บอท ${info.basic_id} มีอยู่ในระบบแล้ว`);
    let key = "";
    do { key = `b${randomBytes(4).toString("hex").slice(0, 6)}`; } while (cfg.bots?.[key]);
    await save({ ...cfg, bots: { ...(cfg.bots ?? {}), [key]: { label, token: tk, channel_secret: sec, bot_name: info.name, basic_id: info.basic_id, added_at: new Date().toISOString() } } });
    await audit({ field: "bots", bot: key, added: true, label, basic_id: info.basic_id, token_hint: tokenHint(tk) });   // ไม่ลงความลับเต็ม
    return NextResponse.json({ ok: true, bot: key, bot_name: info.name, error: null });
  }

  // ---- คำสั่งที่อิงบอท (เปลี่ยนชื่อ / โทเคน / รหัสลับ / ลบ) — ต้องมาก่อนคำสั่ง token ของบอทหลัก ----
  if (typeof body.bot === "string" && !body.slot) {
    const key = body.bot;
    const bot = lineBot(cfg, key);
    if (!bot) return err("ไม่พบบอทนี้");

    if (typeof body.label === "string") {
      const label = body.label.trim().slice(0, 40);
      if (!label) return err("ชื่อบอทว่างไม่ได้");
      const next: LineConfig = bot.isMain ? { ...cfg, main_label: label }
        : { ...cfg, bots: { ...(cfg.bots ?? {}), [key]: { ...(cfg.bots?.[key] ?? {}), label } } };
      await save(next);
      await audit({ field: "bots", bot: key, label });
      return NextResponse.json({ ok: true, error: null });
    }
    if (bot.isMain) return err("บอทหลักแก้โทเคน/รหัสลับที่ช่องของบอทหลัก");

    if (body.remove) {
      const using = LINE_ALL_SLOTS.filter((s) => cfg.slot_bot?.[s] === key);
      if (using.length) return err(`บอทนี้ยังดูแล ${using.length} กลุ่ม (${using.map((s) => LINE_SLOTS[s].label).join(", ")}) — เปลี่ยนกลุ่มเหล่านั้นไปใช้บอทอื่นก่อน`);
      const bots = { ...(cfg.bots ?? {}) }; delete bots[key];
      await save({ ...cfg, bots });
      await audit({ field: "bots", bot: key, removed: true, label: bot.label });
      return NextResponse.json({ ok: true, removed: true, error: null });
    }
    if (typeof body.token === "string") {
      const tk = body.token.trim();
      if (!tk) return err("ยังไม่มีโทเคน");
      const info = await lineBotInfo(tk);
      if (!info) return err("LINE ไม่รับโทเคนนี้ — ตรวจว่าก๊อปมาครบ");
      if (bot.basic_id && info.basic_id && info.basic_id !== bot.basic_id) return err(`โทเคนนี้เป็นของบอท ${info.basic_id} ไม่ใช่ ${bot.basic_id}`);
      await save({ ...cfg, bots: { ...(cfg.bots ?? {}), [key]: { ...(cfg.bots?.[key] ?? {}), token: tk, bot_name: info.name, basic_id: info.basic_id } } });
      await audit({ field: "bots", bot: key, token_hint: tokenHint(tk) });
      return NextResponse.json({ ok: true, error: null });
    }
    if (typeof body.channel_secret === "string") {
      const sec = body.channel_secret.trim();
      if (!SECRET_RE.test(sec)) return err(`${SECRET_ERR} — บอทเสริมต้องมีรหัสลับเสมอ`);
      await save({ ...cfg, bots: { ...(cfg.bots ?? {}), [key]: { ...(cfg.bots?.[key] ?? {}), channel_secret: sec } } });
      await audit({ field: "bots", bot: key, channel_secret: true, secret_hint: tokenHint(sec) });
      return NextResponse.json({ ok: true, error: null });
    }
    return err("คำสั่งไม่ถูกต้อง");
  }

  // ---- ตั้ง/เปลี่ยนโทเคนบอทหลัก ----
  if (typeof body.token === "string") {
    const tk = body.token.trim();
    if (!tk) return err("ยังไม่มีโทเคน");
    await save({ ...cfg, token: tk });
    await audit({ field: "token", token_hint: tokenHint(tk) });   // ไม่ลงโทเคนเต็มใน audit
    return NextResponse.json({ ok: true, has_token: true, token_hint: tokenHint(tk), error: null });
  }

  // ---- ตั้ง/ล้าง Channel secret บอทหลัก (ส่งค่าว่าง = ล้าง → เลิกตรวจลายเซ็น) ----
  if (typeof body.channel_secret === "string") {
    const sec = body.channel_secret.trim();
    if (sec && !SECRET_RE.test(sec)) return err(SECRET_ERR);
    const next: LineConfig = { ...cfg };
    if (sec) next.channel_secret = sec; else delete next.channel_secret;
    await save(next);
    await audit({ field: "channel_secret", cleared: !sec, secret_hint: tokenHint(sec) });   // ไม่ลงค่าเต็มใน audit
    return NextResponse.json({ ok: true, has_secret: !!sec, error: null });
  }

  // ---- เปิด/ปิดแจ้งเตือนต่อเหตุการณ์ ----
  if (typeof body.event === "string" && typeof body.enabled === "boolean") {
    const ev = body.event;
    if (!LINE_ALL_EVENTS.includes(ev)) return err("เหตุการณ์ไม่ถูกต้อง");
    const disabled = { ...(cfg.disabled_events ?? {}) };
    if (body.enabled) delete disabled[ev]; else disabled[ev] = true;
    await save({ ...cfg, disabled_events: disabled });
    await audit({ field: "disabled_events", event: ev, enabled: body.enabled });
    return NextResponse.json({ ok: true, event: ev, enabled: body.enabled, error: null });
  }

  // ---- คำสั่งที่อิง slot ----
  const slot = String(body.slot ?? "");
  if (!isSlot(slot)) return err("กลุ่มปลายทางไม่ถูกต้อง");

  // เลือกบอทที่ดูแลกลุ่มนี้
  if (typeof body.bot === "string") {
    const key = body.bot === MAIN_BOT ? MAIN_BOT : body.bot;
    if (key !== MAIN_BOT && !isLineBotKey(key)) return err("ไม่พบบอทนี้");
    const bot = lineBot(cfg, key);
    if (!bot) return err("ไม่พบบอทนี้");
    if (!bot.token) return err("บอทนี้ยังไม่มีโทเคน");
    const slot_bot = { ...(cfg.slot_bot ?? {}) };
    if (key === MAIN_BOT) delete slot_bot[slot]; else slot_bot[slot] = key;
    await save({ ...cfg, slot_bot });
    await audit({ field: "slot_bot", slot, from: lineBotKeyFor(cfg, slot), to: key });
    // กลุ่มเดิมยังตั้งอยู่ → เช็กว่าบอทใหม่อยู่ในกลุ่มนั้นจริงไหม (ไม่อยู่ = ส่งไม่ถึงจนกว่าจะเชิญ)
    const gid = cfg.groups?.[slot] ?? "";
    const inGroup = gid ? (await lineGroupMembers(bot.token, gid)) !== null : null;
    const warning = inGroup === false ? `${bot.label} ยังไม่ได้อยู่ในกลุ่มนี้ — เชิญบอทเข้ากลุ่มก่อน ไม่งั้นข้อความจะส่งไม่ถึง` : null;
    return NextResponse.json({ ok: true, bot: key, warning, error: null });
  }

  // ทดสอบส่งเข้ากลุ่มของ slot (ด้วยบอทที่ดูแลกลุ่มนี้)
  if (body.test) {
    const target = cfg.groups?.[slot] || "";
    const bot = lineBotFor(cfg, slot);
    if (!bot.token || !target) return NextResponse.json({ error: "ยังไม่มีโทเคนบอท หรือยังไม่ได้ตั้งกลุ่มนี้", needConfig: true }, { status: 400 });
    const label = LINE_SLOTS[slot].label;
    const r = await linePush(cfg, { to: target, slot, messages: [lineText(`🔔 ทดสอบแจ้งเตือน — "${label}" พร้อมรับข้อความแล้ว ✅ (ส่งโดย ${bot.label})`)] });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({ ok: true, sent: true, error: null });
  }

  // ล้างกลุ่มของ slot
  if (body.clear) {
    const groups = { ...(cfg.groups ?? {}) }; delete groups[slot];
    await save({ ...cfg, groups });
    await audit({ field: "groups", slot, cleared: true });
    return NextResponse.json({ ok: true, cleared: true, error: null });
  }

  // บันทึกกลุ่มของ slot
  const gid = String(body.group_id ?? "").trim();
  if (!gid) return err("ยังไม่มี group id (เพิ่มบอทเข้ากลุ่ม แล้วพิมพ์ในกลุ่ม → รีเฟรช)");
  await save({ ...cfg, groups: { ...(cfg.groups ?? {}), [slot]: gid } });
  await audit({ field: "groups", slot, saved: true });
  return NextResponse.json({ ok: true, saved: gid, error: null });
}
