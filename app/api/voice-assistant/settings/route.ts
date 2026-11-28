/**
 * /api/voice-assistant/settings — ตั้งค่าผู้ช่วยเสียง (หน้า /admin/voice-assistant · คู่มือ docs/voice-assistant.md)
 *
 * GET              → { data: VoiceSettings, history: [...ประวัติการตั้งค่า 20 ครั้งล่าสุด] } — สิทธิ์ admin.paid_services
 * GET ?view=log    → { data: [...คำสั่งเสียงล่าสุด 100 รายการ (audit voice_command)] } — ใครพูดอะไร ระบบทำอะไร
 * PUT { settings } → บันทึกทั้งชุด (ตรวจค่าด้วย normalizeVoiceSettings) · ลงประวัติ (changes: auditDiff ต่อคำสั่ง) · คืนค่าเดิมไว้ทำปุ่มย้อนกลับ
 *
 * ที่เก็บ = ui_config VOICE_SETTINGS_KEY (ไม่มีตารางใหม่) · เปิด-ปิดทั้งระบบ / ใครใช้ได้ / งบ / รุ่น AI ยังอยู่ที่ศูนย์ AI (/admin/paid-services)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { auditDiff, writeAudit } from "@/lib/audit";
import { loadVoiceSettings } from "@/lib/voice-assistant-server";
import { normalizeVoiceSettings, VOICE_COMMANDS, VOICE_SETTINGS_KEY } from "@/lib/voice-assistant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ENTITY = "voice_assistant_settings";

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "admin.paid_services");
  if (denied) return denied;
  const admin = supabaseAdmin();
  if (new URL(request.url).searchParams.get("view") === "log") {
    const { data, error } = await admin.from("audit_logs").select("id, created_at, metadata")
      .eq("action", "voice_command").order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ data: [], error: "โหลดประวัติคำสั่งไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ data: data ?? [], error: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const [settings, hist] = await Promise.all([
    loadVoiceSettings(),
    admin.from("audit_logs").select("id, created_at, metadata").eq("entity_type", ENTITY).order("created_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ data: settings, history: hist.data ?? [], error: null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const denied = await guardApi(request, "admin.paid_services");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { settings?: unknown } | null;
  if (!body?.settings) return NextResponse.json({ error: "ไม่มีค่าตั้งที่จะบันทึก" }, { status: 400 });
  const next = normalizeVoiceSettings(body.settings);
  const before = await loadVoiceSettings();
  if (JSON.stringify(next) === JSON.stringify(before)) return NextResponse.json({ data: next, before, error: null });

  const admin = supabaseAdmin();
  const { error } = await admin.from("ui_config").upsert({ key: VOICE_SETTINGS_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  // ประวัติ: แตกเป็นช่องรายคำสั่ง (เปิด/โหมด/ตัวอย่าง) ให้หน้าดูประวัติอ่านง่าย
  const flat = (s: typeof next) => Object.fromEntries(VOICE_COMMANDS.flatMap((k) => [
    [`${k}.enabled`, s.commands[k].enabled], [`${k}.mode`, s.commands[k].mode], [`${k}.examples`, s.commands[k].examples.join(" | ")],
  ]));
  const actor = await requestActor(supabaseFromRequest(request));
  await writeAudit(admin, {
    action: "update", entityType: ENTITY, actorId: actor.id, actorName: actor.name,
    metadata: { changes: auditDiff(flat(before), flat(next)) },
  });
  return NextResponse.json({ data: next, before, error: null });
}
