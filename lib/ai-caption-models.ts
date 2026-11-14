/**
 * โมเดล GPT ที่เลือกได้ + ราคา (ไฟล์ pure — ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์)
 * ใช้ที่: หน้ารายละเอียดสินค้า (ui_config ai_product_model · lib/ai-caption · ป๊อป AI components/ai-product-detail)
 *         ศูนย์ AI / API ที่เสียเงิน (lib/paid-services)
 * ราคา = บาทต่อ 1 ล้าน token (อัตรา 36 บาท/USD) — เอาไว้โชว์ให้เจ้าของเห็นก่อนเลือก + ประมาณค่าใช้จ่าย
 * เพิ่มรุ่นใหม่ = เพิ่มแถวที่นี่ที่เดียว (ทุกหน้าที่ให้เลือกโมเดลอ่านจากรายการนี้)
 */
export type AiModelChoice = { id: string; label: string; note: string; inPerM: number; outPerM: number };

export const AI_MODEL_CHOICES: AiModelChoice[] = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini (ถูกสุด)", note: "เร็ว ประหยัด · งานเขียนไทยพื้น ๆ", inPerM: 5.4, outPerM: 21.6 },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini (คุ้มสุด)", note: "เขียนไทยเรียบกว่า ตามคำสั่งดีกว่า", inPerM: 14.4, outPerM: 57.6 },
  { id: "gpt-4o", label: "gpt-4o (คุณภาพสูง รุ่นเก่า)", note: "งานเขียนดี", inPerM: 90, outPerM: 360 },
  { id: "gpt-4.1", label: "gpt-4.1 (คุณภาพสูง)", note: "ตามคำสั่งเป๊ะ เขียนยาวได้ดี", inPerM: 72, outPerM: 288 },
  // รุ่น 5.x = "คิดก่อนตอบ" (เวลาคิดนับเป็น token ออกด้วย) — ระบบตั้งให้คิดน้อยเพื่อคุมค่าใช้จ่าย
  { id: "gpt-5.4-mini", label: "gpt-5.4-mini (รุ่นใหม่)", note: "รุ่นใหม่ ฉลาดกว่า 4.1 · อ่านรูปละเอียดกว่า", inPerM: 27, outPerM: 162 },
  { id: "gpt-5.4", label: "gpt-5.4 (รุ่นใหม่ ตัวเต็ม)", note: "เขียนดีสุดในรายการ · แพงสุด", inPerM: 90, outPerM: 540 },
];

/** รุ่นที่ "คิดก่อนตอบ" (gpt-5.x / o-series) — เรียก API คนละแบบกับรุ่น 4.x */
export const isReasoningModel = (model: string) => /^(gpt-5|o\d)/i.test(model.trim());

/** token ที่เผื่อให้ "เวลาคิด" ของรุ่น 5.x (ตั้งคิดน้อย) — กันคำตอบถูกตัดกลางทาง */
export const REASONING_HEADROOM = 4000;

/**
 * พารามิเตอร์เพดานคำตอบของ OpenAI chat completions ตามรุ่น
 * - รุ่น 4.x: max_tokens
 * - รุ่น 5.x: ไม่รับ max_tokens → ใช้ max_completion_tokens (รวมเวลาคิด จึงบวกที่เผื่อ) + ตั้งให้คิดน้อย
 */
export function chatLimitParams(model: string, maxTokens: number): Record<string, unknown> {
  return isReasoningModel(model)
    ? { max_completion_tokens: maxTokens + REASONING_HEADROOM, reasoning_effort: "low" }
    : { max_tokens: maxTokens };
}

/** เพดานคำตอบของ Responses API (ค้นเว็บ) ตามรุ่น — รุ่น 5.x เผื่อเวลาคิด + ตั้งให้คิดน้อย */
export function responsesLimitParams(model: string, maxTokens: number): Record<string, unknown> {
  return isReasoningModel(model)
    ? { max_output_tokens: maxTokens + REASONING_HEADROOM, reasoning: { effort: "low" } }
    : { max_output_tokens: maxTokens };
}

/**
 * ค่าใช้จ่ายประมาณต่อสินค้า 1 ตัว (บาท) ของปุ่ม "ให้ AI คิดรายละเอียดสินค้า"
 * คิดจากงานจริง: รูป ~5 ใบ ≈ 14,000 token เข้า + 1,400 ออก · รุ่น 5.x บวกเวลาคิด ~600 token
 */
export function productDetailCostThb(m: AiModelChoice): number {
  const out = 1400 + (isReasoningModel(m.id) ? 600 : 0);
  return (14000 * m.inPerM + out * m.outPerM) / 1e6;
}
