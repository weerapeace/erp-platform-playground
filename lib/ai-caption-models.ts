/**
 * โมเดล GPT ที่เลือกได้ + ราคา (ไฟล์ pure — ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์)
 * ใช้ที่: หน้ารายละเอียดสินค้า (ui_config ai_product_model · lib/ai-caption) · ศูนย์ AI / API ที่เสียเงิน (lib/paid-services)
 * ราคา = บาทต่อ 1 ล้าน token (อัตรา 36 บาท/USD) — เอาไว้โชว์ให้เจ้าของเห็นก่อนเลือก + ประมาณค่าใช้จ่าย
 */
export const AI_MODEL_CHOICES: { id: string; label: string; note: string; inPerM: number; outPerM: number }[] = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini (ถูกสุด)", note: "เร็ว ประหยัด · งานเขียนไทยพื้น ๆ", inPerM: 5.4, outPerM: 21.6 },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini (คุ้มสุด)", note: "เขียนไทยเรียบกว่า ตามคำสั่งดีกว่า", inPerM: 14.4, outPerM: 57.6 },
  { id: "gpt-4o", label: "gpt-4o (คุณภาพสูง)", note: "งานเขียนดีสุดในสาย OpenAI", inPerM: 90, outPerM: 360 },
  { id: "gpt-4.1", label: "gpt-4.1 (คุณภาพสูง รุ่นใหม่)", note: "ตามคำสั่งเป๊ะ เขียนยาวได้ดี", inPerM: 72, outPerM: 288 },
];
