/**
 * /api/voice-assistant/command — ผู้ช่วยเสียง: เข้าใจคำสั่ง (กติกา lib/voice-assistant · คู่มือ docs/voice-assistant.md)
 *
 * GET  → { enabled, listen } — ปุ่มไมค์โชว์ไหม (enabled = ฟีเจอร์เปิด + คนนี้ได้รับสิทธิ์ + ไม่เกินงบ) · listen = ใช้ตัวฟังของ OpenAI ได้ไหม
 * POST { text, history?, choices?, path? } → VoiceReply { say, action, page?, sku?, choiceId? }
 *
 * - ผ่านด่านกลาง paid-services key "ai.voice_assistant" (ค่าเริ่ม gpt-6-luna · คิดน้อยเพื่อให้ตอบไว · แอดมินเปลี่ยนรุ่นได้)
 * - AI เลือกหน้าได้เฉพาะ "หน้าที่คนนี้เห็นได้" (ของกลาง lib/menu-pages-server — กฎเดียวกับค้นหารวม)
 * - เพิ่ม SKU = แค่ส่งค่าร่างกลับไปเปิดตัวเพิ่ม SKU ของเดิม · การบันทึกจริงผ่าน /api/skus/wizard-create (สิทธิ์ products.create + audit) ตามปกติ
 * - ทุกคำสั่งลง audit (action voice_command) — ใครพูดอะไร ระบบทำอะไรต่อ
 */
import { NextRequest, NextResponse } from "next/server";
import { openAiKey } from "@/lib/ai-caption";
import { aiAvailable, aiChat, AccessDeniedError, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { listVisiblePages, loadMyAccess } from "@/lib/menu-pages-server";
import { writeAudit } from "@/lib/audit";
import { voiceAllowed } from "@/lib/voice-assistant-server";
import { buildVoiceSystemPrompt, buildVoiceUserPayload, cleanChoices, cleanHistory, normalizeVoiceReply, VOICE_LIMITS } from "@/lib/voice-assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "gpt-6-luna";
/** รุ่นสำรองเมื่อรุ่นหลักเรียกไม่สำเร็จ (ถูก · รองรับตอบ JSON แน่นอน) */
const FALLBACK_MODEL = "gpt-4o-mini";

async function currentUser(request: NextRequest) {
  const sb = supabaseFromRequest(request);
  const { data } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
  return { sb, user: data.user };
}

export async function GET(request: NextRequest) {
  const { user } = await currentUser(request);
  if (!user) return NextResponse.json({ enabled: false, listen: false }, { status: 401 });
  if (!openAiKey()) return NextResponse.json({ enabled: false, listen: false });
  const ctx = { request, userId: user.id };
  const [allowed, on, listen] = await Promise.all([voiceAllowed(request, user.id), aiAvailable("ai.voice_assistant", ctx), aiAvailable("ai.voice_listen", ctx)]);
  return NextResponse.json({ enabled: allowed && on, listen }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const { sb, user } = await currentUser(request);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  if (!openAiKey()) return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งรหัส AI (OPENAI_API_KEY)" }, { status: 503 });
  if (!(await voiceAllowed(request, user.id))) return NextResponse.json({ error: "ผู้ดูแลยังไม่ได้เปิดผู้ช่วยเสียงให้บัญชีนี้" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, VOICE_LIMITS.textChars) : "";
  if (!text) return NextResponse.json({ error: "ยังไม่มีคำสั่ง ลองพูดหรือพิมพ์ใหม่" }, { status: 400 });
  const history = cleanHistory(body.history);
  const choices = cleanChoices(body.choices);
  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "";

  try {
    const [access, canAddSku] = await Promise.all([
      loadMyAccess(sb, user.id).catch(() => ({ can: (k: string | null | undefined) => !k })),
      apiCan(request, "products.create"),
    ]);
    const pages = await listVisiblePages(access.can);
    const system = buildVoiceSystemPrompt(pages, canAddSku);
    const content = [{ type: "text", text: buildVoiceUserPayload({ text, history, choices, path }) }];
    const ctx = { request, userId: user.id, effort: "low" as const };
    let raw: Record<string, unknown>;
    try {
      raw = await aiChat("ai.voice_assistant", system, content, 400, DEFAULT_MODEL, ctx);
    } catch (e) {
      // ด่านกลางปิด/เกินงบ/ไม่มีสิทธิ์ = ส่งต่อ · อย่างอื่น (เช่น รุ่นใหม่ไม่รับพารามิเตอร์) = ลองรุ่นสำรองที่เสถียรอีกครั้งเดียว
      if (e instanceof ServiceOffError || e instanceof BudgetExceededError || e instanceof AccessDeniedError) throw e;
      console.error("[voice-assistant] รุ่นหลักตอบไม่ได้ ลองรุ่นสำรอง:", e instanceof Error ? e.message : e);
      raw = await aiChat("ai.voice_assistant", system, content, 400, FALLBACK_MODEL, ctx);
    }
    const reply = normalizeVoiceReply(raw, { pages, choices, canAddSku });

    await writeAudit(supabaseAdmin(), {
      action: "voice_command", entityType: "voice_assistant", actorId: user.id, actorName: user.email ?? null,
      metadata: { said: text, path, action: reply.action, page: reply.page?.href ?? null, sku: reply.sku ?? null, choice: reply.choiceId ?? null, reply: reply.say },
    });
    return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError || e instanceof AccessDeniedError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "ผู้ช่วยตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง" }, { status: 502 });
  }
}
