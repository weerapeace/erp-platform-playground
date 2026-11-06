/**
 * ทะเบียนกลาง "AI และ API ที่เสียเงิน" (ไฟล์ pure ใช้ได้ทั้งหน้าจอ + API + เทสต์) — หน้า /admin/paid-services
 *
 * ทุกจุดในโค้ดที่เรียก AI / บริการเสียเงิน ต้องลงทะเบียนที่นี่ และเรียกผ่านด่านกลาง lib/paid-services-server:
 *   GPT (OpenAI)      → aiChat("<key>", …)          แทนการยิง OpenAI ตรง
 *   Cloudflare AI     → getAiFor("<key>")           แทน getAi()
 *   อื่น ๆ (สลิป/LINE/อีเมล) → serviceOn("<key>") ก่อนเรียก + logServiceUse("<key>", …)
 * เทสต์ lib/__tests__/paid-services-guard.test.ts ไล่ตรวจโค้ดทั้งระบบ — เรียกตรง / ใช้ key ที่ไม่ลงทะเบียน / files ไม่ตรง = เทสต์ไม่ผ่าน
 *
 * เพิ่มจุดใหม่: (1) เพิ่มแถวใน PAID_SERVICES (key ไม่ซ้ำ · files = ไฟล์ที่เรียกจริง) (2) เรียกผ่านด่านกลางด้วย key นั้น
 * ค่าที่แอดมินเปลี่ยน (เปิด/ปิด · โมเดล) เก็บในตาราง paid_service_settings · ไม่มีแถว = ค่าเริ่มต้น (เปิด · โมเดลเดิมของระบบ)
 */
import { AI_MODEL_CHOICES } from "@/lib/ai-caption-models";

export type PaidProvider = "openai" | "cloudflare" | "easyslip" | "line" | "email" | "shippop";
/** ai_chat = เลือกโมเดลได้ + คิดเงินตามคำ · ai_ocr = AI ฟรีตามโควตา · per_call = คิดต่อครั้ง/ตามโควตา · locked = ปิดไม่ได้ (โชว์อย่างเดียว) */
export type PaidKind = "ai_chat" | "ai_ocr" | "per_call" | "locked";

export type PaidService = {
  key: string;
  th: string; en: string;
  /** หมวดงาน (หัวข้อในตาราง) */
  group: string;
  /** ใช้ที่หน้าไหน (ภาษาคน) */
  usedAt: string;
  provider: PaidProvider;
  kind: PaidKind;
  /** ปิดแล้วเกิดอะไร (โชว์ในหน้า) */
  offBehavior: string;
  /** ราคาโดยประมาณ (ภาษาคน) */
  costHint: string;
  /** ไฟล์ที่เรียกจริง — เทสต์ตรวจว่าไฟล์มีอยู่และอ้าง key นี้ */
  files: string[];
};

export const PROVIDER_LABEL: Record<PaidProvider, string> = {
  openai: "OpenAI (GPT)", cloudflare: "Cloudflare AI", easyslip: "EasySlip", line: "LINE", email: "อีเมล", shippop: "Shippop",
};

const GPT_COST = "คิดตามจำนวนคำ · ดูราคาตามโมเดลที่เลือก";
const GPT_OFF = "ปุ่มนี้ขึ้นข้อความ \"ผู้ดูแลปิดฟีเจอร์นี้ไว้\" · กรอกเองได้ตามปกติ";

export const PAID_SERVICES: PaidService[] = [
  // ── ทั่วทั้งระบบ
  { key: "ai.translate", th: "แปลภาษา ไทย ↔ อังกฤษ (GPT)", en: "Translate TH ↔ EN (GPT)", group: "ทั่วทั้งระบบ",
    usedAt: "ตั๋วงาน Pattern · เว็บร้าน 2 ภาษา · ชื่อฟิลด์ · โน้ตในป๊อปโพสต์", provider: "openai", kind: "ai_chat",
    offBehavior: "ยังแปลได้ — สลับไปใช้ตัวแปลฟรี (Cloudflare / Google) ซึ่งแปลตรงตัวกว่า", costHint: GPT_COST, files: ["app/api/ai/translate/route.ts"] },
  { key: "cf.translate", th: "แปลภาษา (ตัวสำรองฟรี)", en: "Translate (free fallback)", group: "ทั่วทั้งระบบ",
    usedAt: "ใช้เมื่อ GPT ปิด/ล่ม", provider: "cloudflare", kind: "ai_ocr",
    offBehavior: "ข้ามไปใช้ Google แปลฟรีแทน", costHint: "ฟรีตามโควตา (ทำงานเมื่อตั้งรหัส Cloudflare ไว้)", files: ["app/api/ai/translate/route.ts"] },
  // ── คอนเทนต์ / การตลาด
  { key: "ai.caption", th: "เขียนแคปชั่น AI", en: "AI captions", group: "คอนเทนต์ / การตลาด",
    usedAt: "คอนเทนต์ (ทีละช่อง / ทั้งใบ) · อัลบั้มคอนเทนต์", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST,
    files: ["app/api/ai/caption/route.ts", "app/api/ai/caption-all/route.ts", "app/api/content-albums/[id]/ai-caption/route.ts"] },
  { key: "ai.mass_plan", th: "วางแผนคอนเทนต์ทั้งชุด", en: "Mass content plan", group: "คอนเทนต์ / การตลาด",
    usedAt: "แผนคอนเทนต์ (ร่างทีละหลายโพสต์)", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/ai/mass-plan/route.ts"] },
  { key: "ai.brand_profile", th: "ร่างโปรไฟล์แบรนด์", en: "Brand profile draft", group: "คอนเทนต์ / การตลาด",
    usedAt: "การ์ดแบรนด์", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/ai/brand-profile-draft/route.ts"] },
  { key: "ai.product_detail", th: "เขียนรายละเอียดสินค้า", en: "Product description writer", group: "สินค้า / เว็บร้าน",
    usedAt: "หน้าสินค้า (รายละเอียดสำหรับเว็บ/แพลตฟอร์ม)", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/ai/product-detail/route.ts"] },
  // ── จัดซื้อ / บิล
  { key: "ai.seller_bill", th: "อ่านบิลร้านจีน + จับคู่สินค้า", en: "China seller bill reader", group: "จัดซื้อ / บิล",
    usedAt: "จับคู่บิลจีน · รับบิลเข้าใบสำคัญจ่าย", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST,
    files: ["lib/seller-bill.ts", "lib/seller-bill-intake.ts"] },
  { key: "ai.delivery_bill", th: "อ่านใบส่งของ", en: "Delivery note reader", group: "จัดซื้อ / บิล",
    usedAt: "รับของเข้า (อ่านใบส่งของจากรูป)", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["lib/delivery-bill.ts"] },
  // ── LINE
  { key: "ai.design_line", th: "รับงานออกแบบจากไลน์", en: "Design requests from LINE", group: "LINE",
    usedAt: "กล่องงานออกแบบจากไลน์ (สรุปข้อความ)", provider: "openai", kind: "ai_chat",
    offBehavior: "งานจากไลน์ยังเข้ากล่องตามปกติ แต่ไม่มีสรุปอัตโนมัติ", costHint: GPT_COST, files: ["lib/design-line-inbox.ts"] },
  { key: "ai.order_capture", th: "รับคำสั่งซื้อจากไลน์", en: "Orders from LINE", group: "LINE",
    usedAt: "คำสั่งซื้อจากไลน์ (อ่านรายการ)", provider: "openai", kind: "ai_chat",
    offBehavior: "คำสั่งซื้อยังเข้าระบบ แต่ต้องกรอกรายการเอง", costHint: GPT_COST, files: ["lib/order-capture.ts"] },
  // ── ผลิต / งานทีม
  { key: "ai.work_log", th: "อ่านใบจดผลงาน", en: "Work log reader", group: "ผลิต / งานทีม",
    usedAt: "ใบจดผลงาน (อ่านลายมือจากรูป)", provider: "openai", kind: "ai_chat",
    offBehavior: "อัปรูปได้ตามปกติ แต่ต้องกรอกตัวเลขเอง", costHint: GPT_COST, files: ["lib/work-log-server.ts"] },
  { key: "ai.team_split", th: "แบ่งงานทีมด้วย AI", en: "Team plan AI split", group: "ผลิต / งานทีม",
    usedAt: "แผนทีม", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/team-plan/ai-split/route.ts"] },
  // ── การเงิน
  { key: "cf.slip_ocr", th: "อ่านสลิปโอนเงิน (OCR)", en: "Transfer slip OCR", group: "การเงิน",
    usedAt: "จ่ายเงินจีน (อ่านยอด/วันที่จากสลิป)", provider: "cloudflare", kind: "ai_ocr",
    offBehavior: "อัปสลิปได้ตามปกติ แต่ต้องกรอกยอดเอง", costHint: "ฟรีตามโควตา (ทำงานเมื่อตั้งรหัส Cloudflare ไว้)",
    files: ["app/api/china-pay/ocr-slip/route.ts", "app/api/china-pay/ocr-slip-extract/route.ts"] },
  { key: "cf.receipt_ocr", th: "อ่านใบเสร็จผ่อน/สินเชื่อ (OCR)", en: "Loan receipt OCR", group: "การเงิน",
    usedAt: "สินเชื่อ / ผ่อนชำระ", provider: "cloudflare", kind: "ai_ocr",
    offBehavior: "อัปใบเสร็จได้ตามปกติ แต่ต้องกรอกเอง", costHint: "ฟรีตามโควตา (ทำงานเมื่อตั้งรหัส Cloudflare ไว้)", files: ["app/api/loan-payment/read-receipt/route.ts"] },
  // ── อื่น ๆ
  { key: "ai.book_library", th: "หาปก / อ่านอีเมลหนังสือ", en: "Book library helper", group: "อื่น ๆ",
    usedAt: "ห้องสมุดหนังสือ", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST,
    files: ["app/api/book-library/find-cover/route.ts", "app/api/book-library/parse-email/route.ts"] },
  // ── เว็บร้าน / แจ้งเตือน (บริการคิดต่อครั้ง)
  { key: "easyslip.verify", th: "ตรวจสลิปลูกค้าอัตโนมัติ", en: "Customer slip check", group: "เว็บร้าน",
    usedAt: "ชำระเงินเว็บร้าน (เมื่อร้านติ๊ก \"ตรวจสลิปอัตโนมัติ\")", provider: "easyslip", kind: "per_call",
    offBehavior: "ลูกค้ายังส่งสลิปได้ — พนักงานตรวจเองเหมือนตอนไม่ได้ตั้ง EasySlip", costHint: "คิดต่อสลิปตามแพ็กเกจ EasySlip", files: ["lib/website-payments-server.ts"] },
  { key: "shippop.shipping", th: "สร้างเลขพัสดุ (Shippop)", en: "Shipping labels (Shippop)", group: "เว็บร้าน",
    usedAt: "ส่งของออเดอร์เว็บร้าน", provider: "shippop", kind: "locked",
    offBehavior: "ปิดไม่ได้ — ถ้าปิด ลูกค้าเว็บร้านจะสร้างเลขพัสดุไม่ได้", costHint: "ตามค่าส่งจริงของแต่ละพัสดุ", files: ["lib/shippop.ts"] },
  { key: "line.push", th: "ส่งข้อความ LINE (แจ้งเตือน)", en: "LINE push messages", group: "แจ้งเตือน",
    usedAt: "แจ้งเตือนเข้ากลุ่ม/คนทุกระบบ (ผ่านศูนย์ LINE)", provider: "line", kind: "per_call",
    offBehavior: "หยุดส่ง LINE ทุกระบบ (ตอบกลับในแชทยังใช้ได้) · ปิดรายเรื่องได้ที่ศูนย์ LINE", costHint: "ฟรี 300 ข้อความ/เดือน · เกินต้องอัปเกรดแพ็กเกจ LINE OA", files: ["lib/line-send.ts"] },
  { key: "email.send", th: "ส่งอีเมล", en: "Email sending", group: "แจ้งเตือน",
    usedAt: "อีเมลรายงาน · แจ้งลูกค้าเว็บร้าน", provider: "email", kind: "per_call",
    offBehavior: "หยุดส่งอีเมลทุกระบบ", costHint: "Resend ฟรี 3,000 ฉบับ/เดือน · Gmail ฟรี ~500 ฉบับ/วัน", files: ["lib/email.ts"] },
];

export const paidService = (key: string): PaidService | null => PAID_SERVICES.find((s) => s.key === key) ?? null;
/** ปิด/เปลี่ยนได้ไหม (locked = โชว์อย่างเดียว) */
export const canToggle = (s: PaidService) => s.kind !== "locked";
export const canPickModel = (s: PaidService) => s.kind === "ai_chat";

/** โมเดลที่เลือกได้ (ใช้ชุดเดียวกับหน้ารายละเอียดสินค้า) · "" = ค่าเดิมของระบบ */
export const PAID_MODEL_CHOICES = AI_MODEL_CHOICES;
export const isValidModel = (m: string) => !m || PAID_MODEL_CHOICES.some((x) => x.id === m);

/** ค่าใช้จ่ายประมาณ (บาท) จากจำนวน token · โมเดลไม่อยู่ในรายการ = ใช้ราคา gpt-4o-mini */
export function estimateCostThb(model: string | null | undefined, tokensIn: number, tokensOut: number): number {
  const m = PAID_MODEL_CHOICES.find((x) => x.id === model) ?? PAID_MODEL_CHOICES[0];
  return Math.round(((tokensIn * m.inPerM + tokensOut * m.outPerM) / 1e6) * 10000) / 10000;
}

/** ข้อความเมื่อแอดมินปิดไว้ (โชว์ให้ผู้ใช้) */
export const serviceOffMessage = (key: string) => `ผู้ดูแลปิดฟีเจอร์ "${paidService(key)?.th ?? key}" ไว้ (ศูนย์ AI / API ที่เสียเงิน)`;

/** ต้นเดือนนี้ตามเวลาไทย (ISO) — ใช้สรุปยอด "เดือนนี้" */
export function monthStartBangkokIso(now = new Date()): string {
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - 7 * 3600_000).toISOString();
}
