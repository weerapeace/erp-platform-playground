/**
 * POST /api/subtitle/transcribe — ถอดเสียงคลิปเป็นซับ ให้โปรแกรม Louis Subtitle (ทาง "ผ่าน ERP")
 *
 * body: multipart/form-data
 *   audio  = ไฟล์เสียง (โปรแกรมย่อเป็น m4a/ogg mono ก่อนส่ง · ไม่เกิน ~4 MB ตามเพดานของ Vercel)
 *   prompt = (ไม่บังคับ) คำศัพท์ช่วยสะกด เช่น ชื่อแบรนด์ ชื่อรุ่น
 *   name   = (ไม่บังคับ) ชื่อคลิป — ใช้จดประวัติเท่านั้น
 * คืน: { segments:[{start,end,text}], words:[{word,start,end}], duration, model }
 *
 * - ผ่านด่านกลาง paid-services (เปิด/ปิด · งบ · บันทึกค่าใช้จ่าย) key "ai.transcribe"
 * - โปรแกรมส่ง Bearer token ของบัญชีที่ล็อกอินผ่าน /desktop-link · ไม่ล็อกอิน = 401
 * - ปิดฟีเจอร์/เกินงบ = 409 พร้อมข้อความ → โปรแกรมสลับไปถอดในเครื่องเอง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { openAiKey } from "@/lib/ai-caption";
import { aiTranscribe, AccessDeniedError, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;
const AUDIO_OK = /\.(m4a|mp3|mp4|ogg|oga|opus|wav|webm|mpga|mpeg)$/i;

export async function POST(request: NextRequest) {
  // ทุกบทบาทที่ล็อกอินมีสิทธิ์ products.view (ด่านกลางเดียวกับ API กลางอื่น) — กันคนนอก
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  if (!openAiKey()) return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งรหัส AI (OPENAI_API_KEY) — ใช้ถอดเสียงในเครื่องแทน" }, { status: 503 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "อ่านไฟล์เสียงไม่ได้" }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || !audio.size) return NextResponse.json({ error: "ไม่มีไฟล์เสียง" }, { status: 400 });
  const filename = (audio as File).name || "audio.m4a";
  if (!AUDIO_OK.test(filename)) return NextResponse.json({ error: "ชนิดไฟล์เสียงไม่รองรับ" }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์เสียงใหญ่เกิน 4 MB (คลิปยาวมาก) — ใช้ถอดเสียงในเครื่องแทน" }, { status: 413 });
  const prompt = String(form.get("prompt") ?? "").slice(0, 800);
  const name = String(form.get("name") ?? "").slice(0, 200);

  try {
    const r = await aiTranscribe("ai.transcribe", audio, filename, { language: "th", prompt }, { request });
    const { data } = await supabaseFromRequest(request).auth.getUser().catch(() => ({ data: { user: null } }));
    await writeAudit(supabaseAdmin(), {
      action: "transcribe", entityType: "subtitle_transcribe", actorId: data.user?.id ?? null, actorName: data.user?.email ?? null,
      metadata: { clip: name || filename, seconds: Math.round(r.duration), segments: r.segments.length, via: "Louis Subtitle" },
    });
    return NextResponse.json({ segments: r.segments, words: r.words, duration: r.duration, model: r.model });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError || e instanceof AccessDeniedError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "ถอดเสียงไม่สำเร็จ" }, { status: 502 });
  }
}
