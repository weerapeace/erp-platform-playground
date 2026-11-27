/**
 * POST /api/voice-assistant/transcribe — ผู้ช่วยเสียง: ฟังเสียงคำสั่งสั้น ๆ เป็นข้อความ (กติกา lib/voice-assistant · คู่มือ docs/voice-assistant.md)
 *
 * body: multipart/form-data
 *   audio   = ไฟล์เสียงที่อัดจากเบราว์เซอร์ (webm/ogg/mp4/m4a/wav · ไม่เกิน 2 MB ≈ 1-2 นาที)
 *   seconds = (ไม่บังคับ) ความยาวที่ฝั่งอัดวัดได้ — ใช้คิดค่าใช้จ่ายเมื่อ OpenAI ไม่คืนความยาว
 * คืน: { text, seconds, model }
 *
 * - ผ่านด่านกลาง paid-services key "ai.voice_listen" (เปิด/ปิด · ใครใช้ได้ · งบ · บันทึกค่าใช้จ่าย) · รุ่นถอดเสียงเลือกได้ในศูนย์ (providerChoices)
 * - ส่ง "คำศัพท์ช่วยสะกด" (ชื่อแบรนด์ + ประเภทสินค้าจริงในระบบ) ไปด้วย → ฟังชื่อเฉพาะถูกขึ้น
 * - ต้องล็อกอิน · ปิด/เกินงบ/ไม่ได้รับสิทธิ์ = 409 { fallback: true } → หน้าจอสลับไปใช้ตัวฟังฟรีของเบราว์เซอร์
 */
import { NextRequest, NextResponse } from "next/server";
import { openAiKey } from "@/lib/ai-caption";
import { aiTranscribe, pickedProvider, AccessDeniedError, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { voiceAllowed } from "@/lib/voice-assistant-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 2 * 1024 * 1024;
const EXT_BY_TYPE: [RegExp, string][] = [[/webm/i, "webm"], [/ogg|opus/i, "ogg"], [/mp4|m4a|aac/i, "m4a"], [/wav/i, "wav"], [/mpeg|mp3/i, "mp3"]];

// คำศัพท์ช่วยสะกด (แบรนด์ + ประเภทสินค้า) — แคช 5 นาที
let vocabCache: { at: number; text: string } | null = null;
async function vocabulary(): Promise<string> {
  if (vocabCache && Date.now() - vocabCache.at < 300_000) return vocabCache.text;
  const admin = supabaseAdmin();
  const [brands, fams] = await Promise.all([
    admin.from("brands").select("name").limit(80),
    admin.from("product_families").select("name").not("is_active", "is", false).limit(300),
  ]);
  const names = [...((brands.data ?? []) as { name?: string }[]), ...((fams.data ?? []) as { name?: string }[])]
    .map((r) => String(r.name ?? "").trim()).filter(Boolean);
  const text = `คำสั่งงานระบบ ERP ภาษาไทย เช่น เปิดหน้าใบสั่งซื้อ, เพิ่ม SKU ใหม่. คำเฉพาะ: ${[...new Set(names)].join(", ")}`.slice(0, 800);
  vocabCache = { at: Date.now(), text };
  return text;
}

export async function POST(request: NextRequest) {
  const { data: auth } = await supabaseFromRequest(request).auth.getUser().catch(() => ({ data: { user: null } }));
  if (!auth.user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });
  if (!(await voiceAllowed(request, auth.user.id))) return NextResponse.json({ error: "ผู้ดูแลยังไม่ได้เปิดผู้ช่วยเสียงให้บัญชีนี้" }, { status: 403 });
  if (!openAiKey()) return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งรหัส AI (OPENAI_API_KEY)", fallback: true }, { status: 409 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "อ่านไฟล์เสียงไม่ได้" }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || !audio.size) return NextResponse.json({ error: "ไม่ได้ยินเสียง ลองกดค้างแล้วพูดใหม่" }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "พูดยาวเกินไป ลองแบ่งเป็นคำสั่งสั้น ๆ" }, { status: 413 });
  const ext = EXT_BY_TYPE.find(([re]) => re.test(audio.type || ""))?.[1] ?? "webm";
  const seconds = Number(form.get("seconds") ?? 0) || 0;

  try {
    const [model, prompt] = await Promise.all([pickedProvider("ai.voice_listen"), vocabulary().catch(() => "")]);
    const r = await aiTranscribe("ai.voice_listen", audio, `voice.${ext}`, { language: "th", prompt, model: model ?? "gpt-4o-transcribe", secondsHint: seconds }, { request, userId: auth.user.id });
    return NextResponse.json({ text: r.text.trim(), seconds: Math.round(r.duration * 10) / 10, model: r.model }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError || e instanceof AccessDeniedError) return NextResponse.json({ error: e.message, fallback: true }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "ฟังเสียงไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }
}
