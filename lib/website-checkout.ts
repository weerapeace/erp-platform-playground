/**
 * 💳 ดีไซน์หน้าชำระเงิน (theme.checkout) — ตั้งในแท็บดีไซน์ → 💳 หน้าชำระเงิน · pure · ไม่มี import
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/checkout-config.ts — แก้ที่นี่แล้วคัดลอก (คงหัวไฟล์ฝั่งนั้นไว้)
 * เว็บร้านวาดที่ components/checkout/CheckoutClient.tsx (หน้ากรอก + หน้าขอบคุณหลังสั่ง)
 * ค่าเริ่มต้น = หน้าตาเดิม · ข้อความว่าง = ข้อความเริ่มต้นตามภาษา (CHECKOUT_TEXT) · ภาษาอังกฤษ = `<key>_en` (THEME_TEXT_KEYS)
 * เปิด/ปิดช่องทางจ่าย · เลขพร้อมเพย์ · ค่าส่ง = แท็บข้อมูลร้าน (ไม่ได้อยู่ที่นี่)
 */
export type CheckoutFieldMode = "opt" | "req" | "hide";
export type CheckoutLayout = "right" | "left" | "top";
export interface CheckoutConfig {
  /* ── ข้อความ (ว่าง = ค่าเริ่มต้น) ── */
  title: string;
  confirmText: string;
  /* ── ช่องที่ลูกค้ากรอก (ชื่อ · เบอร์ · บ้านเลขที่ = บังคับเสมอ) ── */
  email: CheckoutFieldMode;
  /** ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์ */
  addressDetail: "opt" | "req";
  note: "show" | "hide";
  /* ── การจัดวาง ── */
  /** สรุปคำสั่งซื้อ: ขวา (เดิม) · ซ้าย · คอลัมน์เดียวสรุปอยู่บน */
  layout: CheckoutLayout;
  /** กล่องแต่ละส่วน: มีกรอบ (เดิม) · เรียบไม่มีกรอบ */
  boxStyle: "card" | "flat";
  /* ── ช่องทางชำระเงิน: ชื่อ/คำอธิบายที่ลูกค้าเห็น (ว่าง = ค่าเริ่มต้น) ── */
  codLabel: string;
  codHint: string;
  promptpayLabel: string;
  promptpayHint: string;
  /* ── แถบความมั่นใจใต้ปุ่มยืนยัน ── */
  trust: boolean;
  /** คั่นแต่ละข้อด้วย · (ว่าง = ค่าเริ่มต้น) */
  trustText: string;
  /* ── หัวเว็บ + มือถือ ── */
  /** หัวเว็บตอนชำระเงิน: เต็ม (เดิม) · เรียบ = โลโก้ + "ชำระเงินปลอดภัย" ซ่อนเมนู/ไอคอน/ท้ายเว็บ/เมนูลัดมือถือ (ลูกค้าไม่หลุดออกระหว่างจ่าย) */
  header: "full" | "simple";
  /** มือถือ: สรุปคำสั่งซื้อ อยู่ท้ายหน้า (เดิม) · แถบพับได้บนสุด "ดูสรุปคำสั่งซื้อ ฿…" */
  mobileSummary: "bottom" | "collapse";
  /** มือถือ: ยอดรวม + ปุ่มยืนยันติดล่างจอ */
  stickyConfirm: boolean;
  /** ยอดรวมในปุ่ม "ยืนยันคำสั่งซื้อ · ฿948" */
  confirmTotal: boolean;
  /* ── นโยบาย (หน้าในศูนย์ช่วยเหลือ — เปิดแบบเดียวกับหน้าสินค้า › นโยบาย) ── */
  /** ลิงก์ ข้อกำหนด · การจัดส่งและคืนสินค้า · ความเป็นส่วนตัว ใต้ปุ่มยืนยัน (เฉพาะหน้าที่เผยแพร่แล้ว) */
  policyLinks: boolean;
  /** ต้องติ๊กยอมรับเงื่อนไขก่อนกดยืนยัน (เปิด = โชว์ลิงก์นโยบายด้วยเสมอ) */
  acceptTerms: boolean;
  acceptText: string;
  /* ── หน้าขอบคุณ (หลังกดสั่ง) ── */
  thanksTitle: string;
  /** {shop} = ชื่อร้าน */
  thanksText: string;
}

/** ข้อความเริ่มต้น ไทย / อังกฤษ — ช่องว่างใน CheckoutConfig ใช้ค่านี้ (หลังบ้านโชว์เป็นตัวอย่างในช่อง) */
export const CHECKOUT_TEXT = {
  title: { th: "ชำระเงิน", en: "Checkout" },
  confirmText: { th: "ยืนยันคำสั่งซื้อ", en: "Place order" },
  codLabel: { th: "เก็บเงินปลายทาง", en: "Cash on delivery" },
  codHint: { th: "จ่ายกับพนักงานส่งตอนรับของ", en: "Pay the courier when your order arrives" },
  promptpayLabel: { th: "โอนพร้อมเพย์", en: "PromptPay transfer" },
  promptpayHint: { th: "ได้ QR ให้สแกนทันทีหลังกดสั่ง", en: "Get a QR code to scan right after ordering" },
  trustText: { th: "ชำระเงินปลอดภัย · จัดส่งไว · สอบถามร้านได้ทุกเมื่อ", en: "Secure checkout · Fast delivery · Questions? Just ask" },
  thanksTitle: { th: "รับคำสั่งซื้อแล้ว", en: "Order received" },
  thanksText: { th: "ขอบคุณที่อุดหนุน {shop}", en: "Thank you for shopping with {shop}" },
  acceptText: { th: "ฉันอ่านและยอมรับเงื่อนไขการสั่งซื้อและนโยบายการคืนสินค้า", en: "I have read and agree to the terms of sale and returns policy" },
} as const;
export type CheckoutTextKey = keyof typeof CHECKOUT_TEXT;

export const DEFAULT_CHECKOUT: CheckoutConfig = {
  title: "",
  confirmText: "",
  email: "opt",
  addressDetail: "opt",
  note: "show",
  layout: "right",
  boxStyle: "card",
  codLabel: "",
  codHint: "",
  promptpayLabel: "",
  promptpayHint: "",
  trust: false,
  trustText: "",
  header: "full",
  mobileSummary: "bottom",
  stickyConfirm: false,
  confirmTotal: false,
  policyLinks: false,
  acceptTerms: false,
  acceptText: "",
  thanksTitle: "",
  thanksText: "",
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const pick = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (allowed.includes(v as T) ? (v as T) : fb);

export function normalizeCheckout(raw: unknown): CheckoutConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CHECKOUT;
  return {
    title: str(r.title, 60),
    confirmText: str(r.confirmText, 40),
    email: pick(r.email, ["opt", "req", "hide"] as const, d.email),
    addressDetail: pick(r.addressDetail, ["opt", "req"] as const, d.addressDetail),
    note: pick(r.note, ["show", "hide"] as const, d.note),
    layout: pick(r.layout, ["right", "left", "top"] as const, d.layout),
    boxStyle: pick(r.boxStyle, ["card", "flat"] as const, d.boxStyle),
    codLabel: str(r.codLabel, 40),
    codHint: str(r.codHint, 80),
    promptpayLabel: str(r.promptpayLabel, 40),
    promptpayHint: str(r.promptpayHint, 80),
    trust: typeof r.trust === "boolean" ? r.trust : d.trust,
    trustText: str(r.trustText, 160),
    header: pick(r.header, ["full", "simple"] as const, d.header),
    mobileSummary: pick(r.mobileSummary, ["bottom", "collapse"] as const, d.mobileSummary),
    stickyConfirm: typeof r.stickyConfirm === "boolean" ? r.stickyConfirm : d.stickyConfirm,
    confirmTotal: typeof r.confirmTotal === "boolean" ? r.confirmTotal : d.confirmTotal,
    policyLinks: typeof r.policyLinks === "boolean" ? r.policyLinks : d.policyLinks,
    acceptTerms: typeof r.acceptTerms === "boolean" ? r.acceptTerms : d.acceptTerms,
    acceptText: str(r.acceptText, 160),
    thanksTitle: str(r.thanksTitle, 60),
    thanksText: str(r.thanksText, 200),
  };
}

/** ข้อความที่ใช้จริง: ตั้งเอง (ตัดช่องว่าง) หรือค่าเริ่มต้นตามภาษา · {shop} = ชื่อร้าน */
export function checkoutText(c: CheckoutConfig, key: CheckoutTextKey, lang: "th" | "en", shop = ""): string {
  const own = (c[key] as string | undefined)?.trim();
  return (own || CHECKOUT_TEXT[key][lang]).replace(/\{shop\}/g, shop).trim();
}

/** แถบความมั่นใจ → รายการข้อ (คั่นด้วย · หรือขึ้นบรรทัดใหม่) */
export const trustItems = (text: string): string[] =>
  text
    .split(/[·\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
