/**
 * POST /api/pattern-projects/read-label — ให้ AI อ่านตัวเขียนบนชิ้นแพทเทิร์นกระดาษ (เจ้าของขอ 2026-11-16)
 *   body { image: "data:image/jpeg;base64,…" (รูปชิ้นที่ดัดตรงแล้ว ตัดเฉพาะชิ้น ย่อจากหน้าจอ ≤ ~1MB) }
 *   → { data: { text, name, w, l, count, unsure }, error } — เป็นค่าที่เติมให้ ผู้ใช้ตรวจ/แก้ก่อนกดเสมอ
 *   สิทธิ์: pattern_studio.edit + สิทธิ์ใช้ AI (ai.caption — ตัวเดียวกับปุ่ม AI อื่น)
 *   บริการเสียเงิน: ลงทะเบียน "ai.pattern_label" ใน lib/paid-services · เรียกผ่านด่านกลาง aiChat (เปิด-ปิด/งบ/บันทึกการใช้ ที่ /admin/paid-services)
 *   รูปไม่ถูกเก็บ — ส่งให้ AI อ่านครั้งเดียวแล้วทิ้ง · ไม่เขียนฐานข้อมูล · คำสั่ง + ตัวตรวจคำตอบ: lib/pattern-label-read
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { LABEL_READ_ASK, LABEL_READ_SYSTEM, parseLabelRead } from "@/lib/pattern-label-read";
import { PROJECT_PERM } from "@/lib/pattern-project-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 1_500_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.edit); if (denied) return denied;
  if (!(await apiCan(request, "ai.caption"))) return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 403 });
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel" }, { status: 400 });
  let body: { image?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: "ไม่มีรูปชิ้นให้อ่าน" }, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "รูปใหญ่เกินไป" }, { status: 400 });
  try {
    const raw = await aiChat("ai.pattern_label", LABEL_READ_SYSTEM, [{ type: "text", text: LABEL_READ_ASK }, { type: "image_url", image_url: { url: image, detail: "high" } }], 400, "gpt-4.1-mini", { request });
    return NextResponse.json({ data: parseLabelRead(raw), error: null });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "AI อ่านตัวเขียนไม่สำเร็จ ลองใหม่ หรือพิมพ์เอง" }, { status: 502 });
  }
}
