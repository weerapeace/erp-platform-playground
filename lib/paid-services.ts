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
  /** ใช้หลายที่ → เปิด-ปิดรายที่ได้ (เจ้าของขอ 2026-11-06) · ไฟล์ของแต่ละที่ต้องส่ง place: "<key>" (เทสต์ตรวจ) */
  places?: PaidPlace[];
  /** เปลี่ยนผู้ให้บริการได้ (ตัวแรก = ค่าเริ่ม) · ค่าที่เลือกเก็บ paid_service_settings.provider */
  providerChoices?: ProviderChoice[];
};

/** ตัวเลือกผู้ให้บริการ — provider = ใช้หาว่าตั้งรหัสแล้วหรือยัง / แท็บ · id = ค่าที่เก็บ */
export type ProviderChoice = { id: string; th: string; provider: PaidProvider };
const OCR_CHOICES: ProviderChoice[] = [
  { id: "openai", th: "GPT (OpenAI) — อ่านภาษาไทยแม่นกว่า · ~0.02 บาท/รูป", provider: "openai" },
  { id: "cloudflare", th: "Cloudflare AI — ฟรีตามโควตา (ต้องตั้งรหัส Cloudflare)", provider: "cloudflare" },
];
/** ผู้ให้บริการที่ใช้อยู่ — ที่เลือกไว้ (ถ้ายังมีในตัวเลือก) → ตัวแรก · ไม่มีตัวเลือก = null */
export function effectiveChoice(svc: PaidService, picked: string | null | undefined): ProviderChoice | null {
  if (!svc.providerChoices?.length) return null;
  return svc.providerChoices.find((c) => c.id === picked) ?? svc.providerChoices[0];
}

/** "ที่ที่ใช้" ของบริการหนึ่ง — ค่าตั้งเก็บใน paid_service_settings key "<service>@<place>" · บันทึกการใช้ key เดียวกัน */
export type PaidPlace = { key: string; th: string; files: string[] };
/** ที่ที่ไม่ได้ระบุ (โค้ดเก่า / ยังไม่ติดป้าย) */
export const OTHER_PLACE = "other";

export const PROVIDER_LABEL: Record<PaidProvider, string> = {
  openai: "OpenAI (GPT)", cloudflare: "Cloudflare AI", easyslip: "EasySlip", line: "LINE", email: "อีเมล", shippop: "Shippop",
};

const GPT_COST = "คิดตามจำนวนคำ · ดูราคาตามโมเดลที่เลือก";
const GPT_OFF = "ปุ่มนี้ขึ้นข้อความ \"ผู้ดูแลปิดฟีเจอร์นี้ไว้\" · กรอกเองได้ตามปกติ";

export const PAID_SERVICES: PaidService[] = [
  // ── ทั่วทั้งระบบ
  { key: "ai.translate", th: "แปลภาษา ไทย ↔ อังกฤษ (GPT)", en: "Translate TH ↔ EN (GPT)", group: "ทั่วทั้งระบบ",
    usedAt: "ตั๋วงาน · เว็บร้าน · สินค้า · ชื่อฟิลด์/แท็ก · คอนเทนต์ · จัดซื้อ", provider: "openai", kind: "ai_chat",
    offBehavior: "ยังแปลได้ — สลับไปใช้ตัวแปลฟรี (Cloudflare / Google) ซึ่งแปลตรงตัวกว่า", costHint: GPT_COST, files: ["app/api/ai/translate/route.ts"],
    places: [
      { key: "ticket", th: "ตั๋วงาน Pattern", files: ["app/design/pattern-tickets/create-modal.tsx", "app/design/pattern-tickets/ticket-drawer.tsx", "app/design/pattern-tickets/type-settings.tsx"] },
      { key: "website", th: "เว็บร้าน (ตัวจัดหน้าเว็บ · ศูนย์แปล · ข้อมูลเว็บ)", files: ["components/bilingual-field.tsx", "components/translation-table.tsx", "components/website-builder.tsx", "components/website-info-panel.tsx", "components/website-translation-center.tsx"] },
      { key: "product", th: "สินค้า (รายละเอียด · วัสดุ · ส่วนแทรก)", files: ["components/ai-product-detail/index.tsx", "components/detail-insert.tsx", "components/product-materials/material-view.tsx"] },
      { key: "fields", th: "ชื่อฟิลด์ / ตั้งค่าโมดูล / แท็ก", files: ["components/master-crud/index.tsx", "components/master-crud/studio-panel.tsx", "components/relation-multi/index.tsx", "components/tag-organizer/index.tsx"] },
      { key: "content", th: "คอนเทนต์ (โน้ตบรีฟ · กระดานวาด)", files: ["app/tasks/content/content-brief.tsx", "components/canvas-sketch/index.tsx"] },
      { key: "purchasing", th: "จัดซื้อ (ใบสั่งซื้อ)", files: ["app/purchasing/orders/page.tsx"] },
      { key: "color", th: "ทะเบียนสี (ชื่อสีภาษาอังกฤษ)", files: ["components/color-swatch-manager/index.tsx"] },
      { key: OTHER_PLACE, th: "อื่น ๆ (ไม่ได้ระบุที่มา)", files: [] },
    ] },
  { key: "cf.translate", th: "แปลภาษา (ตัวสำรองฟรี)", en: "Translate (free fallback)", group: "ทั่วทั้งระบบ",
    usedAt: "ใช้เมื่อ GPT ปิด/ล่ม", provider: "cloudflare", kind: "ai_ocr",
    offBehavior: "ข้ามไปใช้ Google แปลฟรีแทน", costHint: "ฟรีตามโควตา (ทำงานเมื่อตั้งรหัส Cloudflare ไว้)", files: ["app/api/ai/translate/route.ts"] },
  // ── คอนเทนต์ / การตลาด
  { key: "ai.caption", th: "เขียนแคปชั่น AI", en: "AI captions", group: "คอนเทนต์ / การตลาด",
    usedAt: "คอนเทนต์ (ทีละช่อง / ทั้งใบ) · อัลบั้มคอนเทนต์", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST,
    files: ["app/api/ai/caption/route.ts", "app/api/ai/caption-all/route.ts", "app/api/content-albums/[id]/ai-caption/route.ts"],
    places: [
      { key: "single", th: "คอนเทนต์ — เขียนทีละช่อง", files: ["app/api/ai/caption/route.ts"] },
      { key: "all", th: "คอนเทนต์ — เขียนทั้งใบ (ทุกแพลตฟอร์ม)", files: ["app/api/ai/caption-all/route.ts"] },
      { key: "album", th: "อัลบั้มคอนเทนต์", files: ["app/api/content-albums/[id]/ai-caption/route.ts"] },
    ] },
  { key: "ai.mass_plan", th: "วางแผนคอนเทนต์ทั้งชุด", en: "Mass content plan", group: "คอนเทนต์ / การตลาด",
    usedAt: "แผนคอนเทนต์ (ร่างทีละหลายโพสต์)", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/ai/mass-plan/route.ts"] },
  { key: "ai.brand_profile", th: "ร่างโปรไฟล์แบรนด์", en: "Brand profile draft", group: "คอนเทนต์ / การตลาด",
    usedAt: "การ์ดแบรนด์", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/ai/brand-profile-draft/route.ts"] },
  { key: "ai.product_detail", th: "เขียนรายละเอียดสินค้า", en: "Product description writer", group: "สินค้า / เว็บร้าน",
    usedAt: "หน้าสินค้า (รายละเอียดสำหรับเว็บ/แพลตฟอร์ม)", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/ai/product-detail/route.ts"] },
  { key: "ai.swatch_read", th: "อ่านแผงผ้าจากรูป (หาชิ้นสี + ตั้งรหัส)", en: "Swatch board reader", group: "สินค้า / เว็บร้าน",
    usedAt: "หน้า SKU → แท็บ Swatch (แผงผ้า) → ปุ่ม อ่านจากรูป (1 รูป = 1 ครั้ง)", provider: "openai", kind: "ai_chat",
    offBehavior: "ปุ่ม อ่านจากรูป ขึ้นข้อความ \"ผู้ดูแลปิดฟีเจอร์นี้ไว้\" · ตีกรอบชิ้นเอง / แบ่งกรอบเท่า ๆ กัน ใช้ได้ตามปกติ",
    costHint: "ประมาณ 0.2 บาท/รูป (gpt-4.1-mini) · 0.5–0.7 บาท (gpt-5.4-mini)", files: ["app/api/sku-swatches/ai-read/route.ts"] },
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
  { key: "ai.design_idea", th: "ตั้งชื่อไอเดียจากรูปในไลน์", en: "Name LINE ideas from images", group: "LINE",
    usedAt: "กลุ่มไลน์ส่งไอเดีย → กล่องรอคัด (เฉพาะชุดที่มีแต่รูป)", provider: "openai", kind: "ai_chat",
    offBehavior: "ไอเดียจากไลน์ยังเข้ากล่องรอคัดตามปกติ แต่ชื่อเป็น \"ไอเดียจาก <คนส่ง>\" ให้แก้เอง", costHint: GPT_COST, files: ["lib/design-idea-line.ts"] },
  { key: "ai.order_capture", th: "รับคำสั่งซื้อจากไลน์", en: "Orders from LINE", group: "LINE",
    usedAt: "คำสั่งซื้อจากไลน์ (อ่านรายการ)", provider: "openai", kind: "ai_chat",
    offBehavior: "คำสั่งซื้อยังเข้าระบบ แต่ต้องกรอกรายการเอง", costHint: GPT_COST, files: ["lib/order-capture.ts"] },
  // ── ผลิต / งานทีม
  { key: "ai.work_log", th: "อ่านใบจดผลงาน", en: "Work log reader", group: "ผลิต / งานทีม",
    usedAt: "ใบจดผลงาน (อ่านลายมือจากรูป)", provider: "openai", kind: "ai_chat",
    offBehavior: "อัปรูปได้ตามปกติ แต่ต้องกรอกตัวเลขเอง", costHint: GPT_COST, files: ["lib/work-log-server.ts"] },
  { key: "ai.bag_draft", th: "ร่างแพทเทิร์นจากรูปกระเป๋า", en: "Bag pattern draft from a photo", group: "ผลิต / งานทีม",
    usedAt: "สตูดิโอแพทเทิร์น → แกะจากรูป → รูปกระเป๋าสำเร็จ (AI ประมาณสัดส่วน)", provider: "openai", kind: "ai_chat",
    offBehavior: "ปุ่มนี้ขึ้นข้อความ \"ผู้ดูแลปิดฟีเจอร์นี้ไว้\" · ใส่ขนาดเองในตัวสร้างจากแม่แบบได้ตามปกติ · ลอกเส้นจากรูปแพทเทิร์นกระดาษไม่ใช้ AI ใช้ได้ต่อ", costHint: GPT_COST,
    files: ["app/api/pattern-projects/ai-draft/route.ts"] },
  { key: "ai.pattern_coach", th: "โค้ช AI แพทเทิร์นกระเป๋า", en: "Bag pattern AI coach", group: "ผลิต / งานทีม",
    usedAt: "สตูดิโอแพทเทิร์น → โค้ช → ถามโค้ช AI (ผู้ใช้เห็นข้อความก่อนส่ง · ไม่มีรูป)", provider: "openai", kind: "ai_chat",
    offBehavior: "ปุ่มถาม AI ขึ้นข้อความ \"ผู้ดูแลปิดฟีเจอร์นี้ไว้\" · โค้ชในเครื่อง (ฟรี) ยังใช้ได้ตามปกติ", costHint: GPT_COST,
    files: ["app/api/pattern-projects/ai-coach/route.ts"] },
  { key: "ai.team_split", th: "แบ่งงานทีมด้วย AI", en: "Team plan AI split", group: "ผลิต / งานทีม",
    usedAt: "แผนทีม", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST, files: ["app/api/team-plan/ai-split/route.ts"] },
  // ── การเงิน
  // key ขึ้นต้น cf. คงไว้ (ประวัติการใช้ผูก key นี้) — ผู้ให้บริการเปลี่ยนได้ที่ providerChoices (ค่าเริ่ม GPT · เจ้าของเลือก 2026-11-06 เพราะ Cloudflare ยังไม่ตั้งรหัสบน Vercel)
  { key: "cf.slip_ocr", th: "อ่านสลิปโอนเงิน (AI อ่านรูป)", en: "Transfer slip reader", group: "การเงิน",
    usedAt: "จ่ายเงินจีน (อ่านยอด/บัญชี/วันที่จากสลิป)", provider: "openai", kind: "ai_ocr",
    offBehavior: "อัปสลิปได้ตามปกติ แต่ต้องกรอกยอดเอง", costHint: "GPT ~0.02 บาท/รูป · Cloudflare ฟรีตามโควตา",
    files: ["app/api/china-pay/ocr-slip/route.ts", "app/api/china-pay/ocr-slip-extract/route.ts"], providerChoices: OCR_CHOICES },
  { key: "cf.receipt_ocr", th: "อ่านใบเสร็จผ่อน/สินเชื่อ (AI อ่านรูป)", en: "Loan receipt reader", group: "การเงิน",
    usedAt: "สินเชื่อ / ผ่อนชำระ", provider: "openai", kind: "ai_ocr",
    offBehavior: "อัปใบเสร็จได้ตามปกติ แต่ต้องกรอกเอง", costHint: "GPT ~0.02 บาท/รูป · Cloudflare ฟรีตามโควตา", files: ["app/api/loan-payment/read-receipt/route.ts"], providerChoices: OCR_CHOICES },
  // ── อื่น ๆ
  { key: "ai.book_library", th: "หาปก / อ่านอีเมลหนังสือ", en: "Book library helper", group: "อื่น ๆ",
    usedAt: "ห้องสมุดหนังสือ", provider: "openai", kind: "ai_chat", offBehavior: GPT_OFF, costHint: GPT_COST,
    files: ["app/api/book-library/find-cover/route.ts", "app/api/book-library/parse-email/route.ts"] },
  { key: "ai.subscription_lookup", th: "หาแพ็กเกจ / ราคาแอปจากเว็บ (AI ค้นเว็บ)", en: "App plan lookup (web search)", group: "อื่น ๆ",
    usedAt: "App Subscription — พิมพ์ชื่อแอปแล้วกด \"หาข้อมูลจากเว็บ\"", provider: "openai", kind: "ai_chat",
    offBehavior: "ปุ่มหาจากเว็บขึ้นข้อความ \"ผู้ดูแลปิดฟีเจอร์นี้ไว้\" · เลือกจากคลังแพ็กเกจ / กรอกเองได้ตามปกติ",
    costHint: "~0.5 บาท/ครั้ง (ค่าค้นเว็บ ~0.36 บาท + คำ) · ค้นแอปละครั้ง ครั้งต่อไปใช้คลังฟรี",
    files: ["lib/subscription-catalog-server.ts"] },
  // ── เว็บร้าน / แจ้งเตือน (บริการคิดต่อครั้ง)
  { key: "easyslip.verify", th: "ตรวจสลิปลูกค้าอัตโนมัติ", en: "Customer slip check", group: "เว็บร้าน",
    usedAt: "ชำระเงินเว็บร้าน (เมื่อร้านติ๊ก \"ตรวจสลิปอัตโนมัติ\")", provider: "easyslip", kind: "per_call",
    offBehavior: "ลูกค้ายังส่งสลิปได้ — พนักงานตรวจเองเหมือนตอนไม่ได้ตั้ง EasySlip", costHint: "คิดต่อสลิปตามแพ็กเกจ EasySlip", files: ["lib/website-payments-server.ts"] },
  { key: "shippop.shipping", th: "สร้างเลขพัสดุ (Shippop)", en: "Shipping labels (Shippop)", group: "เว็บร้าน",
    usedAt: "ส่งของออเดอร์เว็บร้าน · ศูนย์ออเดอร์ออนไลน์ › จัดส่ง (ขั้น 1 ล็อกโหมดจำลอง ไม่เสียเงิน)", provider: "shippop", kind: "locked",
    offBehavior: "ปิดไม่ได้ — ถ้าปิด ลูกค้าเว็บร้านจะสร้างเลขพัสดุไม่ได้", costHint: "ตามค่าส่งจริงของแต่ละพัสดุ", files: ["lib/shippop.ts", "app/api/platform-orders/ship/route.ts"] },
  { key: "line.push", th: "ส่งข้อความ LINE (แจ้งเตือน)", en: "LINE push messages", group: "แจ้งเตือน",
    usedAt: "แจ้งเตือนเข้ากลุ่ม/คนทุกระบบ (ผ่านศูนย์ LINE)", provider: "line", kind: "per_call",
    offBehavior: "หยุดส่ง LINE ทุกระบบ (ตอบกลับในแชทยังใช้ได้) · ปิดรายเรื่องได้ที่ศูนย์ LINE", costHint: "ฟรี 300 ข้อความ/เดือน · เกินต้องอัปเกรดแพ็กเกจ LINE OA", files: ["lib/line-send.ts"] },
  { key: "email.send", th: "ส่งอีเมล", en: "Email sending", group: "แจ้งเตือน",
    usedAt: "อีเมลรายงาน · แจ้งลูกค้าเว็บร้าน", provider: "email", kind: "per_call",
    offBehavior: "หยุดส่งอีเมลทุกระบบ", costHint: "Resend ฟรี 3,000 ฉบับ/เดือน · Gmail ฟรี ~500 ฉบับ/วัน", files: ["lib/email.ts"],
    providerChoices: [
      { id: "auto", th: "อัตโนมัติ (Resend ก่อน · ไม่ได้ตั้งใช้ Gmail)", provider: "email" },
      { id: "resend", th: "Resend (โดเมนบริษัท)", provider: "email" },
      { id: "gmail", th: "Gmail", provider: "email" },
    ] },
];

export const paidService = (key: string): PaidService | null => PAID_SERVICES.find((s) => s.key === key) ?? null;
/** ที่ที่ใช้ที่ถูกต้องของบริการนี้ · ไม่มีในทะเบียน = "other" (ถ้าบริการนี้มีหลายที่) · บริการไม่มีหลายที่ = null */
export function resolvePlace(serviceKey: string, place: unknown): string | null {
  const svc = paidService(serviceKey);
  if (!svc?.places?.length) return null;
  const p = typeof place === "string" ? place.trim() : "";
  return svc.places.some((x) => x.key === p) ? p : OTHER_PLACE;
}
/** key ที่ใช้เก็บค่าตั้ง/บันทึกการใช้ของ "ที่" — "ai.translate@ticket" */
export const placeKey = (serviceKey: string, place: string | null | undefined) => (place ? `${serviceKey}@${place}` : serviceKey);
export const splitPlaceKey = (k: string): { key: string; place: string | null } => { const i = k.indexOf("@"); return i < 0 ? { key: k, place: null } : { key: k.slice(0, i), place: k.slice(i + 1) }; };
/** ปิด/เปลี่ยนได้ไหม (locked = โชว์อย่างเดียว) */
export const canToggle = (s: PaidService) => s.kind !== "locked";
export const canPickModel = (s: PaidService) => s.kind === "ai_chat";

/** โมเดลที่เลือกได้ (ใช้ชุดเดียวกับหน้ารายละเอียดสินค้า) · "" = ค่าเดิมของระบบ */
export const PAID_MODEL_CHOICES = AI_MODEL_CHOICES;
export const isValidModel = (m: string) => !m || PAID_MODEL_CHOICES.some((x) => x.id === m);

/** ค่าค้นเว็บต่อครั้ง (บาท) ของ aiWebSearch — OpenAI คิด $10 / 1,000 ครั้ง (ราคา ณ 2026-11 · อัตรา ~36 บาท/ดอลลาร์ เท่าตารางโมเดล) */
export const WEB_SEARCH_CALL_THB = 0.36;

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

/* ── งบต่อเดือน (เฟส 2) ── เก็บใน ui_config key PAID_BUDGET_KEY · นับเฉพาะ GPT (ที่มีค่าใช้จ่ายวัดได้)
 *   monthly_thb = null → ไม่จำกัด (ค่าเริ่ม) · warn_pct = แจ้งเตือนเมื่อใช้ถึง % นี้ · over_action = เกินงบแล้วทำอะไร
 *   stop = หยุด GPT ทุกฟีเจอร์ (แปลภาษาสลับตัวฟรีเอง) · warn = แจ้งเตือนอย่างเดียว ใช้ต่อได้
 */
export const PAID_BUDGET_KEY = "paid_services_budget";
export const PAID_BUDGET_ALERT_KEY = "paid_services_budget_alerts";
export type BudgetOverAction = "stop" | "warn";
/** per_service = งบรายฟีเจอร์ (บาท/เดือน · เฉพาะ GPT) เช่น { "ai.caption": 100 } — ใช้ warn_pct / over_action เดียวกับงบรวม · ไม่มี = ไม่จำกัดรายฟีเจอร์ */
/** per_user_default = งบต่อคน (บาท/เดือน · ทุกคนที่ไม่ได้ตั้งแยก · null = ไม่จำกัด)
 *  per_user = ตั้งรายคน { <user_id>: บาท | null } — null = ไม่จำกัด (เช่น ผู้ดูแล) · ไม่มีในนี้ = ใช้ค่าเริ่มต่อคน
 *  งานที่ไม่มีคนกด (LINE · งานตั้งเวลา) ไม่นับงบของใคร */
export type PaidBudget = {
  monthly_thb: number | null; warn_pct: number; over_action: BudgetOverAction; per_service: Record<string, number>;
  per_user_default: number | null; per_user: Record<string, number | null>;
};
export const DEFAULT_BUDGET: PaidBudget = { monthly_thb: null, warn_pct: 80, over_action: "stop", per_service: {}, per_user_default: null, per_user: {} };

export function cleanBudget(v: unknown): PaidBudget {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const m = Number(r.monthly_thb);
  const w = Math.round(Number(r.warn_pct));
  return {
    monthly_thb: r.monthly_thb === null || r.monthly_thb === "" || !Number.isFinite(m) || m <= 0 ? null : Math.round(m * 100) / 100,
    warn_pct: Number.isFinite(w) && w >= 10 && w <= 100 ? w : DEFAULT_BUDGET.warn_pct,
    over_action: r.over_action === "warn" ? "warn" : "stop",
    per_service: cleanPerService(r.per_service),
    per_user_default: positiveOrNull(r.per_user_default),
    per_user: cleanPerUser(r.per_user),
  };
}

const positiveOrNull = (v: unknown): number | null => { const n = Number(v); return v === null || v === "" || v === undefined || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** งบรายคน — key ต้องเป็น user id · ค่า > 0 = บาท/เดือน · null / 0 / "unlimited" = ไม่จำกัด · ค่าอื่นตัดทิ้ง */
function cleanPerUser(v: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!UUID_RE.test(k)) continue;
    if (raw === null || raw === "unlimited" || Number(raw) === 0) { out[k.toLowerCase()] = null; continue; }
    const n = positiveOrNull(raw);
    if (n !== null) out[k.toLowerCase()] = n;
  }
  return out;
}
/** งบของคนนี้ต่อเดือน — null = ไม่จำกัด (ไม่มีคนกด / ตั้งไม่จำกัด / ไม่ได้ตั้งค่าเริ่ม) */
export function userCap(b: PaidBudget, userId: string | null | undefined): number | null {
  if (!userId) return null;
  const k = userId.toLowerCase();
  return k in b.per_user ? b.per_user[k] : b.per_user_default;
}
export const userBudgetState = (spentThb: number, b: PaidBudget, userId: string | null | undefined): BudgetState => {
  const cap = userCap(b, userId);
  return cap ? budgetState(spentThb, { ...b, monthly_thb: cap }) : "none";
};
export const userBudgetOverMessage = (cap: number) =>
  `คุณใช้ AI ครบงบของคุณเดือนนี้ (฿${cap.toLocaleString("th-TH")}) แล้ว — ใช้ได้อีกครั้งวันที่ 1 หรือขอผู้ดูแลเพิ่มงบที่ศูนย์ AI / API ที่เสียเงิน`;

/** งบรายฟีเจอร์ — รับเฉพาะ key GPT ในทะเบียน · ค่า > 0 (ปัด 2 ตำแหน่ง) · อื่น ๆ ตัดทิ้ง */
function cleanPerService(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(raw);
    if (paidService(k)?.kind === "ai_chat" && Number.isFinite(n) && n > 0) out[k] = Math.round(n * 100) / 100;
  }
  return out;
}

/** สถานะงบของฟีเจอร์เดียว (ไม่ได้ตั้ง = none) */
export const serviceBudgetState = (spentThb: number, b: PaidBudget, key: string): BudgetState =>
  b.per_service[key] ? budgetState(spentThb, { ...b, monthly_thb: b.per_service[key] }) : "none";
export const serviceBudgetOverMessage = (key: string, b: PaidBudget) =>
  `"${paidService(key)?.th ?? key}" ใช้ครบงบเดือนนี้ ฿${(b.per_service[key] ?? 0).toLocaleString("th-TH")} แล้ว — ผู้ดูแลเพิ่มงบได้ที่ศูนย์ AI / API ที่เสียเงิน`;

/* ── ยอดใช้ย้อนหลัง (กราฟ) ── จัดกลุ่มตามวัน/เดือน เวลาไทย · คืนครบทุกช่วง (ช่วงที่ไม่มีการใช้ = 0) */
export type UsageBucket = { key: string; label: string; cost_thb: number; calls: number; failed: number };
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const bkk = (d: Date) => new Date(d.getTime() + 7 * 3600_000);
export function usageBucketKey(atIso: string, mode: "day" | "month"): string {
  const iso = bkk(new Date(atIso)).toISOString();
  return mode === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}
export function usageBuckets(rows: { at: string; est_cost_thb: number | null; ok?: boolean }[], mode: "day" | "month", count: number, now = new Date()): UsageBucket[] {
  const b = bkk(now);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = mode === "day" ? new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - i)) : new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() - i, 1));
    keys.push(mode === "day" ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7));
  }
  const map = new Map(keys.map((k) => [k, { key: k, label: "", cost_thb: 0, calls: 0, failed: 0 } as UsageBucket]));
  for (const r of rows) {
    const x = map.get(usageBucketKey(r.at, mode));
    if (!x) continue;
    x.calls += 1; if (r.ok === false) x.failed += 1; x.cost_thb += Number(r.est_cost_thb ?? 0);
  }
  return keys.map((k) => {
    const x = map.get(k)!;
    const [y, m, d] = k.split("-").map(Number);
    x.label = mode === "day" ? `${d} ${TH_MONTHS[m - 1]}` : `${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`;
    x.cost_thb = Math.round(x.cost_thb * 10000) / 10000;
    return x;
  });
}
/** วันแรกของช่วงที่ต้องดึง (ISO) — day = count วันย้อนหลัง · month = count เดือนย้อนหลัง (เวลาไทย) */
export function usageRangeStartIso(mode: "day" | "month", count: number, now = new Date()): string {
  const b = bkk(now);
  const start = mode === "day" ? Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - (count - 1)) : Date.UTC(b.getUTCFullYear(), b.getUTCMonth() - (count - 1), 1);
  return new Date(start - 7 * 3600_000).toISOString();
}

export type BudgetState = "none" | "ok" | "warn" | "over";
/** สถานะงบตามยอดใช้เดือนนี้ — none = ไม่ได้ตั้งงบ */
export function budgetState(spentThb: number, b: PaidBudget): BudgetState {
  if (!b.monthly_thb) return "none";
  if (spentThb >= b.monthly_thb) return "over";
  if (spentThb >= (b.monthly_thb * b.warn_pct) / 100) return "warn";
  return "ok";
}
/** เดือนนี้ตามเวลาไทย "YYYY-MM" — ใช้กันแจ้งเตือนซ้ำในเดือนเดียวกัน */
export function monthKeyBangkok(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
}
export const budgetOverMessage = (b: PaidBudget) => `เดือนนี้ใช้ AI ครบงบ ฿${(b.monthly_thb ?? 0).toLocaleString("th-TH")} แล้ว — ผู้ดูแลเพิ่มงบหรือเปลี่ยนเป็น "แจ้งเตือนอย่างเดียว" ได้ที่ศูนย์ AI / API ที่เสียเงิน`;
/** ป้ายของการใช้ที่ไม่มีคนกด (ข้อความจาก LINE · งานตั้งเวลา) */
export const AUTO_USER_LABEL = "ระบบ / อัตโนมัติ (LINE · งานตั้งเวลา)";
