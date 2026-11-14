/**
 * POST /api/sku-swatches/ai-read — 🎨 ปุ่ม "อ่านจากรูป" ของแผงผ้า: ให้ AI หาชิ้นสีทุกชิ้น + เลขที่พิมพ์บนแผง + ชื่อสี (ไทย)
 *   body { image: "data:image/jpeg;base64,…" (หน้าจอย่อ/ครอปมาแล้ว ≤ ~1.5MB · 1 รูปต่อครั้ง) }
 *   → { data: { header, chips: [{ x, y, w, h (% ของรูป), label, name, unsure }] , model }, error }
 *   สีจริงไม่ได้มาจาก AI — หน้าจอดูดสีจากพิกเซลในกรอบเอง (ฟรี ตรงกว่า) · ผลลัพธ์ต้องให้คนตรวจก่อนบันทึกเสมอ
 *   สิทธิ์: products.edit (ตั้งค่าแผงผ้า) · บริการเสียเงิน: "ai.swatch_read" ใน lib/paid-services → ด่านกลาง aiChat
 *   (เปิด-ปิด / เปลี่ยนรุ่น / งบ / บันทึกการใช้ ที่ /admin/paid-services) · รูปไม่ถูกเก็บ ส่งให้ AI อ่านครั้งเดียวแล้วทิ้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { normalizeAiChips, SWATCH_READ_ASK, SWATCH_READ_SYSTEM } from "@/lib/sku-swatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;

const MAX_IMAGE_CHARS = 2_400_000;   // base64 ของรูป ~1.7MB
/** รุ่นเริ่มต้นของฟีเจอร์นี้ — ผู้ดูแลเปลี่ยนรุ่นได้ที่ศูนย์ AI/API (รุ่นที่ตั้งในศูนย์ชนะ) */
const DEFAULT_MODEL = "gpt-4.1-mini";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel" }, { status: 400 });
  let body: { image?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: "ไม่พบรูปที่จะอ่าน (รองรับ JPG / PNG / WebP)" }, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "รูปใหญ่เกินไป ลองครอปให้เหลือเฉพาะแผงก่อน" }, { status: 400 });

  try {
    const raw = await aiChat("ai.swatch_read", SWATCH_READ_SYSTEM, [{ type: "text", text: SWATCH_READ_ASK }, { type: "image_url", image_url: { url: image, detail: "high" } }], 9000, DEFAULT_MODEL, { request });
    const out = normalizeAiChips(raw);
    return NextResponse.json({ data: out, error: null });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[sku-swatches/ai-read]", e);
    return NextResponse.json({ error: "AI อ่านรูปไม่สำเร็จ กรุณาลองใหม่ หรือตีกรอบชิ้นเองแบบเดิม" }, { status: 502 });
  }
}
