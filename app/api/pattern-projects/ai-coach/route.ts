/**
 * POST /api/pattern-projects/ai-coach — ถามโค้ช AI เรื่องแพทเทิร์น (Bag CAD รอบ I3)
 *   body { summary: ข้อความสรุปแพทเทิร์นจาก lib/pattern-coach coachSummary (ผู้ใช้เห็นทั้งหมดก่อนกดส่ง · ≤ 6,000 ตัวอักษร) }
 *   → { data: { tips: [{ do, why }], note }, error }
 *   สิทธิ์: pattern_studio.edit + สิทธิ์ใช้ AI (ai.caption — ตัวเดียวกับปุ่ม AI อื่น)
 *   บริการเสียเงิน: ลงทะเบียน "ai.pattern_coach" ใน lib/paid-services · เรียกผ่านด่านกลาง aiChat (เปิด-ปิด/งบ/บันทึกการใช้ อยู่ที่นั่น)
 *   ไม่มีรูป ไม่เก็บข้อความ — ส่งให้ AI ครั้งเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { COACH_SYSTEM, parseCoachReply } from "@/lib/pattern-coach";
import { PROJECT_PERM } from "@/lib/pattern-project-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.edit); if (denied) return denied;
  if (!(await apiCan(request, "ai.caption"))) return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 403 });
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel" }, { status: 400 });
  let body: { summary?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (summary.length < 10) return NextResponse.json({ error: "ยังไม่มีข้อมูลแพทเทิร์นให้โค้ชดู" }, { status: 400 });
  if (summary.length > 6000) return NextResponse.json({ error: "ข้อความยาวเกินไป (เกิน 6,000 ตัวอักษร)" }, { status: 400 });
  try {
    const raw = await aiChat("ai.pattern_coach", COACH_SYSTEM, [{ type: "text", text: summary }], 700, "gpt-4.1-mini", { request });
    const d = parseCoachReply(raw);
    if (!d.tips.length) return NextResponse.json({ error: "AI ตอบไม่เป็นรูปแบบที่อ่านได้ ลองใหม่อีกครั้ง" }, { status: 502 });
    return NextResponse.json({ data: d, error: null });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "ถามโค้ช AI ไม่สำเร็จ กรุณาลองใหม่ — โค้ชในเครื่องด้านบนยังใช้ได้ตามปกติ" }, { status: 502 });
  }
}
