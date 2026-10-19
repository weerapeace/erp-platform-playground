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
  group: "shop" | "contact" | "order" | "gift" | "promo" | "points" | "fit" | "belt";
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
];

export const SITE_INFO_FIELDS: SiteInfoField[] = [
  // ─── ร้าน ───
  { key: "site_tagline", label: "คำโปรยร้าน", hint: "สั้น ๆ 1 บรรทัด เช่น กระเป๋าหนังแท้ งานไทย ตั้งแต่ปี 1996", group: "shop", type: "text", isPublic: true, i18n: true },
  { key: "site_description", label: "คำอธิบายร้าน (SEO)", hint: "2-3 ประโยค โชว์ใต้ชื่อเว็บใน Google และท้ายเว็บ", group: "shop", type: "textarea", isPublic: true, i18n: true },
  { key: "footer_note", label: "ข้อความท้ายเว็บ", hint: "เช่น เลขทะเบียนพาณิชย์ หรือ 'จัดส่งทั่วไทย'", group: "shop", type: "text", isPublic: true, i18n: true },
  // ─── ปิดเว็บชั่วคราว (ปุ่มลัดอยู่หัวหน้า /website/<slug> · components/website-open-toggle.tsx) ───
  { key: "site_closed", label: "ปิดเว็บชั่วคราว (ลูกค้าเห็นหน้า 'เร็ว ๆ นี้')", hint: "ทุกโดเมนของร้านนี้ · พรีวิวใน ERP ยังเห็นเว็บเต็ม · ระบบรับออเดอร์ยังทำงาน", group: "shop", type: "bool", isPublic: true },
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
  { key: "shipping_flat", label: "ค่าส่งเหมา (บาท)", hint: "0 = ส่งฟรีทุกออเดอร์", group: "order", type: "number", isPublic: true },
  { key: "free_shipping_min", label: "ส่งฟรีเมื่อยอดถึง (บาท)", hint: "0 = ไม่มีเงื่อนไขส่งฟรี", group: "order", type: "number", isPublic: true },
  { key: "pay_cod", label: "รับเก็บเงินปลายทาง (COD)", group: "order", type: "bool", isPublic: true },
  { key: "pay_promptpay", label: "รับโอนพร้อมเพย์", group: "order", type: "bool", isPublic: true },
  { key: "promptpay_number", label: "เลขพร้อมเพย์", hint: "เบอร์โทรหรือเลขบัตรประชาชน/นิติบุคคล — ลูกค้าเห็นตอนสั่งซื้อ", group: "order", type: "text", isPublic: true },
  { key: "promptpay_name", label: "ชื่อบัญชีพร้อมเพย์", group: "order", type: "text", isPublic: true },
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
];

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
};

const URL_KEYS = new Set([
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
    else if (f.type === "number") out[f.key] = f.key === "promo_delay" ? Math.min(60, toNum(v, fb as number)) : toNum(v, fb as number);
    else if (f.key === "order_prefix") out[f.key] = cleanOrderPrefix(v);
    else if (f.key === "promo_code") out[f.key] = normalizeCouponCode(v);
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
