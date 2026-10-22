/**
 * ของกลาง — "ข้อมูลร้าน" ของเว็บร้านออนไลน์ (คำโปรย · ช่องทางติดต่อ · กติกาการสั่งซื้อ)
 *
 * เก็บที่ตาราง `store_settings` (shop_id, key, value) — ร้านละชุด ไม่ต้องเพิ่มคอลัมน์ใหม่
 * ใช้ร่วมกัน 3 ที่:
 *   - /api/website/settings          (แท็บ "🏪 ข้อมูลร้าน" ใน ERP อ่าน/บันทึก)
 *   - /api/public/storefront/site    (ส่งให้เว็บร้านไปวาด footer / หน้าติดต่อ / เงื่อนไขส่ง)
 *   - /api/public/storefront/orders  (ใช้คิดค่าส่ง + ตรวจช่องทางชำระเงินตอนลูกค้ากดสั่ง)
 *
 * กฎ: ฟิลด์ที่ `isPublic: false` (เช่น prefix เลขออเดอร์) ห้ามหลุดไป API สาธารณะ — ดู publicSiteInfo()
 */

import { normalizeCouponCode } from "@/lib/website-coupons";
import { sanitizeI18nMeta, type I18nMeta } from "@/lib/content-i18n";

export type SiteInfoType = "text" | "textarea" | "number" | "bool";

export interface SiteInfoField {
  key: string;
  label: string;
  hint?: string;
  group: "shop" | "contact" | "order" | "gift" | "promo" | "points" | "fit" | "belt" | "tracking" | "chat" | "reviews" | "search" | "preorder" | "referral" | "returns" | "shippop" | "notify" | "redirects";
  type: SiteInfoType;
  /** ส่งให้เว็บร้าน (API สาธารณะ) ได้ไหม */
  isPublic: boolean;
  placeholder?: string;
  /** 🌐 ข้อความที่ลูกค้าเห็น → มีภาษาอังกฤษคู่ `<key>_en` (หน้าเว็บ /en) */
  i18n?: boolean;
}

export const SITE_INFO_GROUPS: { key: SiteInfoField["group"]; label: string; hint: string }[] = [
  { key: "shop", label: "🏪 ร้าน", hint: "ข้อความแนะนำร้านที่โชว์ท้ายเว็บและใน Google" },
  { key: "contact", label: "📞 ช่องทางติดต่อ", hint: "ขึ้นที่ท้ายเว็บและหน้า /contact — เว้นว่างช่องไหน เว็บจะไม่โชว์ช่องนั้น" },
  { key: "order", label: "🧾 การสั่งซื้อ", hint: "ค่าส่ง ช่องทางชำระเงิน และเลขที่ออเดอร์ — มีผลทันทีตอนลูกค้ากดสั่ง" },
  { key: "gift", label: "🎀 ห่อของขวัญ", hint: "ลูกค้าติ๊ก \"ห่อเป็นของขวัญ\" ตอนสั่งซื้อ (เขียนการ์ด/ไม่ใส่ราคาในกล่องได้) · ค่าห่อบวกในยอดรวม (ไม่โดนส่วนลด/แต้ม) · ออเดอร์ในแท็บ 🧾 จะมีป้าย 🎀 ต้องห่อ + ข้อความการ์ด" },
  { key: "points", label: "⭐ แต้มสมาชิก", hint: "สมาชิกได้แต้มเมื่อออเดอร์เป็น 'สำเร็จ' (ไม่นับค่าส่ง) และใช้แต้มลดราคาตอนสั่งได้ · ระดับสมาชิก (Silver/Gold ได้แต้มคูณ) ตั้งที่แท็บ 👥 สมาชิก" },
  { key: "fit", label: "📐 เช็คขนาด (ใส่ตุ๊กตา/ของ)", hint: "คำนวณจาก \"ช่องใส่ของ\" (ขนาดด้านใน) ของแต่ละรุ่น กับขนาดตุ๊กตาในทะเบียน \"ใส่อะไรได้บ้าง\" · เปิดแล้วรุ่นที่ยังไม่วัดช่องจะขึ้นในแท็บ ⚠️ ต้องแก้ + ตัวกรอง 📐 ยังไม่วัดช่อง ในแท็บสินค้าบนเว็บ · ตัวกรองหน้ารวมสินค้าเว็บ = เปิดกลุ่ม \"ใส่อะไรได้\" ในแท็บหน้ารายการสินค้า" },
  { key: "belt", label: "🧵 ออกแบบเข็มขัด (Belt Builder)", hint: "ลูกค้าประกอบเข็มขัดเองบนเว็บ (สายหนัง/หัว/หู/สลักชื่อ/ไซซ์) · ชิ้นส่วนและกติกาไซซ์ตั้งที่เมนู 🌐 เว็บไซต์ → ออกแบบเข็มขัด · เปิดแล้ววาง Section \"ออกแบบเข็มขัด\" ในหน้าใดก็ได้ หรือใช้หน้า /belt-builder ของเว็บ" },
  { key: "promo", label: "🎁 ป๊อปอัปลูกค้าใหม่", hint: "โผล่ครั้งเดียวต่อผู้เข้าชม (ไม่โผล่หน้าชำระเงิน) · แจกโค้ดจากแท็บ 🎟️ คูปอง — สร้างคูปองก่อนแล้วใส่โค้ดที่นี่" },
  {
    key: "tracking",
    label: "📊 วัดผล & โฆษณา",
    hint: "ใส่รหัสแล้ววัดผลได้ทันที: ผู้เข้าชม · ดูสินค้า · ใส่ตะกร้า · เริ่มชำระ · ซื้อสำเร็จ · ค้นหา · ถูกใจ · เว็บขอความยินยอมคุกกี้ (PDPA) ก่อนเริ่มเก็บเสมอ — ไม่กรอกเลย = ไม่มีแบนเนอร์คุกกี้ · ไม่เก็บอะไร",
  },
  { key: "chat", label: "💬 ปุ่มแชทลอย", hint: "ปุ่มกลมมุมจอทุกหน้า (ยกเว้นหน้าชำระเงิน) กดแล้วเลือกทัก LINE / Messenger / โทร · ใช้ลิงก์จากกลุ่ม 📞 ช่องทางติดต่อ — ช่องไหนว่าง ปุ่มนั้นไม่โชว์" },
  { key: "reviews", label: "⭐ รีวิวสินค้า", hint: "ลูกค้าให้ดาว + เขียน + แนบรูป ที่หน้าสินค้า · ทุกรีวิวต้องผ่านการตรวจในแท็บ ⭐ รีวิว ก่อนขึ้นเว็บ (เว้นแต่เปิดอนุมัติอัตโนมัติ) · ดาวเฉลี่ยขึ้นในผลค้นหา Google ด้วย" },
  { key: "preorder", label: "📦 สั่งจอง (พรีออเดอร์) + มัดจำ", hint: "สินค้าที่ตั้งสถานะสต็อก “พรีออเดอร์” ในแท็บสินค้าบนเว็บ · เปิดมัดจำแล้ว ออเดอร์ที่มีของพรีออเดอร์ต้องโอนพร้อมเพย์ (ไม่มีเก็บปลายทาง) จ่ายมัดจำก่อน ที่เหลือจ่ายก่อนจัดส่ง · ระบบตรวจสลิปตามยอดที่ต้องจ่ายแต่ละรอบ" },
  { key: "referral", label: "🎁 ชวนเพื่อน (โค้ดแนะนำ)", hint: "สมาชิกทุกคนได้โค้ดชวนเพื่อนของตัวเอง (หน้าบัญชี) · เพื่อนใช้โค้ดตอนสั่งครั้งแรก = ได้ส่วนลด · ออเดอร์ของเพื่อนสำเร็จ = คนชวนได้แต้ม (ต้องเปิดระบบแต้ม) · 1 เบอร์ใช้โค้ดชวนเพื่อนได้ครั้งเดียว ใช้โค้ดตัวเองไม่ได้" },
  { key: "returns", label: "↩️ ขอคืน/เปลี่ยนสินค้า", hint: "ลูกค้ากด “ขอคืน/เปลี่ยนสินค้า” จากหน้าตามออเดอร์ (ออเดอร์ที่ส่งแล้ว/สำเร็จ ภายในกี่วันหลังได้รับของ) เลือกชิ้น + เหตุผล + แนบรูป → ร้านตอบในแท็บ ↩️ คืน/เปลี่ยน · ระบบไม่คืนเงิน/ไม่ตัดสต็อกให้เอง" },
  { key: "notify", label: "🔔 แจ้งลูกค้าอัตโนมัติ (LINE · ตะกร้าค้าง · ของที่ถูกใจลดราคา)", hint: "LINE = สมาชิกที่เข้าสู่ระบบด้วย LINE และแอดเพื่อน OA ร้านแล้ว (ต้องใส่กุญแจ OA ใน Vercel: LINE_OA_TOKEN_<รหัสร้าน>) · อีเมล = ต้องตั้ง RESEND_API_KEY + EMAIL_FROM · ตะกร้าค้าง/ของลดราคา ส่งเฉพาะสมาชิกที่ยินยอมรับข่าวสาร (PDPA) · กลุ่ม LINE พนักงานตั้งที่ ERP › ศูนย์ LINE › 🛍 เว็บร้าน" },
  { key: "shippop", label: "🚚 Shippop (จองขนส่ง · ใบปะหน้า · เลขพัสดุอัตโนมัติ)", hint: "จองขนส่งจากรายละเอียดออเดอร์ (ดูราคาหลายเจ้า → จอง → ได้เลขพัสดุ + ใบปะหน้า) · ขนส่งรับพัสดุแล้ว/ส่งถึง = เปลี่ยนสถานะออเดอร์ให้เอง · ยังไม่ใส่ API KEY ใน Vercel = โหมดจำลอง (ไม่เรียก Shippop จริง ไม่เสียเงิน)" },
  { key: "redirects", label: "🔀 ย้ายลิงก์เก่า (Redirect)", hint: "ลิงก์เก่าที่ลูกค้า/Google ยังเข้ามา (เช่น จากเว็บเดิม หรือสินค้าที่เปลี่ยนชื่อ) → พาไปหน้าใหม่อัตโนมัติ ไม่เจอหน้า 404 · Google ย้ายคะแนนตามไปด้วย (301)" },
  { key: "search", label: "🔍 ค้นหาสินค้า", hint: "ช่องค้นหาบนเว็บพิมพ์ผิดนิดหน่อยก็เจอ · ใส่คำที่หมายถึงสิ่งเดียวกันให้ค้นเจอทั้งคู่ · ด้านล่างมีรายการคำที่ลูกค้าค้นแล้วไม่เจอ (ไว้เติมคำ/เพิ่มสินค้า)" },
];

export const SITE_INFO_FIELDS: SiteInfoField[] = [
  // ─── ร้าน ───
  { key: "site_tagline", label: "คำโปรยร้าน", hint: "สั้น ๆ 1 บรรทัด เช่น กระเป๋าหนังแท้ งานไทย ตั้งแต่ปี 1996", group: "shop", type: "text", isPublic: true, i18n: true },
  { key: "site_description", label: "คำอธิบายร้าน (SEO)", hint: "2-3 ประโยค โชว์ใต้ชื่อเว็บใน Google และท้ายเว็บ", group: "shop", type: "textarea", isPublic: true, i18n: true },
  { key: "footer_note", label: "ข้อความท้ายเว็บ", hint: "เช่น เลขทะเบียนพาณิชย์ หรือ 'จัดส่งทั่วไทย'", group: "shop", type: "text", isPublic: true, i18n: true },
  // ─── ปิดเว็บชั่วคราว (ปุ่มลัดอยู่หัวหน้า /website/<slug> · components/website-open-toggle.tsx) ───
  { key: "site_closed", label: "ปิดเว็บชั่วคราว (ลูกค้าเห็นหน้า 'เร็ว ๆ นี้')", hint: "ทุกโดเมนของร้านนี้ · พรีวิวใน ERP ยังเห็นเว็บเต็ม · ระหว่างปิด เว็บไม่รับคำสั่งซื้อ", group: "shop", type: "bool", isPublic: true },
  { key: "closed_title", label: "หัวข้อหน้ารอเปิด", hint: "เว้นว่าง = 'เร็ว ๆ นี้'", group: "shop", type: "text", isPublic: true, placeholder: "เร็ว ๆ นี้", i18n: true },
  { key: "closed_message", label: "ข้อความหน้ารอเปิด", hint: "เว้นว่าง = '<ชื่อร้าน> กำลังเตรียมเว็บใหม่ให้พร้อม…' · ช่องทางติดต่อที่กรอกไว้จะโชว์ใต้ข้อความ", group: "shop", type: "textarea", isPublic: true, i18n: true },
  // ─── ฟีเจอร์ทดลอง: เปิดให้ร้านนี้เห็น Section ทดลองในคลังของตัวจัดหน้า (SectionMeta.beta ใน lib/website-schema.ts) ───
  // ─── 🌐 2 ภาษา (เว็บร้าน: /en + ปุ่ม TH/EN · กติกา docs/bilingual-content.md) ───
  { key: "lang_en_enabled", label: "🌐 เปิดภาษาอังกฤษบนเว็บ (/en + ปุ่มสลับ TH/EN)", hint: "ลูกค้ากดสลับภาษาที่หัวเว็บได้ · ข้อความที่ยังไม่แปลจะโชว์ภาษาไทยแทน · กรอก/แปลอังกฤษที่ตัวจัดหน้าเว็บ (ปุ่ม 🌐) และชื่อสินค้าอังกฤษในฟอร์มสินค้า · ปิดอยู่ = หน้า /en เด้งกลับไทย แต่พรีวิวใน ERP ยังดูได้", group: "shop", type: "bool", isPublic: true },
  { key: "beta_canvas", label: "🧪 ทดลองใช้ \"ผืนผ้าใบอิสระ\"", hint: "เพิ่ม Section ที่วางรูป/ข้อความ/ปุ่ม/ของตกแต่งได้อิสระ ในคลังของตัวจัดหน้า · ปิดทีหลัง ของที่วางไว้แล้วยังขึ้นเว็บตามเดิม", group: "shop", type: "bool", isPublic: false },

  // ─── ติดต่อ ───
  { key: "contact_phone", label: "เบอร์โทร", group: "contact", type: "text", isPublic: true, placeholder: "08X-XXX-XXXX" },
  { key: "contact_line", label: "LINE ID", group: "contact", type: "text", isPublic: true, placeholder: "@louismontini" },
  { key: "contact_line_url", label: "ลิงก์ LINE", hint: "เช่น https://lin.ee/xxxx (ถ้ามี ปุ่ม LINE จะกดเปิดแชทได้เลย)", group: "contact", type: "text", isPublic: true },
  { key: "contact_email", label: "อีเมล", group: "contact", type: "text", isPublic: true },
  { key: "contact_address", label: "ที่อยู่ร้าน", group: "contact", type: "textarea", isPublic: true, i18n: true },
  { key: "contact_hours", label: "เวลาทำการ", group: "contact", type: "text", isPublic: true, placeholder: "จันทร์–เสาร์ 9:00–18:00", i18n: true },
  { key: "social_facebook", label: "Facebook (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_instagram", label: "Instagram (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_tiktok", label: "TikTok (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_x", label: "X / Twitter (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_pinterest", label: "Pinterest (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_youtube", label: "YouTube (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_shopee", label: "Shopee (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_lazada", label: "Lazada (ลิงก์)", group: "contact", type: "text", isPublic: true },

  // ─── การสั่งซื้อ ───
  { key: "shipping_flat", label: "ค่าส่งเหมา (บาท)", hint: "0 = ส่งฟรีทุกออเดอร์ · ⚠️ ตั้งหลายวิธีส่งที่แท็บ 🚚 การจัดส่ง แล้วช่องนี้ไม่ใช้ (ใช้เฉพาะร้านที่ยังไม่ตั้งวิธีส่ง)", group: "order", type: "number", isPublic: true },
  { key: "free_shipping_min", label: "ส่งฟรีเมื่อยอดถึง (บาท)", hint: "0 = ไม่มีเงื่อนไขส่งฟรี · ⚠️ ตั้งวิธีส่งที่แท็บ 🚚 การจัดส่ง แล้วใช้ค่าส่งฟรีของแต่ละวิธีแทน", group: "order", type: "number", isPublic: true },
  { key: "pay_cod", label: "รับเก็บเงินปลายทาง (COD)", group: "order", type: "bool", isPublic: true },
  { key: "pay_promptpay", label: "รับโอนพร้อมเพย์", group: "order", type: "bool", isPublic: true },
  { key: "tax_invoice_enabled", label: "🧾 ให้ลูกค้าขอใบกำกับภาษีเต็มรูปตอนสั่ง", hint: "หน้าชำระเงินมีช่องติ๊กขอใบกำกับ (ชื่อ · เลขผู้เสียภาษี 13 หลัก · สาขา · ที่อยู่) → ออกใบจากรายละเอียดออเดอร์ใน ERP (หัวกระดาษบริษัทตามรหัสด้านล่าง — ต้องตั้งก่อน)", group: "order", type: "bool", isPublic: true },
  { key: "tax_invoice_company", label: "🧾 บริษัทที่ออกใบกำกับ (รหัสบริษัท)", hint: "รหัสบริษัทจากหน้า ERP › ตั้งค่า › บริษัท (เช่น LOUIS, ISG) — ต้องตั้งก่อนออกใบกำกับ · ใช้เป็นหัวกระดาษ + ชุดเลขที่ใบกำกับ", group: "order", type: "text", isPublic: false, placeholder: "เช่น LOUIS" },
  { key: "promptpay_number", label: "เลขพร้อมเพย์", hint: "เบอร์โทรหรือเลขบัตรประชาชน/นิติบุคคล — ลูกค้าเห็นตอนสั่งซื้อ", group: "order", type: "text", isPublic: true },
  { key: "promptpay_name", label: "ชื่อบัญชีพร้อมเพย์", group: "order", type: "text", isPublic: true },
  // 💳 สลิปโอน (ของกลาง lib/website-payments*.ts · เว็บร้าน SlipUpload) — เจ้าของเลือก A+B 2026-10-20
  { key: "slip_upload_enabled", label: "📎 ให้ลูกค้าแนบสลิปบนเว็บ (หลังโอนพร้อมเพย์)", hint: "ลูกค้าแนบสลิปได้ทั้งหน้าขอบคุณหลังสั่ง และหน้าติดตามคำสั่งซื้อ · สลิปเข้าแท็บ 🧾 ออเดอร์ (ตัวกรอง 💳 รอตรวจเงิน) · ปิด = ลูกค้าส่งสลิปทางแชทเหมือนเดิม", group: "order", type: "bool", isPublic: true },
  { key: "slip_auto_verify", label: "🤖 ตรวจสลิปอัตโนมัติ (EasySlip)", hint: "ระบบเช็กยอดเงิน + บัญชีผู้รับ + สลิปซ้ำ ผ่านครบ = ออเดอร์เป็น 'ชำระแล้ว' ทันที · ไม่ผ่าน = เข้าคิวให้พนักงานตรวจ (ระบบไม่ปฏิเสธสลิปเอง) · ต้องสมัคร easyslip.com + ลงทะเบียนบัญชีรับเงินของร้านในเว็บ EasySlip + ใส่รหัส EASYSLIP_API_KEY ใน Vercel ก่อน", group: "order", type: "bool", isPublic: false },
  { key: "order_note", label: "ข้อความแจ้งลูกค้าตอนสั่งซื้อ", hint: "เช่น จัดส่งภายใน 1-2 วันทำการหลังยืนยันยอด", group: "order", type: "text", isPublic: true, i18n: true },
  { key: "order_email_enabled", label: "✉️ ส่งอีเมลแจ้งลูกค้าอัตโนมัติ", hint: "ส่งตอนสั่งซื้อ · ได้รับชำระเงิน · จัดส่งแล้ว · ยกเลิก · คืนเงิน — เป็นภาษาที่ลูกค้าใช้ตอนสั่ง (ไทย/อังกฤษ) · เฉพาะลูกค้าที่กรอกอีเมล · ต้องตั้งระบบส่งอีเมล (Resend) ก่อน · ปิดไว้ก็ยังกดส่ง/คัดลอกข้อความเองได้ในแท็บออเดอร์", group: "order", type: "bool", isPublic: false },
  { key: "order_prefix", label: "ตัวย่อเลขที่ออเดอร์", hint: "A-Z 0-9 ไม่เกิน 6 ตัว · เว้นว่าง = ใช้ตัวอักษรจากชื่อร้าน · เลขจะเป็น XX-256910-00001", group: "order", type: "text", isPublic: false },

  // ─── 🎀 ห่อของขวัญ (เว็บร้าน CheckoutClient · คิดค่าห่อใหม่ฝั่งเซิร์ฟเวอร์ calcGiftFee ใน createStorefrontOrder) ───
  { key: "gift_enabled", label: "เปิดบริการห่อของขวัญ", hint: "ปิดทีหลัง ออเดอร์ที่สั่งห่อไว้แล้วยังอยู่ครบ", group: "gift", type: "bool", isPublic: true },
  { key: "gift_fee", label: "ค่าห่อ (บาท ต่อออเดอร์)", hint: "0 = ห่อฟรี", group: "gift", type: "number", isPublic: true, placeholder: "50" },
  { key: "gift_title", label: "ชื่อบริการที่ลูกค้าเห็น", hint: "เว้นว่าง = ห่อเป็นของขวัญ", group: "gift", type: "text", isPublic: true, placeholder: "ห่อเป็นของขวัญ", i18n: true },
  { key: "gift_desc", label: "รายละเอียดสั้น ๆ", hint: "บอกว่าได้อะไร เช่น กล่องของขวัญ ผูกโบว์ + การ์ดเขียนข้อความ", group: "gift", type: "text", isPublic: true, placeholder: "กล่องของขวัญ ผูกโบว์ + การ์ดเขียนข้อความ", i18n: true },
  { key: "gift_allow_message", label: "ให้ลูกค้าเขียนข้อความบนการ์ด", hint: "ไม่เกิน 300 ตัวอักษร · โชว์ในออเดอร์ให้คนแพ็กเขียน/พิมพ์ใส่การ์ด", group: "gift", type: "bool", isPublic: true },
  { key: "gift_allow_hide_price", label: "ให้เลือก \"ไม่ใส่ราคา/ใบเสร็จในกล่อง\"", hint: "สำหรับส่งตรงถึงผู้รับเป็นของขวัญ", group: "gift", type: "bool", isPublic: true },
  // 💌 การ์ดอวยพรแยกจากห่อ — ลูกค้าเลือกเขียนการ์ดได้โดยไม่ห่อ (คิดค่าการ์ดใหม่ฝั่งเซิร์ฟเวอร์ calcCardFee · เก็บ store_orders.gift_card_fee)
  { key: "card_enabled", label: "💌 ขายการ์ดอวยพรแยก (ไม่ห่อก็เขียนการ์ดได้)", hint: "เปิดแล้ว ลูกค้าเห็นตัวเลือก \"เขียนการ์ด\" แยกจากห่อของขวัญ (ในตะกร้า + หน้าชำระเงิน) · ใช้ลาย/ขนาดการ์ดเดียวกับ ⚙ ตั้งค่าการ์ด", group: "gift", type: "bool", isPublic: true },
  { key: "card_fee", label: "ค่าการ์ด (บาท ต่อออเดอร์)", hint: "0 = การ์ดฟรี", group: "gift", type: "number", isPublic: true, placeholder: "20" },
  { key: "card_title", label: "ชื่อบริการการ์ดที่ลูกค้าเห็น", hint: "เว้นว่าง = เขียนการ์ดอวยพร", group: "gift", type: "text", isPublic: true, placeholder: "เขียนการ์ดอวยพร", i18n: true },

  // ─── 🎁 ป๊อปอัปลูกค้าใหม่ (เว็บร้าน src/components/layout/PromoPopup.tsx) ───
  { key: "promo_enabled", label: "เปิดป๊อปอัปแจกโค้ดลูกค้าใหม่", group: "promo", type: "bool", isPublic: true },
  { key: "promo_code", label: "โค้ดที่แจก", hint: "ต้องเป็นคูปองที่สร้างไว้ในแท็บ 🎟️ คูปอง ของร้านนี้ (ระบบตรวจให้ตอนบันทึก)", group: "promo", type: "text", isPublic: true, placeholder: "WELCOME10" },
  { key: "promo_title", label: "หัวข้อป๊อปอัป", hint: "เว้นว่าง = 'ส่วนลดสำหรับลูกค้าใหม่'", group: "promo", type: "text", isPublic: true, placeholder: "ส่วนลดสำหรับลูกค้าใหม่", i18n: true },
  { key: "promo_text", label: "ข้อความในป๊อปอัป", hint: "เว้นว่าง = บอกส่วนลดของโค้ดให้เอง (เช่น ลด 10% เมื่อซื้อครบ ฿590)", group: "promo", type: "textarea", isPublic: true, i18n: true },
  { key: "promo_collect_email", label: "ให้กรอกอีเมลก่อนเห็นโค้ด", hint: "อีเมลเข้ารายชื่อรับข่าวสารของร้าน (ระบบเดียวกับ Section สมัครรับข่าวสาร) · ปิด = เห็นโค้ดทันที", group: "promo", type: "bool", isPublic: true },
  { key: "promo_delay", label: "โผล่หลังเข้าเว็บกี่วินาที", hint: "0–60 · แนะนำ 5–10 (ให้ลูกค้าได้ดูของก่อน)", group: "promo", type: "number", isPublic: true },

  // ─── ⭐ แต้มสมาชิก (กฎ: lib/member-points.ts · ต้องเปิดระบบสมาชิกที่เว็บร้านด้วย) ───
  { key: "points_enabled", label: "เปิดระบบแต้มสะสม", hint: "ปิดทีหลัง แต้มที่สมาชิกมีอยู่ไม่หาย (แค่ได้/ใช้เพิ่มไม่ได้) · ออเดอร์ที่ใช้แต้มไปแล้วถ้ายกเลิกยังคืนแต้มให้", group: "points", type: "bool", isPublic: true },
  { key: "points_earn_unit", label: "ซื้อครบกี่บาท ได้ 1 แต้ม", hint: "คิดจากยอดสินค้าหลังส่วนลด ไม่นับค่าส่ง · เช่น 100 = ซื้อ ฿1,990 ได้ 19 แต้ม", group: "points", type: "number", isPublic: true, placeholder: "100" },
  { key: "points_value", label: "1 แต้ม ลดได้กี่บาท", hint: "เช่น 1 = ใช้ 100 แต้ม ลด ฿100", group: "points", type: "number", isPublic: true, placeholder: "1" },
  { key: "points_max_redeem_pct", label: "ใช้แต้มลดได้ไม่เกินกี่ % ของยอดสินค้า", hint: "1–100 · แนะนำ 50", group: "points", type: "number", isPublic: true, placeholder: "50" },
  // ─── 🧵 ออกแบบเข็มขัด (ชิ้นส่วน/ไซซ์: /admin/belt-builder · กฎ lib/belt-builder.ts · payload lib/belt-builder-public.ts) ───
  { key: "belt_enabled", label: "เปิดออกแบบเข็มขัดบนเว็บ", hint: "ต้องมีสายหนัง + หัวเข็มขัด ที่เปิดอยู่อย่างน้อยอย่างละ 1 ชิ้น ไม่งั้นเว็บยังไม่โชว์", group: "belt", type: "bool", isPublic: true },
  { key: "belt_base_price", label: "ราคาฐานเข็มขัด (฿)", hint: "ราคาเริ่มต้นก่อนบวกราคาเพิ่มของแต่ละชิ้น · 0 = ยังไม่ตั้ง (เว็บโชว์ \"สอบถามราคา\")", group: "belt", type: "number", isPublic: true, placeholder: "1500" },
  { key: "belt_engraving_fee", label: "ค่าสลักชื่อ (฿)", hint: "บวกเมื่อลูกค้าพิมพ์ชื่อ · 0 = ฟรี", group: "belt", type: "number", isPublic: true, placeholder: "0" },
  { key: "belt_engraving_max", label: "สลักชื่อได้สูงสุดกี่ตัวอักษร", hint: "แนะนำ 12 · 0 = ปิดสลักชื่อ", group: "belt", type: "number", isPublic: true, placeholder: "12" },
  { key: "belt_lead_time", label: "ระยะเวลาทำ (ข้อความ)", hint: "โชว์ใต้ราคา เช่น ทำ 7–10 วันทำการ", group: "belt", type: "text", isPublic: true, placeholder: "ทำ 7–10 วันทำการ", i18n: true },
  { key: "fit_check_enabled", label: "เปิดเช็คขนาด (ใส่ตุ๊กตา/ของได้ไหม)", hint: "รอบนี้: ERP คำนวณ + เตือนรุ่นที่ยังไม่วัด · หน้าเช็คขนาดบนเว็บจะตามมาในรอบถัดไป", group: "fit", type: "bool", isPublic: true },
  { key: "points_min_redeem", label: "ใช้ขั้นต่ำครั้งละกี่แต้ม", hint: "กันใช้ทีละนิด เช่น 10", group: "points", type: "number", isPublic: true, placeholder: "10" },

  // ─── 📊 วัดผล & โฆษณา (เว็บร้าน src/lib/analytics.ts — โหลดหลังลูกค้ายินยอมคุกกี้เท่านั้น) ───
  { key: "ga4_id", label: "Google Analytics 4 — Measurement ID", hint: "จาก GA4 › ผู้ดูแลระบบ › สตรีมข้อมูล · ขึ้นต้นด้วย G-", group: "tracking", type: "text", isPublic: true, placeholder: "G-XXXXXXXXXX" },
  { key: "meta_pixel_id", label: "Meta (Facebook/IG) Pixel ID", hint: "ตัวเลขจาก Events Manager › แหล่งข้อมูล", group: "tracking", type: "text", isPublic: true, placeholder: "1234567890123456" },
  { key: "tiktok_pixel_id", label: "TikTok Pixel ID", hint: "จาก TikTok Ads Manager › Events › Web Events", group: "tracking", type: "text", isPublic: true, placeholder: "CXXXXXXXXXXXXXXXXXXX" },
  { key: "line_tag_id", label: "LINE Tag ID", hint: "จาก LINE Ads Manager › เครื่องมือ › LINE Tag (รหัสแท็ก)", group: "tracking", type: "text", isPublic: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
  {
    key: "meta_capi_token",
    label: "🔒 Meta Conversions API — Access Token",
    hint: "ส่งยอดซื้อจากเซิร์ฟเวอร์ตรงไป Meta (แม่นกว่าเมื่อลูกค้าใช้ iPhone/บล็อกโฆษณา) · Events Manager › การตั้งค่า › สร้างโทเค็นเข้าถึง · เก็บเป็นความลับ ไม่ส่งออกหน้าเว็บ · ใช้คู่กับ Pixel ID ด้านบน",
    group: "tracking",
    type: "text",
    isPublic: false,
  },

  // ─── 💬 ปุ่มแชทลอย (เว็บร้าน src/components/layout/FloatingChat.tsx) ───
  { key: "chat_enabled", label: "เปิดปุ่มแชทลอยมุมจอ", hint: "ต้องมีลิงก์ LINE / Facebook / เบอร์โทร ในกลุ่ม 📞 อย่างน้อย 1 ช่อง", group: "chat", type: "bool", isPublic: true },
  { key: "chat_label", label: "ข้อความข้างปุ่ม", hint: "เว้นว่าง = 'แชทกับเรา'", group: "chat", type: "text", isPublic: true, placeholder: "แชทกับเรา", i18n: true },
  { key: "chat_greeting", label: "ข้อความทักทาย (โชว์ตอนกดปุ่ม)", hint: "เช่น สอบถามสินค้า/ไซส์ ทักมาได้เลย ตอบไวในเวลาทำการ", group: "chat", type: "textarea", isPublic: true, i18n: true },
  { key: "chat_messenger_url", label: "ลิงก์ Messenger", hint: "เว้นว่าง = สร้างจากลิงก์ Facebook ให้เอง (m.me/ชื่อเพจ)", group: "chat", type: "text", isPublic: true, placeholder: "https://m.me/yourpage" },
  { key: "chat_phone", label: "มีปุ่มโทรหาร้าน", hint: "ใช้เบอร์จากกลุ่ม 📞", group: "chat", type: "bool", isPublic: true },
  { key: "chat_left", label: "วางมุมซ้าย (ปกติมุมขวา)", group: "chat", type: "bool", isPublic: true },

  // ─── ⭐ รีวิวสินค้า (ERP lib/website-reviews*.ts · แท็บ ⭐ รีวิว · เว็บร้าน ProductReviews / หน้า /review) ───
  { key: "reviews_enabled", label: "เปิดรีวิวสินค้าบนเว็บ", hint: "ปิดทีหลัง รีวิวที่มีอยู่ไม่หาย (แค่ซ่อนจากเว็บ)", group: "reviews", type: "bool", isPublic: true },
  { key: "reviews_buyers_only", label: "เฉพาะคนที่ซื้อแล้วเท่านั้น", hint: "ลูกค้ายืนยันด้วยเลขออเดอร์ + เบอร์โทร (หรือกดลิงก์ในอีเมลขอบคุณ) · รีวิวมีป้าย ✓ ซื้อจริง · ปิด = ใครก็รีวิวได้ (ต้องตรวจทุกอัน)", group: "reviews", type: "bool", isPublic: true },
  { key: "reviews_auto_approve", label: "อนุมัติอัตโนมัติ (ไม่ต้องตรวจก่อน)", hint: "เฉพาะรีวิวจากคนซื้อจริงที่ให้ 4–5 ดาว · ที่เหลือยังรอตรวจในแท็บ ⭐ รีวิว", group: "reviews", type: "bool", isPublic: true },
  { key: "reviews_points", label: "ให้แต้มสมาชิกเมื่อรีวิวผ่าน (แต้ม)", hint: "0 = ไม่ให้ · ได้เฉพาะสมาชิกที่ซื้อจริง ครั้งเดียวต่อรีวิว · ต้องเปิดระบบแต้ม", group: "reviews", type: "number", isPublic: true, placeholder: "0" },
  { key: "reviews_photo_points", label: "แต้มเพิ่มเมื่อแนบรูป", hint: "บวกเพิ่มจากด้านบน · 0 = ไม่ให้", group: "reviews", type: "number", isPublic: true, placeholder: "0" },
  { key: "reviews_show_cards", label: "โชว์ดาวบนการ์ดสินค้า", hint: "เฉพาะสินค้าที่มีรีวิวแล้ว", group: "reviews", type: "bool", isPublic: true },
  { key: "reviews_request_email", label: "ชวนรีวิวในอีเมลขอบคุณ (ออเดอร์สำเร็จ)", hint: "ต้องเปิดอีเมลแจ้งออเดอร์ในกลุ่ม 🧾 และร้านมีโดเมนแล้ว · มีปุ่ม \"รีวิวสินค้า\" ในหน้าตามออเดอร์ด้วยเสมอ", group: "reviews", type: "bool", isPublic: false },

  // ─── 📦 สั่งจอง + มัดจำ (lib/website-orders depositFor · amountDue) ───
  { key: "preorder_deposit_enabled", label: "เก็บมัดจำสินค้าพรีออเดอร์", hint: "ปิด = สั่งจองจ่ายเต็มเหมือนสินค้าปกติ", group: "preorder", type: "bool", isPublic: true },
  { key: "preorder_deposit_pct", label: "มัดจำกี่ % ของยอดออเดอร์", hint: "10–90 · แนะนำ 30–50", group: "preorder", type: "number", isPublic: true, placeholder: "30" },
  { key: "preorder_note", label: "ข้อความถึงลูกค้า (หน้าสินค้า/ชำระเงิน)", hint: "เช่น สินค้าพรีออเดอร์ ผลิตและจัดส่งภายใน 15–30 วัน · ยอดที่เหลือโอนก่อนจัดส่ง", group: "preorder", type: "text", isPublic: true, i18n: true },

  // ─── 🎁 ชวนเพื่อน (lib/website-referral · โค้ด = แถวใน store_coupons ที่มี referrer_id) ───
  { key: "referral_enabled", label: "เปิดโค้ดชวนเพื่อน", hint: "ปิด = โค้ดชวนเพื่อนใช้ไม่ได้ (โค้ดเดิมยังอยู่ เปิดกลับมาใช้ได้)", group: "referral", type: "bool", isPublic: true },
  { key: "referral_friend_discount", label: "เพื่อนได้ส่วนลด (บาท)", hint: "ลดจากยอดสินค้าออเดอร์แรกของเพื่อน", group: "referral", type: "number", isPublic: true, placeholder: "100" },
  { key: "referral_min_subtotal", label: "ยอดสินค้าขั้นต่ำของเพื่อน (บาท)", hint: "0 = ไม่มีขั้นต่ำ", group: "referral", type: "number", isPublic: true, placeholder: "0" },
  { key: "referral_reward_points", label: "คนชวนได้แต้ม", hint: "ให้เมื่อออเดอร์ของเพื่อน “สำเร็จ” (ครั้งเดียวต่อออเดอร์) · ต้องเปิดระบบแต้ม", group: "referral", type: "number", isPublic: true, placeholder: "100" },

  // ─── ↩️ ขอคืน/เปลี่ยนสินค้า (lib/website-returns · returnDeadline) ───
  { key: "returns_enabled", label: "เปิดให้ลูกค้าขอคืน/เปลี่ยนทางเว็บ", group: "returns", type: "bool", isPublic: true },
  { key: "returns_days", label: "ขอได้ภายในกี่วันหลังได้รับของ", hint: "1–90 · นับจากวันที่ตั้งออเดอร์เป็น “สำเร็จ” (ยังไม่ตั้ง = ประมาณวันสั่ง + 7 วัน)", group: "returns", type: "number", isPublic: true, placeholder: "14" },
  { key: "returns_note", label: "เงื่อนไขที่ลูกค้าเห็นตอนขอ", hint: "เช่น สินค้าต้องอยู่ในสภาพเดิม มีป้ายครบ · ค่าส่งกลับลูกค้าออก (ยกเว้นสินค้าชำรุด/ส่งผิด)", group: "returns", type: "text", isPublic: true, i18n: true },

  // ─── 🔔 แจ้งลูกค้าอัตโนมัติ (lib/webshop-line · lib/webshop-reminders) ───
  { key: "line_notify_enabled", label: "แจ้งสถานะออเดอร์ทาง LINE OA (สั่งแล้ว · จ่ายแล้ว · ส่งแล้วพร้อมเลขพัสดุ · สำเร็จ · ยกเลิก) + ผลขอคืน/เปลี่ยน", group: "notify", type: "bool", isPublic: false },
  { key: "cart_reminder_enabled", label: "เตือนลืมของในตะกร้า (สมาชิก)", hint: "ใส่ของแล้วไม่สั่งเกินเวลาที่ตั้ง → ส่งอีเมล/LINE 1 ครั้ง · สมาชิกที่ยินยอมรับข่าวสารเท่านั้น", group: "notify", type: "bool", isPublic: true },
  { key: "cart_reminder_hours", label: "เตือนหลังทิ้งตะกร้ากี่ชั่วโมง", hint: "2–72 · ค่าเริ่ม 6", group: "notify", type: "number", isPublic: false, placeholder: "6" },
  { key: "wishlist_alert_enabled", label: "แจ้งเมื่อของที่ถูกใจลดราคา (สมาชิก)", hint: "ราคาลดลงจากตอนกดถูกใจ ≥ % ที่ตั้ง → ส่งอีเมล/LINE ครั้งเดียวต่อการลด · สมาชิกที่ยินยอมรับข่าวสารเท่านั้น", group: "notify", type: "bool", isPublic: false },
  { key: "wishlist_alert_pct", label: "ลดอย่างน้อยกี่ % ถึงแจ้ง", hint: "1–90 · ค่าเริ่ม 5", group: "notify", type: "number", isPublic: false, placeholder: "5" },

  // ─── 🚚 Shippop (lib/shippop · /api/website/orders/shippop) — ไม่ส่งให้เว็บร้าน ───
  { key: "shippop_enabled", label: "เปิดปุ่มจองขนส่ง Shippop ในออเดอร์", hint: "", group: "shippop", type: "bool", isPublic: false },
  { key: "shippop_courier", label: "ขนส่งที่ใช้ประจำ (รหัส)", hint: "EMST = ไปรษณีย์ EMS · FLE = Flash · KRYX = KEX · JNTP = J&T · BEST · SPX · DHL (เปลี่ยนได้ทุกครั้งตอนจอง)", group: "shippop", type: "text", isPublic: false, placeholder: "FLE" },
  { key: "shippop_box", label: "ขนาดกล่องปกติ (กว้างxยาวxสูง ซม.)", hint: "", group: "shippop", type: "text", isPublic: false, placeholder: "20x30x10" },
  { key: "shippop_weight", label: "น้ำหนักต่อชิ้นโดยประมาณ (กรัม)", hint: "คูณจำนวนชิ้นในออเดอร์ · แก้ได้ตอนจอง", group: "shippop", type: "number", isPublic: false, placeholder: "500" },
  { key: "shippop_from_name", label: "ผู้ส่ง: ชื่อ", hint: "", group: "shippop", type: "text", isPublic: false },
  { key: "shippop_from_tel", label: "ผู้ส่ง: เบอร์โทร", hint: "", group: "shippop", type: "text", isPublic: false },
  { key: "shippop_from_address", label: "ผู้ส่ง: บ้านเลขที่ / ถนน", hint: "", group: "shippop", type: "text", isPublic: false },
  { key: "shippop_from_district", label: "ผู้ส่ง: ตำบล/แขวง", hint: "", group: "shippop", type: "text", isPublic: false },
  { key: "shippop_from_state", label: "ผู้ส่ง: อำเภอ/เขต", hint: "", group: "shippop", type: "text", isPublic: false },
  { key: "shippop_from_province", label: "ผู้ส่ง: จังหวัด", hint: "", group: "shippop", type: "text", isPublic: false },
  { key: "shippop_from_postcode", label: "ผู้ส่ง: รหัสไปรษณีย์", hint: "", group: "shippop", type: "text", isPublic: false },

  // ─── 🔀 ย้ายลิงก์เก่า (เว็บร้าน not-found → redirect 301 · กติกา cleanRedirects) ───
  {
    key: "redirects",
    label: "รายการลิงก์ที่ย้าย",
    hint: "บรรทัดละ 1 คู่: ลิงก์เก่า -> ลิงก์ใหม่ เช่น  /products/roar-bag -> /product/roar01  ·  ลิงก์ใหม่ใส่เต็ม https://… ก็ได้ · ใช้กับลิงก์ที่เว็บหาไม่เจอเท่านั้น (หน้าที่มีอยู่จริงไม่ถูกย้าย)",
    group: "redirects",
    type: "textarea",
    isPublic: true,
    placeholder: "/products/roar-bag -> /product/roar01\n/collections/new -> /new",
  },

  // ─── 🔍 ค้นหาสินค้า (เว็บร้าน src/lib/search.ts) ───
  {
    key: "search_synonyms",
    label: "คำที่หมายถึงกันเอง",
    hint: "บรรทัดละ 1 กลุ่ม คั่นด้วยจุลภาค เช่น  กระเป๋าสตางค์, wallet, กระเป๋าเงิน  → ค้นคำไหนก็เจอทั้งกลุ่ม (ภาษาไทย/อังกฤษ/คำเรียกของลูกค้า)",
    group: "search",
    type: "textarea",
    isPublic: true,
    placeholder: "กระเป๋าสตางค์, wallet, กระเป๋าเงิน\nเข็มขัด, belt",
  },
];

/** ช่องความลับ (ไม่ส่งกลับไปหน้าจอ ERP แบบเต็ม — โชว์ SECRET_MASK แทน · บันทึกค่า mask = คงค่าเดิม) */
export const SITE_INFO_SECRET_KEYS = ["meta_capi_token"] as const;
export const SITE_INFO_SECRET_MASK = "••••••••";

/** ส่งกลับหน้าจอ ERP: ช่องความลับที่มีค่า = mask (ไม่โชว์ของจริง) */
export function maskSiteInfoSecrets<T extends object>(info: T): T {
  const out: Record<string, unknown> = { ...(info as Record<string, unknown>) };
  for (const k of SITE_INFO_SECRET_KEYS) if (out[k]) out[k] = SITE_INFO_SECRET_MASK;
  return out as T;
}
/** หน้าจอส่ง mask กลับมา (ไม่ได้แก้ช่องนั้น) = ใช้ค่าเดิม */
export function restoreMaskedSecrets(raw: Record<string, unknown>, before: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  for (const k of SITE_INFO_SECRET_KEYS) if (out[k] === SITE_INFO_SECRET_MASK) out[k] = before[k] ?? "";
  return out;
}

/** รหัสวัดผล: รูปแบบที่ผู้ให้บริการใช้จริง — ผิดรูป = ไม่เก็บ (กันโค้ด/ข้อความแปลกไปอยู่ในสคริปต์หน้าเว็บ) */
const TRACK_ID: Record<string, RegExp> = {
  ga4_id: /^G-[A-Z0-9]{4,16}$/,
  meta_pixel_id: /^\d{8,20}$/,
  tiktok_pixel_id: /^[A-Z0-9]{10,32}$/,
  line_tag_id: /^[a-f0-9-]{8,64}$/,
};
export function cleanTrackingId(key: string, v: unknown): string {
  const re = TRACK_ID[key];
  if (!re) return "";
  let s = String(v ?? "").trim().replace(/\s+/g, "");
  s = key === "line_tag_id" ? s.toLowerCase() : s.toUpperCase();
  return re.test(s) ? s : "";
}

/** 🔍 คำพ้อง: บรรทัดละกลุ่ม คั่นด้วย , (รับ ، ; / ด้วย) · ตัดคำว่าง/ซ้ำ · กลุ่มต้องมี ≥2 คำ · สูงสุด 100 กลุ่ม (กติกาเดียวกับเว็บร้าน src/lib/search.ts parseSynonyms) */
export function cleanSynonyms(v: unknown): string {
  const lines: string[] = [];
  for (const line of String(v ?? "").split(/\r?\n/)) {
    const words = [...new Set(line.split(/[,،;]/).map((w) => w.trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean))];
    if (words.length >= 2) lines.push(words.join(", "));
    if (lines.length >= 100) break;
  }
  return lines.join("\n").slice(0, 4000);
}

/** 🔀 ย้ายลิงก์: บรรทัดละคู่ "/เก่า -> /ใหม่" (รับ → หรือเว้นวรรคด้วย) · เก่าต้องขึ้นต้น / · ใหม่ = /… หรือ https://… · ตัดซ้ำ/วนกลับตัวเอง · สูงสุด 300 คู่ (กติกาเดียวกับเว็บร้าน src/lib/redirects.ts) */
export function cleanRedirects(v: unknown): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of String(v ?? "").split(/\r?\n/)) {
    const m = /^\s*(\/\S*)\s*(?:->|→|=>|\s)\s*(\/\S*|https?:\/\/\S+)\s*$/.exec(line);
    if (!m) continue;
    const from = m[1].replace(/\/+$/, "") || "/";
    const to = m[2];
    if (from === "/" || seen.has(from.toLowerCase()) || from === to.replace(/\/+$/, "")) continue;
    seen.add(from.toLowerCase());
    out.push(`${from.slice(0, 300)} -> ${to.slice(0, 500)}`);
    if (out.length >= 300) break;
  }
  return out.join("\n");
}

export const SITE_INFO_KEYS = SITE_INFO_FIELDS.map((f) => f.key);

/** 🌐 ฟิลด์ที่มีภาษาอังกฤษคู่ */
export const SITE_INFO_I18N_KEYS = SITE_INFO_FIELDS.filter((f) => f.i18n).map((f) => f.key);

/** ค่าที่อ่านออกมาแล้ว (ครบทุก key เสมอ) · ภาษาอังกฤษ = `<key>_en` (มีเฉพาะที่กรอก) · `_i18n` = สถานะการแปล */
export interface SiteInfo {
  [enKey: `${string}_en`]: string;
  site_tagline: string;
  site_description: string;
  footer_note: string;
  site_closed: boolean;
  closed_title: string;
  closed_message: string;
  beta_canvas: boolean;
  lang_en_enabled: boolean;
  contact_phone: string;
  contact_line: string;
  contact_line_url: string;
  contact_email: string;
  contact_address: string;
  contact_hours: string;
  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  social_x: string;
  social_pinterest: string;
  social_youtube: string;
  social_shopee: string;
  social_lazada: string;
  shipping_flat: number;
  free_shipping_min: number;
  pay_cod: boolean;
  pay_promptpay: boolean;
  promptpay_number: string;
  promptpay_name: string;
  slip_upload_enabled: boolean;
  slip_auto_verify: boolean;
  order_note: string;
  order_email_enabled: boolean;
  order_prefix: string;
  gift_enabled: boolean;
  gift_fee: number;
  gift_title: string;
  gift_desc: string;
  gift_allow_message: boolean;
  gift_allow_hide_price: boolean;
  card_enabled: boolean;
  card_fee: number;
  card_title: string;
  promo_enabled: boolean;
  promo_code: string;
  promo_title: string;
  promo_text: string;
  promo_collect_email: boolean;
  promo_delay: number;
  points_enabled: boolean;
  points_earn_unit: number;
  points_value: number;
  points_max_redeem_pct: number;
  points_min_redeem: number;
  fit_check_enabled: boolean;
  belt_enabled: boolean;
  belt_base_price: number;
  belt_engraving_fee: number;
  belt_engraving_max: number;
  belt_lead_time: string;
  ga4_id: string;
  meta_pixel_id: string;
  tiktok_pixel_id: string;
  line_tag_id: string;
  meta_capi_token: string;
  chat_enabled: boolean;
  chat_label: string;
  chat_greeting: string;
  chat_messenger_url: string;
  chat_phone: boolean;
  chat_left: boolean;
  reviews_enabled: boolean;
  reviews_buyers_only: boolean;
  reviews_auto_approve: boolean;
  reviews_points: number;
  reviews_photo_points: number;
  reviews_show_cards: boolean;
  reviews_request_email: boolean;
  search_synonyms: string;
  preorder_deposit_enabled: boolean;
  preorder_deposit_pct: number;
  preorder_note: string;
  tax_invoice_enabled: boolean;
  tax_invoice_company: string;
  returns_enabled: boolean;
  returns_days: number;
  returns_note: string;
  line_notify_enabled: boolean;
  cart_reminder_enabled: boolean;
  cart_reminder_hours: number;
  wishlist_alert_enabled: boolean;
  wishlist_alert_pct: number;
  shippop_enabled: boolean;
  shippop_courier: string;
  shippop_box: string;
  shippop_weight: number;
  shippop_from_name: string;
  shippop_from_tel: string;
  shippop_from_address: string;
  shippop_from_district: string;
  shippop_from_state: string;
  shippop_from_province: string;
  shippop_from_postcode: string;
  referral_enabled: boolean;
  referral_friend_discount: number;
  referral_min_subtotal: number;
  referral_reward_points: number;
  redirects: string;
  _i18n?: I18nMeta;
}

export const DEFAULT_SITE_INFO: SiteInfo = {
  site_tagline: "",
  site_description: "",
  footer_note: "",
  site_closed: false,
  closed_title: "",
  closed_message: "",
  beta_canvas: false,
  lang_en_enabled: false,
  contact_phone: "",
  contact_line: "",
  contact_line_url: "",
  contact_email: "",
  contact_address: "",
  contact_hours: "",
  social_facebook: "",
  social_instagram: "",
  social_tiktok: "",
  social_x: "",
  social_pinterest: "",
  social_youtube: "",
  social_shopee: "",
  social_lazada: "",
  shipping_flat: 50,
  free_shipping_min: 0,
  pay_cod: true,
  pay_promptpay: true,
  promptpay_number: "",
  promptpay_name: "",
  slip_upload_enabled: true,
  slip_auto_verify: false,
  order_note: "",
  order_email_enabled: false,
  order_prefix: "",
  gift_enabled: false,
  gift_fee: 0,
  gift_title: "",
  gift_desc: "",
  gift_allow_message: true,
  gift_allow_hide_price: true,
  card_enabled: false,
  card_fee: 0,
  card_title: "",
  promo_enabled: false,
  promo_code: "",
  promo_title: "",
  promo_text: "",
  promo_collect_email: true,
  promo_delay: 6,
  points_enabled: false,
  points_earn_unit: 100,
  points_value: 1,
  points_max_redeem_pct: 50,
  points_min_redeem: 10,
  fit_check_enabled: false,
  belt_enabled: false,
  belt_base_price: 0,
  belt_engraving_fee: 0,
  belt_engraving_max: 12,
  belt_lead_time: "",
  ga4_id: "",
  meta_pixel_id: "",
  tiktok_pixel_id: "",
  line_tag_id: "",
  meta_capi_token: "",
  chat_enabled: false,
  chat_label: "",
  chat_greeting: "",
  chat_messenger_url: "",
  chat_phone: false,
  chat_left: false,
  reviews_enabled: false,
  reviews_buyers_only: true,
  reviews_auto_approve: false,
  reviews_points: 0,
  reviews_photo_points: 0,
  reviews_show_cards: true,
  reviews_request_email: true,
  search_synonyms: "",
  preorder_deposit_enabled: false,
  preorder_deposit_pct: 30,
  preorder_note: "",
  tax_invoice_enabled: false,
  tax_invoice_company: "",
  returns_enabled: false,
  returns_days: 14,
  returns_note: "",
  line_notify_enabled: false,
  cart_reminder_enabled: false,
  cart_reminder_hours: 6,
  wishlist_alert_enabled: false,
  wishlist_alert_pct: 5,
  shippop_enabled: false,
  shippop_courier: "FLE",
  shippop_box: "20x30x10",
  shippop_weight: 500,
  shippop_from_name: "",
  shippop_from_tel: "",
  shippop_from_address: "",
  shippop_from_district: "",
  shippop_from_state: "",
  shippop_from_province: "",
  shippop_from_postcode: "",
  referral_enabled: false,
  referral_friend_discount: 100,
  referral_min_subtotal: 0,
  referral_reward_points: 100,
  redirects: "",
};

const URL_KEYS = new Set([
  "chat_messenger_url",
  "contact_line_url",
  "social_facebook",
  "social_instagram",
  "social_tiktok",
  "social_x",
  "social_pinterest",
  "social_youtube",
  "social_shopee",
  "social_lazada",
]);

/** รับเฉพาะลิงก์ http(s) — กัน javascript: หรือข้อความมั่ว ๆ ไปอยู่ใน href บนเว็บร้าน */
export function cleanUrl(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 300) : "";
  } catch {
    return "";
  }
}

const toBool = (v: unknown, fb: boolean): boolean => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fb;
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const toNum = (v: unknown, fb: number): number => {
  const s = String(v ?? "").trim();
  if (!s) return fb;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fb;
};

/** ตัวย่อเลขออเดอร์: A-Z 0-9 ไม่เกิน 6 ตัว */
export const cleanOrderPrefix = (v: unknown): string =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

/**
 * แปลงค่าดิบ (จาก DB เป็น key/value string หรือจากฟอร์มเป็น object) ให้เป็น SiteInfo ครบทุกช่อง
 * รับได้ทั้ง `{key,value}[]` และ `Record<string, unknown>`
 */
export function normalizeSiteInfo(raw: unknown): SiteInfo {
  const m = new Map<string, unknown>();
  if (Array.isArray(raw)) {
    for (const r of raw as { key?: unknown; value?: unknown }[]) {
      if (r && typeof r.key === "string") m.set(r.key, r.value);
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) m.set(k, v);
  }

  const d = DEFAULT_SITE_INFO;
  const out: Record<string, unknown> = {};
  for (const f of SITE_INFO_FIELDS) {
    const v = m.get(f.key);
    const fb = d[f.key as keyof SiteInfo];
    if (f.type === "bool") out[f.key] = toBool(v, fb as boolean);
    else if (f.type === "number") out[f.key] = f.key === "promo_delay" ? Math.min(60, toNum(v, fb as number)) : f.key.startsWith("reviews_") || f.key.startsWith("referral_") ? Math.max(0, Math.min(f.key.startsWith("referral_") ? 100000 : 10000, Math.round(toNum(v, fb as number)))) : f.key === "preorder_deposit_pct" ? Math.max(10, Math.min(90, Math.round(toNum(v, fb as number)))) : f.key === "returns_days" ? Math.max(1, Math.min(90, Math.round(toNum(v, fb as number)))) : f.key === "cart_reminder_hours" ? Math.max(2, Math.min(72, Math.round(toNum(v, fb as number)))) : f.key === "wishlist_alert_pct" ? Math.max(1, Math.min(90, Math.round(toNum(v, fb as number)))) : toNum(v, fb as number);
    else if (f.key === "search_synonyms") out[f.key] = cleanSynonyms(v);
    else if (f.key === "redirects") out[f.key] = cleanRedirects(v);
    else if (f.key === "order_prefix") out[f.key] = cleanOrderPrefix(v);
    else if (f.key === "promo_code") out[f.key] = normalizeCouponCode(v);
    else if (f.key in TRACK_ID) out[f.key] = cleanTrackingId(f.key, v);
    else if (f.key === "meta_capi_token") out[f.key] = String(v ?? "").trim().replace(/\s+/g, "").slice(0, 600);
    else if (URL_KEYS.has(f.key)) out[f.key] = cleanUrl(v);
    else out[f.key] = String(v ?? "").trim().slice(0, f.type === "textarea" ? 1000 : 200);
  }
  // 🌐 ภาษาอังกฤษ (ว่าง = ไม่เก็บ → เว็บใช้ไทย) + สถานะการแปล (DB เก็บเป็น JSON string)
  const kept: string[] = [];
  for (const f of SITE_INFO_FIELDS) {
    if (!f.i18n) continue;
    const en = String(m.get(`${f.key}_en`) ?? "").trim().slice(0, f.type === "textarea" ? 1500 : 300);
    if (en) {
      out[`${f.key}_en`] = en;
      kept.push(f.key);
    }
  }
  const metaRaw = m.get("_i18n");
  const meta = sanitizeI18nMeta(typeof metaRaw === "string" ? safeJson(metaRaw) : metaRaw, kept);
  if (meta) out._i18n = meta;
  return out as unknown as SiteInfo;
}

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** แถวสำหรับ upsert ลง store_settings (เก็บทุกค่าเป็น string) */
export function siteInfoToRows(shopId: string, info: SiteInfo): { shop_id: string; key: string; value: string; updated_at: string }[] {
  const now = new Date().toISOString();
  const rows = SITE_INFO_FIELDS.map((f) => {
    const v = info[f.key as keyof SiteInfo];
    const value = typeof v === "boolean" ? (v ? "1" : "0") : String(v ?? "");
    return { shop_id: shopId, key: f.key, value, updated_at: now };
  });
  // 🌐 เขียนทุกช่องอังกฤษ (ว่างด้วย — ลบคำแปลได้) + สถานะการแปล
  for (const k of SITE_INFO_I18N_KEYS) rows.push({ shop_id: shopId, key: `${k}_en`, value: String(info[`${k}_en`] ?? ""), updated_at: now });
  rows.push({ shop_id: shopId, key: "_i18n", value: info._i18n ? JSON.stringify(info._i18n) : "", updated_at: now });
  return rows;
}

/** ชุดที่ปล่อยออก API สาธารณะ — ตัดฟิลด์ภายในออก */
export function publicSiteInfo(info: SiteInfo): Omit<SiteInfo, "order_prefix" | "beta_canvas"> {
  const out: Record<string, unknown> = {};
  for (const f of SITE_INFO_FIELDS) {
    if (!f.isPublic) continue;
    out[f.key] = info[f.key as keyof SiteInfo];
    // 🌐 เว็บร้านหน้า /en สลับ <key>_en ให้เอง (lib/i18n localizeContent)
    if (f.i18n && info[`${f.key}_en`]) out[`${f.key}_en`] = info[`${f.key}_en`];
  }
  return out as Omit<SiteInfo, "order_prefix" | "beta_canvas">;
}

/** 🎀 ค่าห่อของขวัญที่คิดจริง — ร้านปิดบริการ / ลูกค้าไม่ได้ขอ = 0 (ไม่โดนส่วนลด/แต้ม เหมือนค่าส่ง) */
export function calcGiftFee(wrap: boolean, info: Pick<SiteInfo, "gift_enabled" | "gift_fee">): number {
  if (!wrap || !info.gift_enabled) return 0;
  return Math.max(0, Math.round(info.gift_fee * 100) / 100);
}

/** 💌 ค่าการ์ดอวยพร (บริการแยกจากห่อ) — ร้านปิดบริการ/ไม่ได้เลือก = 0 */
export function calcCardFee(card: boolean, info: Pick<SiteInfo, "card_enabled" | "card_fee">): number {
  if (!card || !info.card_enabled) return 0;
  return Math.max(0, Math.round(info.card_fee * 100) / 100);
}

/** สวิตช์ฟีเจอร์ทดลองที่ร้านนี้เปิดอยู่ (key ขึ้นต้น beta_) — ใช้กรองคลัง Section ด้วย blockTypesFor() */
export async function readShopBetas(sb: Admin, shopId: string): Promise<Set<string>> {
  const { data } = await sb.from("store_settings").select("key, value").eq("shop_id", shopId).like("key", "beta_%");
  const on = (v: unknown) => ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
  return new Set(((data ?? []) as { key: string; value: unknown }[]).filter((r) => on(r.value)).map((r) => r.key));
}

/** 📐 ร้านที่เปิด "เช็คขนาด" (fit_check_enabled) — อ่านทีเดียวทุกร้าน */
export async function readFitCheckShops(sb: Admin): Promise<Set<string>> {
  const { data } = await sb.from("store_settings").select("shop_id, value").eq("key", "fit_check_enabled");
  const on = (v: unknown) => ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
  return new Set(((data ?? []) as { shop_id: string; value: unknown }[]).filter((r) => on(r.value)).map((r) => r.shop_id));
}

/** ค่าส่ง: ฟรีเมื่อถึงยอดขั้นต่ำ (ถ้าตั้ง) ไม่งั้นเหมาตามที่ตั้ง */
export function calcShippingFee(subtotal: number, info: Pick<SiteInfo, "shipping_flat" | "free_shipping_min">): number {
  if (info.free_shipping_min > 0 && subtotal >= info.free_shipping_min) return 0;
  return Math.max(0, info.shipping_flat);
}

/**
 * ตัวย่อเลขออเดอร์ที่ใช้จริง — ตั้งไว้ใช้ตามนั้น ไม่ตั้ง = ตัวอักษร/ตัวเลขจาก slug ร้าน 2-3 ตัวแรก
 * เช่น louismontini → "LO", pixiedustie → "PI" (ร้าน Pixiedustie ของเดิมใช้ "PX" ตั้งไว้ใน store_settings)
 */
export function orderPrefixFor(info: Pick<SiteInfo, "order_prefix">, shopSlug: string): string {
  if (info.order_prefix) return info.order_prefix;
  const fromSlug = cleanOrderPrefix(shopSlug).slice(0, 2);
  return fromSlug || "WEB";
}

// ใช้ชนิดของ client จริง (type-only import — ไม่ดึงโค้ดฝั่งเซิร์ฟเวอร์เข้ามาตอนรัน)
// ⚠️ เคยประกาศเป็น structural type เองแล้ว TS ไล่ชนิด generic ของ supabase ลึกเกิน (TS2589)
type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

/** อ่านข้อมูลร้านจาก DB (ใช้ supabaseAdmin — ตาราง store_* ปิด RLS สำหรับ anon) */
export async function readSiteInfo(sb: Admin, shopId: string): Promise<SiteInfo> {
  const { data } = await sb.from("store_settings").select("key, value").eq("shop_id", shopId);
  return normalizeSiteInfo(Array.isArray(data) ? data : []);
}
