/**
 * POST /api/pattern-projects/ai-draft — ให้ AI ดูรูปกระเป๋าสำเร็จ แล้วร่างค่าแม่แบบทรง (รอบ 5 · 2026-11-10)
 *   body { image: "data:image/jpeg;base64,…" (ย่อมาจากหน้าจอแล้ว ≤ ~1.5MB), width_cm: ความกว้างก้นจริงที่ผู้ใช้บอก }
 *   → { data: { params (ค่าแม่แบบที่อยู่ในขอบเขต), is_bag, fits, confidence, style, notes }, error }
 *   สิทธิ์: pattern_studio.edit + สิทธิ์ใช้ AI (ai.caption — ตัวเดียวกับปุ่ม AI อื่น)
 *   บริการเสียเงิน: ลงทะเบียน "ai.bag_draft" ใน lib/paid-services · เรียกผ่านด่านกลาง aiChat (เปิด-ปิด/งบ/บันทึกการใช้ อยู่ที่ /admin/paid-services)
 *   รูปไม่ถูกเก็บ — ส่งให้ AI อ่านครั้งเดียวแล้วทิ้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { BAG_DRAFT_ASK, BAG_DRAFT_SYSTEM, bagParamsFromAiDraft } from "@/lib/bag-ai-draft";
import { PROJECT_PERM } from "@/lib/pattern-project-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 2_100_000;   // base64 ของรูป ~1.5MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.edit); if (denied) return denied;
  if (!(await apiCan(request, "ai.caption"))) return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 403 });
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel" }, { status: 400 });
  let body: { image?: unknown; width_cm?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: "เลือกรูปกระเป๋าก่อน (รองรับ JPG / PNG / WebP)" }, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "รูปใหญ่เกินไป ลองรูปที่เล็กลง" }, { status: 400 });
  const width = Number(body.width_cm);
  if (!(width >= 10 && width <= 80)) return NextResponse.json({ error: "ใส่ความกว้างก้นกระเป๋าจริง (10–80 ซม.) ก่อน" }, { status: 400 });

  try {
    const raw = await aiChat("ai.bag_draft", BAG_DRAFT_SYSTEM, [{ type: "text", text: BAG_DRAFT_ASK }, { type: "image_url", image_url: { url: image, detail: "high" } }], 600, "gpt-4.1-mini", { request });
    const d = bagParamsFromAiDraft(raw, width);
    return NextResponse.json({ data: { params: d.params, is_bag: d.isBag, fits: d.fits, confidence: d.confidence, style: d.style, notes: d.notes, sources: d.sources }, error: null });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "AI อ่านรูปไม่สำเร็จ กรุณาลองใหม่ หรือใส่ขนาดเองในตัวสร้างจากแม่แบบ" }, { status: 502 });
  }
}
