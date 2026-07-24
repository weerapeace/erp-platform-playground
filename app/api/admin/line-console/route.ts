/**
 * ศูนย์จัดการ LINE รวมทุกระบบ (ของกลาง) — คุม china_app_settings.line_config ก้อนเดียว
 *   GET  → สถานะบอท + กลุ่มทุก slot + สวิตช์เปิด/ปิดต่อเหตุการณ์ + ทะเบียนระบบ (เพื่อ render)
 *   POST → หลายคำสั่ง (แยกด้วยฟิลด์):
 *     { slot, group_id }      ตั้งกลุ่มปลายทางของ slot
 *     { slot, clear:true }    ล้างกลุ่มของ slot
 *     { slot, test:true }     ส่งข้อความทดสอบเข้ากลุ่มของ slot
 *     { event, enabled }      เปิด/ปิดแจ้งเตือนต่อเหตุการณ์ (เก็บใน disabled_events)
 *     { token }               ตั้ง/เปลี่ยนโทเคนบอท
 *
 * สิทธิ์: admin.users (ระดับผู้บริหาร) — ข้อมูลอ่อนไหว (โทเคนบอท) · ทุกการแก้ลง audit
 * ตัวส่งจริง (board-notify / จัดซื้อ / จีน) เคารพ disabled_events แล้ว → ปิดที่นี่ = หยุดส่งจริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { LINE_SYSTEMS, LINE_SLOTS, LINE_ALL_SLOTS, LINE_ALL_EVENTS, type LineSlotKey } from "@/lib/line-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LineCfg = {
  token?: string; group_id?: string; group_captured_at?: string;
  groups?: Record<string, string>; templates?: Record<string, string>;
  disabled_events?: Record<string, boolean>; routing?: Record<string, string>;
} & Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;

async function readCfg(admin: Admin): Promise<{ id?: string; cfg: LineCfg }> {
  const { data: row } = await admin.from("china_app_settings").select("id, sval").eq("skey", "line_config").maybeSingle();
  return { id: (row as { id?: string } | null)?.id, cfg: ((row as { sval?: LineCfg } | null)?.sval ?? {}) as LineCfg };
}
const isSlot = (s: string): s is LineSlotKey => (LINE_ALL_SLOTS as string[]).includes(s);
const tokenHint = (t?: string) => (t && t.length >= 4 ? "…" + t.slice(-4) : "");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { cfg } = await readCfg(supabaseAdmin());
  const groups: Record<string, string> = {};
  for (const s of LINE_ALL_SLOTS) groups[s] = cfg.groups?.[s] ?? "";
  return NextResponse.json({
    has_token: !!cfg.token, token_hint: tokenHint(cfg.token),
    captured: cfg.group_id ?? "", captured_at: cfg.group_captured_at ?? null,
    groups, disabled_events: cfg.disabled_events ?? {},
    systems: LINE_SYSTEMS, slots: LINE_SLOTS,
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();

  let body: { slot?: string; group_id?: string; clear?: boolean; test?: boolean; event?: string; enabled?: boolean; token?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { id, cfg } = await readCfg(admin);
  const save = async (next: LineCfg) => {
    if (id) await admin.from("china_app_settings").update({ sval: next }).eq("id", id);
    else await admin.from("china_app_settings").insert({ skey: "line_config", sval: next });
  };
  const audit = (metadata: Record<string, unknown>) => writeAudit(admin, {
    action: "update", entityType: "line_config", entityId: null,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata,
  });

  // ---- ตั้ง/เปลี่ยนโทเคนบอท ----
  if (typeof body.token === "string") {
    const tk = body.token.trim();
    if (!tk) return NextResponse.json({ error: "ยังไม่มีโทเคน" }, { status: 400 });
    await save({ ...cfg, token: tk });
    await audit({ field: "token", token_hint: tokenHint(tk) });   // ไม่ลงโทเคนเต็มใน audit
    return NextResponse.json({ ok: true, has_token: true, token_hint: tokenHint(tk), error: null });
  }

  // ---- เปิด/ปิดแจ้งเตือนต่อเหตุการณ์ ----
  if (typeof body.event === "string" && typeof body.enabled === "boolean") {
    const ev = body.event;
    if (!LINE_ALL_EVENTS.includes(ev)) return NextResponse.json({ error: "เหตุการณ์ไม่ถูกต้อง" }, { status: 400 });
    const disabled = { ...(cfg.disabled_events ?? {}) };
    if (body.enabled) delete disabled[ev]; else disabled[ev] = true;
    await save({ ...cfg, disabled_events: disabled });
    await audit({ field: "disabled_events", event: ev, enabled: body.enabled });
    return NextResponse.json({ ok: true, event: ev, enabled: body.enabled, error: null });
  }

  // ---- คำสั่งที่อิง slot ----
  const slot = String(body.slot ?? "");
  if (!isSlot(slot)) return NextResponse.json({ error: "กลุ่มปลายทางไม่ถูกต้อง" }, { status: 400 });

  // ทดสอบส่งเข้ากลุ่มของ slot
  if (body.test) {
    const target = cfg.groups?.[slot] || "";
    if (!cfg.token || !target) return NextResponse.json({ error: "ยังไม่มีโทเคนบอท หรือยังไม่ได้ตั้งกลุ่มนี้", needConfig: true }, { status: 400 });
    const label = LINE_SLOTS[slot].label;
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ to: target, messages: [{ type: "text", text: `🔔 ทดสอบแจ้งเตือน — "${label}" พร้อมรับข้อความแล้ว ✅` }] }),
    });
    if (!r.ok) return NextResponse.json({ error: `ส่งไม่สำเร็จ (${r.status}) — ตรวจว่าบอทอยู่ในกลุ่มนี้ + group id ถูกต้อง` }, { status: 502 });
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
  if (!gid) return NextResponse.json({ error: "ยังไม่มี group id (เพิ่มบอทเข้ากลุ่ม แล้วพิมพ์ในกลุ่ม → รีเฟรช)" }, { status: 400 });
  await save({ ...cfg, groups: { ...(cfg.groups ?? {}), [slot]: gid } });
  await audit({ field: "groups", slot, saved: true });
  return NextResponse.json({ ok: true, saved: gid, error: null });
}
