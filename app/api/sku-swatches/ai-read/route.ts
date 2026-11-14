/**
 * POST /api/sku-swatches/ai-read — 🎨 AI ของแผงผ้า (1 รูปต่อครั้ง)
 *   โหมด "label" (ปุ่มหลัก · 2026-11-14 รอบ 2): body { mode: "label", count, image } — รูปที่หน้าจอวาดกรอบพร้อมเลข 1..count ไว้แล้ว
 *     → { data: { items: [{ n, label, name }] } } = เลขที่พิมพ์ข้างชิ้น + ชื่อสีไทย ของแต่ละกรอบ (AI อ่านตัวหนังสือ = แม่น · ไม่แตะตำแหน่งกรอบ)
 *   โหมด "find" (ทดลอง · ค่าเดิม): body { image } → { data: { header, chips: [{ x, y, w, h (% ของรูป), label, name, unsure }] } }
 *     ให้ AI หาตำแหน่งชิ้นเอง — GPT ชี้ตำแหน่งได้แค่ประมาณ ใช้ "คลิกที่สี" ในหน้าจอแทนได้ (ฟรี แม่นกว่า)
 *   สีจริงไม่ได้มาจาก AI — หน้าจอดูดสีจากพิกเซลเอง · ผลลัพธ์ต้องให้คนตรวจก่อนบันทึกเสมอ
 *   สิทธิ์: products.edit (ตั้งค่าแผงผ้า) · บริการเสียเงิน: "ai.swatch_read" ใน lib/paid-services → ด่านกลาง aiChat
 *   (เปิด-ปิด / เปลี่ยนรุ่น / งบ / บันทึกการใช้ ที่ /admin/paid-services) · รูปไม่ถูกเก็บ ส่งให้ AI อ่านครั้งเดียวแล้วทิ้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { normalizeAiChips, normalizeAiLabels, SWATCH_LABEL_SYSTEM, SWATCH_READ_ASK, SWATCH_READ_SYSTEM, swatchLabelAsk } from "@/lib/sku-swatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;

const MAX_IMAGE_CHARS = 2_400_000;   // base64 ของรูป ~1.7MB
/** รุ่นเริ่มต้นของฟีเจอร์นี้ — ผู้ดูแลเปลี่ยนรุ่นได้ที่ศูนย์ AI/API (รุ่นที่ตั้งในศูนย์ชนะ) */
const DEFAULT_MODEL = "gpt-4.1-mini";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel" }, { status: 400 });
  let body: { image?: unknown; mode?: unknown; count?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: "ไม่พบรูปที่จะอ่าน (รองรับ JPG / PNG / WebP)" }, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "รูปใหญ่เกินไป ลองครอปให้เหลือเฉพาะแผงก่อน" }, { status: 400 });
  const label = body.mode === "label";
  const count = Math.round(Number(body.count));
  if (label && !(count >= 1 && count <= 300)) return NextResponse.json({ error: "ตีกรอบชิ้นก่อนอย่างน้อย 1 ชิ้น (สูงสุด 300 ชิ้นต่อรูป)" }, { status: 400 });

  try {
    const img = { type: "image_url", image_url: { url: image, detail: "high" } };
    if (label) {
      const raw = await aiChat("ai.swatch_read", SWATCH_LABEL_SYSTEM, [{ type: "text", text: swatchLabelAsk(count) }, img], Math.min(9000, 400 + count * 40), DEFAULT_MODEL, { request });
      return NextResponse.json({ data: { items: normalizeAiLabels(raw, count) }, error: null });
    }
    const raw = await aiChat("ai.swatch_read", SWATCH_READ_SYSTEM, [{ type: "text", text: SWATCH_READ_ASK }, img], 9000, DEFAULT_MODEL, { request });
    return NextResponse.json({ data: normalizeAiChips(raw), error: null });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[sku-swatches/ai-read]", e);
    return NextResponse.json({ error: "AI อ่านรูปไม่สำเร็จ กรุณาลองใหม่ หรือพิมพ์เลข/ชื่อสีเอง" }, { status: 502 });
  }
}
