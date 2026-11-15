/**
 * /api/ai/attr-fill — ให้ AI ช่วยเติม "ช่องคุณลักษณะของหมวด" (ของกลาง · ใช้ได้ทุกร้าน: Shopee / TikTok / Lazada)
 *   POST { platform, name, description, category?, fields: AiAttrField[] (เฉพาะช่องที่ยังว่าง), image_keys?: string[] (รูปในระบบ ≤ 3) }
 *   → { hits: SuggestHit[], error }   (ไม่บันทึกอะไร — หน้าเว็บโชว์ "AI เดา · ตรวจก่อน" แล้วให้คนกดใส่ลงร่างเอง)
 *
 * สิทธิ์: ai.caption (สิทธิ์ "ใช้ AI ที่มีค่าใช้จ่าย" ตัวเดียวกับปุ่ม AI อื่น) · บริการเสียเงิน: "ai.attr_fill" ใน lib/paid-services → ด่านกลาง aiChat
 * กติกา pure + เทสต์: lib/attr-ai-fill (คำสั่ง + แปลงคำตอบให้ตรงตัวเลือกจริง) · คู่กับตัวจับคำฟรี lib/attr-suggest
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { aiChat, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { imageParts, imagesToDataUrls, openAiKey } from "@/lib/ai-caption";
import { attrAiPrompt, parseAttrAiResult, type AiAttrField } from "@/lib/attr-ai-fill";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_IMAGES = 3;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

/** ช่องจากหน้าเว็บ → รูปที่ตัวช่วยรับ (กันค่าแปลก) */
function fieldsOf(v: unknown): AiAttrField[] {
  if (!Array.isArray(v)) return [];
  return v.map((x): AiAttrField | null => {
    const o = (x && typeof x === "object" ? x : null) as Record<string, unknown> | null;
    if (!o || !str(o.id) || !str(o.name)) return null;
    const options = Array.isArray(o.options) ? (o.options as unknown[]).map((p) => { const q = (p && typeof p === "object" ? p : {}) as Record<string, unknown>; return { id: str(q.id), name: str(q.name) }; }).filter((p) => p.id && p.name) : [];
    return { id: str(o.id), name: str(o.name).slice(0, 100), required: o.required === true, multiple: o.multiple === true, customizable: o.customizable === true, numeric: o.numeric === true, options };
  }).filter((f): f is AiAttrField => !!f);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "ai.caption")))
    return NextResponse.json({ hits: [], error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 401 });
  if (!openAiKey()) return NextResponse.json({ hits: [], error: "ยังไม่ได้ตั้งค่า AI (OPENAI_API_KEY)" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ hits: [], error: "invalid JSON" }, { status: 400 }); }
  const fields = fieldsOf(body.fields);
  const name = str(body.name).slice(0, 300);
  if (!fields.length) return NextResponse.json({ hits: [], error: "ไม่มีช่องที่ต้องเติม" }, { status: 400 });
  if (!name) return NextResponse.json({ hits: [], error: "ต้องมีชื่อสินค้า" }, { status: 400 });

  const prompt = attrAiPrompt({ platform: str(body.platform) || "marketplace", name, description: str(body.description), category: str(body.category) || null, fields });
  const keys = Array.isArray(body.image_keys) ? (body.image_keys as unknown[]).map(str).filter(Boolean).slice(0, MAX_IMAGES) : [];
  try {
    const images = keys.length ? imageParts(await imagesToDataUrls(keys)) : [];
    const raw = await aiChat("ai.attr_fill", prompt.system, [{ type: "text", text: prompt.user }, ...images], 1500, undefined, { request });
    return NextResponse.json({ hits: parseAttrAiResult(raw, prompt.fields), error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ hits: [], error: e.message }, { status: 409 });
    return NextResponse.json({ hits: [], error: `AI ตอบไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
}
