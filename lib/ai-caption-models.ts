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
  // รุ่น 5.x = "คิดก่อนตอบ" (เวลาคิดนับเป็น token ออกด้วย) — ระดับการคิดตั้งที่ศูนย์ AI (ค่าเริ่ม กลาง)
  { id: "gpt-5.4-mini", label: "gpt-5.4-mini (รุ่นใหม่)", note: "รุ่นใหม่ ฉลาดกว่า 4.1 · อ่านรูปละเอียดกว่า", inPerM: 27, outPerM: 162 },
  { id: "gpt-5.4", label: "gpt-5.4 (รุ่นใหม่ ตัวเต็ม)", note: "เขียนดีสุดในรายการ · แพงสุด", inPerM: 90, outPerM: 540 },
];

/** รุ่นที่ "คิดก่อนตอบ" (gpt-5.x / o-series) — เรียก API คนละแบบกับรุ่น 4.x */
export const isReasoningModel = (model: string) => /^(gpt-5|o\d)/i.test(model.trim());

/**
 * ระดับการคิดของรุ่น 5.x — ตั้งได้ที่ศูนย์ AI (การ์ด "รุ่นหลักของทั้งระบบ") · ใช้กับทุกงานที่วิ่งบนรุ่น 5.x
 * เดิมล็อก "low" ทำให้รุ่นใหม่ฉลาดขึ้นไม่เต็มที่ (เจ้าของบ่น 2026-11-27) → ค่าเริ่ม "medium"
 * token ที่ใช้คิดนับเป็น token ออก (คิดเงิน) — ยิ่งคิดมากยิ่งแพงต่อครั้ง
 */
export type ReasoningEffort = "low" | "medium" | "high";
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";
export const EFFORT_CHOICES: { id: ReasoningEffort; label: string; note: string; extraOut: number; headroom: number }[] = [
  { id: "low", label: "น้อย", note: "เร็ว ถูก · งานง่าย", extraOut: 600, headroom: 4000 },
  { id: "medium", label: "กลาง (แนะนำ)", note: "สมดุล ฉลาดขึ้นชัด", extraOut: 1500, headroom: 8000 },
  { id: "high", label: "มาก", note: "คิดละเอียดสุด · แพงและช้า", extraOut: 4000, headroom: 16000 },
];
export const isEffort = (v: unknown): v is ReasoningEffort => v === "low" || v === "medium" || v === "high";
const effortRow = (e?: ReasoningEffort | null) => EFFORT_CHOICES.find((x) => x.id === e) ?? EFFORT_CHOICES.find((x) => x.id === DEFAULT_REASONING_EFFORT)!;
/** token คิดที่บวกเพิ่มต่อครั้ง (ไว้ประมาณค่าใช้จ่าย) — เฉพาะรุ่น 5.x */
export const reasoningExtraOut = (model: string | null | undefined, effort?: ReasoningEffort | null) => (model && isReasoningModel(model) ? effortRow(effort).extraOut : 0);

/** token ที่เผื่อให้ "เวลาคิด" ระดับกลาง — กันคำตอบถูกตัดกลางทาง (ระดับอื่นดู EFFORT_CHOICES.headroom) */
export const REASONING_HEADROOM = 8000;

/**
 * พารามิเตอร์เพดานคำตอบของ OpenAI chat completions ตามรุ่น
 * - รุ่น 4.x: max_tokens
 * - รุ่น 5.x: ไม่รับ max_tokens → ใช้ max_completion_tokens (รวมเวลาคิด จึงบวกที่เผื่อ) + ระดับการคิด
 */
export function chatLimitParams(model: string, maxTokens: number, effort?: ReasoningEffort | null): Record<string, unknown> {
  const e = effortRow(effort);
  return isReasoningModel(model)
    ? { max_completion_tokens: maxTokens + e.headroom, reasoning_effort: e.id }
    : { max_tokens: maxTokens };
}

/** เพดานคำตอบของ Responses API (ค้นเว็บ) ตามรุ่น — รุ่น 5.x เผื่อเวลาคิด + ระดับการคิด */
export function responsesLimitParams(model: string, maxTokens: number, effort?: ReasoningEffort | null): Record<string, unknown> {
  const e = effortRow(effort);
  return isReasoningModel(model)
    ? { max_output_tokens: maxTokens + e.headroom, reasoning: { effort: e.id } }
    : { max_output_tokens: maxTokens };
}

/**
 * ค่าใช้จ่ายประมาณต่อสินค้า 1 ตัว (บาท) ของปุ่ม "ให้ AI คิดรายละเอียดสินค้า"
 * คิดจากงานจริง: รูป ~5 ใบ ≈ 14,000 token เข้า + 1,400 ออก · รุ่น 5.x บวกเวลาคิดตามระดับ (กลาง ~1,500)
 */
export function productDetailCostThb(m: AiModelChoice, effort?: ReasoningEffort | null): number {
  const out = 1400 + reasoningExtraOut(m.id, effort);
  return (14000 * m.inPerM + out * m.outPerM) / 1e6;
}

/**
 * "รุ่นหลักของทั้งระบบ" (เจ้าของเลือกแบบ B 2026-11-27) — งานเขียน/คิด (PaidService.modelTier = "main") ใช้รุ่นนี้
 * งานอ่านบิล/แปล/งานง่าย ใช้รุ่นที่เหมาะในโค้ด · ตั้งเฉพาะงานที่ศูนย์ AI ชนะเสมอ
 * เก็บที่ ui_config key นี้ { model, effort } · ยังไม่ตั้ง = ใช้ค่าเดิมของป๊อป AI รายละเอียดสินค้า (ai_product_model) → DEFAULT_MAIN_MODEL
 */
export const AI_MAIN_MODEL_KEY = "ai_main_model";
/** ui_config เดิมของป๊อป AI รายละเอียดสินค้า — เลิกเขียนแล้ว อ่านเป็นค่าตั้งต้นของรุ่นหลักเท่านั้น */
export const LEGACY_PRODUCT_MODEL_KEY = "ai_product_model";
export const DEFAULT_MAIN_MODEL = "gpt-4.1-mini";
export type AiMainSetting = { model: string; effort: ReasoningEffort };
/** ทำความสะอาดค่าที่อ่านจาก ui_config — รุ่นที่ไม่อยู่ในรายการ = fallback */
export function cleanMainSetting(raw: unknown, fallbackModel?: string | null): AiMainSetting {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ok = (m: unknown): m is string => typeof m === "string" && AI_MODEL_CHOICES.some((x) => x.id === m);
  const model = ok(v.model) ? v.model : ok(fallbackModel) ? fallbackModel : DEFAULT_MAIN_MODEL;
  return { model, effort: isEffort(v.effort) ? v.effort : DEFAULT_REASONING_EFFORT };
}
