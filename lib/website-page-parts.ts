/**
 * 🎨 ทะเบียน "ชิ้นส่วน" ของแต่ละหน้า สำหรับชุดปรับหน้าตาละเอียด (ของกลาง · 2026-10-28)
 *
 * แต่ละหน้าในแท็บดีไซน์ประกาศรายการชิ้นส่วนที่นี่ → ตัวปรับกลาง components/website-part-style-editor สร้างแผงให้เอง
 * เว็บร้านติด data-part="<key>" ที่ชิ้นนั้น (คลิกเลือกในพรีวิวได้ · ตัววาด CSS src/lib/part-style-css.ts)
 * ค่าเก็บในธีม เช่น theme.page.account.parts (ชนิด/ตัวตรวจ PartStyles อยู่ lib/website-site-design — มิเรอร์กับเว็บร้าน)
 * เพิ่มหน้าใหม่ = เพิ่มรายการชิ้นส่วน + ติด data-part ฝั่งเว็บร้าน (ไม่ต้องทำแผงตั้งค่าเอง)
 */
import type { PartStyleValue } from "@/lib/website-site-design";

/** กลุ่มตัวปรับ: ตัวอักษร · กล่อง · ตำแหน่ง · รูปโปรไฟล์ · ไอคอน · ตอนถูกเลือก · ซ่อน */
export type PartGroup = "text" | "box" | "layout" | "avatar" | "icon" | "active" | "hide";
export interface PartDef {
  key: string;
  label: string;
  hint?: string;
  groups: PartGroup[];
}

/** ช่องในแต่ละกลุ่ม (ลำดับ = ลำดับในแผง) */
export const PART_GROUP_FIELDS: Record<PartGroup, (keyof PartStyleValue)[]> = {
  text: ["font", "size", "weight", "color", "ls", "lh", "align", "upper", "italic"],
  box: ["bg", "radius", "padY", "padX", "border", "borderColor", "shadow"],
  layout: ["align", "gap", "mt", "maxW"],
  avatar: ["dim", "radius", "bg", "color", "size", "border", "borderColor"],
  icon: ["iconSize", "iconColor"],
  active: ["activeBg", "activeColor", "activeBorder"],
  hide: ["hidden"],
};
export const PART_GROUP_LABEL: Record<PartGroup, string> = {
  text: "🔤 ตัวอักษร",
  box: "▭ กล่อง",
  layout: "📐 ตำแหน่ง",
  avatar: "🙂 รูปโปรไฟล์",
  icon: "🔣 ไอคอน",
  active: "✅ ตอนถูกเลือก",
  hide: "👁 การแสดง",
};

/** 👤 หน้าบัญชีของฉัน (เว็บร้าน components/account/AccountClient) */
export const ACCOUNT_PARTS: PartDef[] = [
  { key: "acc.page", label: "ทั้งหน้า", hint: "ความกว้าง · ระยะ · พื้น", groups: ["layout", "box"] },
  { key: "acc.notice", label: "แถบประกาศ", groups: ["text", "box"] },
  { key: "acc.header", label: "ส่วนหัว", groups: ["layout", "box"] },
  { key: "acc.avatar", label: "รูปโปรไฟล์", groups: ["avatar"] },
  { key: "acc.greet", label: "ข้อความทักทาย", hint: "ตัวเล็กเหนือชื่อ", groups: ["text", "hide"] },
  { key: "acc.name", label: "ชื่อสมาชิก", groups: ["text"] },
  { key: "acc.sub", label: "อีเมล / ข้อความรอง", groups: ["text", "hide"] },
  { key: "acc.badge", label: "ป้ายใต้ชื่อ", hint: "ระดับ · แต้ม · สมาชิกตั้งแต่", groups: ["text", "box"] },
  { key: "acc.mcard", label: "บัตรสมาชิก", hint: "แบบหัว = บัตรสมาชิก", groups: ["text", "box"] },
  { key: "acc.nav", label: "แถบเมนู", groups: ["layout", "box", "icon"] },
  { key: "acc.tab", label: "ปุ่มเมนู", groups: ["text", "box", "active", "icon"] },
  { key: "acc.card", label: "กล่องเนื้อหา", groups: ["box", "layout"] },
  { key: "acc.title", label: "หัวข้อในกล่อง", groups: ["text"] },
  { key: "acc.empty", label: "ข้อความตอนว่าง", groups: ["text"] },
  { key: "acc.btn", label: "ปุ่มหลัก", hint: "ปุ่มทึบ", groups: ["text", "box"] },
  { key: "acc.btn2", label: "ปุ่มรอง", hint: "ปุ่มขอบ", groups: ["text", "box"] },
  { key: "acc.input", label: "ช่องกรอก", groups: ["text", "box"] },
  { key: "acc.frame", label: "กรอบหน้าต่างแอป", hint: "เมนูแบบหน้าต่างแอป", groups: ["box", "layout"] },
  { key: "acc.sidebar", label: "แถบเมนูข้าง", hint: "หน้าต่างแอป", groups: ["box", "layout"] },
  { key: "acc.stitle", label: "หัวเมนูข้าง", hint: "หน้าต่างแอป", groups: ["text", "hide"] },
  { key: "acc.ptitle", label: "หัวข้อหน้า", hint: "ชื่อแท็บที่เปิดอยู่ · หน้าต่างแอป", groups: ["text", "hide"] },
  { key: "acc.row", label: "แถวข้อมูลโปรไฟล์", hint: "โปรไฟล์แบบแถว", groups: ["text", "box"] },
  { key: "acc.aside", label: "กล่องข้างขวา", hint: "คู่มือ / โปรสมาชิก", groups: ["text", "box", "icon"] },
  { key: "acc.timeline", label: "ไทม์ไลน์สถานะออเดอร์", hint: "✨ ไทม์ไลน์", groups: ["text", "layout", "box"] },
  { key: "acc.bday", label: "แบนเนอร์คูปองวันเกิด", hint: "🎂 เดือนเกิด", groups: ["text", "box"] },
];

/** ช่วงแถบเลื่อนในแผง (แคบกว่าที่ระบบรับ — พิมพ์ตัวเลขเกินได้ถึงขอบ PART_RANGES) + ค่าโชว์ตอนยังไม่ตั้ง */
export const PART_SLIDER: Partial<Record<keyof PartStyleValue, { min: number; max: number; step?: number; unit: string; label: string; hint?: number }>> = {
  size: { min: 10, max: 64, unit: "px", label: "ขนาด", hint: 16 },
  weight: { min: 300, max: 800, step: 100, unit: "", label: "ความหนา", hint: 400 },
  ls: { min: -5, max: 40, unit: "", label: "ระยะตัวอักษร", hint: 0 },
  lh: { min: 100, max: 200, step: 5, unit: "", label: "ระยะบรรทัด", hint: 150 },
  radius: { min: 0, max: 48, unit: "px", label: "มุมโค้ง", hint: 12 },
  padY: { min: 0, max: 64, unit: "px", label: "ระยะใน บน-ล่าง", hint: 16 },
  padX: { min: 0, max: 64, unit: "px", label: "ระยะใน ซ้าย-ขวา", hint: 16 },
  border: { min: 0, max: 4, unit: "px", label: "เส้นขอบ", hint: 1 },
  shadow: { min: 0, max: 3, unit: "", label: "เงา", hint: 0 },
  gap: { min: 0, max: 64, unit: "px", label: "ระยะห่างข้างใน", hint: 16 },
  mt: { min: -40, max: 120, unit: "px", label: "ระยะด้านบน", hint: 0 },
  maxW: { min: 0, max: 1600, step: 20, unit: "px", label: "กว้างสุด (0 = เต็ม)", hint: 0 },
  dim: { min: 32, max: 160, unit: "px", label: "ขนาดรูป", hint: 56 },
  iconSize: { min: 10, max: 40, unit: "px", label: "ขนาดไอคอน", hint: 16 },
};

export const PART_COLOR_LABEL: Partial<Record<keyof PartStyleValue, string>> = {
  color: "สีตัวอักษร",
  bg: "สีพื้น",
  borderColor: "สีเส้นขอบ",
  iconColor: "สีไอคอน",
  activeBg: "สีพื้น (ที่เลือก)",
  activeColor: "สีตัวอักษร (ที่เลือก)",
  activeBorder: "สีขอบ (ที่เลือก)",
};

/** 👤 หน้าเข้าสู่ระบบ + ป๊อปสมัคร + ปุ่มสมัครบนหัวเว็บ (เว็บร้าน MemberAuthHost / MemberAuthPanel / LoginShell / Navbar) */
export const LOGIN_PARTS: PartDef[] = [
  { key: "login.hbtn", label: "ปุ่มสมัครบนหัวเว็บ", hint: "ปุ่มเด่นข้างไอคอน 👤", groups: ["text", "box"] },
  { key: "login.modal", label: "กรอบป๊อป", hint: "มือถือ = แผ่นเลื่อนจากล่าง", groups: ["box", "layout"] },
  { key: "login.mtitle", label: "หัวป๊อป", groups: ["text", "hide"] },
  { key: "login.tabs", label: "แถบแท็บ", hint: "สมัคร / เข้าสู่ระบบ", groups: ["box"] },
  { key: "login.tab", label: "ปุ่มแท็บ", groups: ["text", "box", "active"] },
  { key: "login.perks", label: "กล่องข้อดีสมาชิก", groups: ["text", "box"] },
  { key: "login.consent", label: "ข้อความยินยอม", hint: "ช่องติ๊ก PDPA", groups: ["text"] },
  { key: "login.provider", label: "ปุ่ม Google/LINE/Facebook", groups: ["text", "box"] },
  { key: "login.note", label: "ข้อความเล็ก", hint: "ใต้ปุ่ม / ต้อนรับกลับ", groups: ["text", "hide"] },
  { key: "login.guest", label: "ลิงก์สั่งโดยไม่สมัคร", groups: ["text"] },
  { key: "login.card", label: "กรอบหน้าเข้าสู่ระบบ", hint: "หน้า /account/login", groups: ["box", "layout"] },
  { key: "login.heading", label: "หัวข้อหน้าเข้าสู่ระบบ", groups: ["text"] },
  { key: "login.intro", label: "ข้อความต้อนรับ", groups: ["text", "hide"] },
];

/** 🔍 หน้าไม่พบ 404 (เว็บร้าน components/layout/NotFoundView) */
export const NF_PARTS: PartDef[] = [
  { key: "nf.big", label: "ตัวเลข 404 / รูป", groups: ["text", "layout", "hide"] },
  { key: "nf.title", label: "หัวข้อ", groups: ["text"] },
  { key: "nf.text", label: "ข้อความ", groups: ["text", "hide"] },
  { key: "nf.search", label: "ช่องค้นหา", groups: ["text", "box"] },
  { key: "nf.btn", label: "ปุ่มหลัก", groups: ["text", "box"] },
  { key: "nf.btn2", label: "ปุ่มรอง", groups: ["text", "box", "hide"] },
  { key: "nf.reco", label: "หัวข้อสินค้าแนะนำ", groups: ["text", "layout"] },
];

/** 🎉 หน้าขอบคุณหลังสั่งซื้อ (เว็บร้าน CheckoutClient + components/checkout/ThanksExtras) */
export const THANKS_PARTS: PartDef[] = [
  { key: "th.card", label: "กรอบหน้า", groups: ["box", "layout"] },
  { key: "th.title", label: "หัวข้อขอบคุณ", groups: ["text"] },
  { key: "th.text", label: "ข้อความใต้หัวข้อ", groups: ["text", "hide"] },
  { key: "th.no", label: "กล่องเลขที่คำสั่งซื้อ", groups: ["text", "box"] },
  { key: "th.coupon", label: "กล่องคูปองครั้งหน้า", groups: ["text", "box"] },
  { key: "th.code", label: "โค้ดคูปอง", groups: ["text", "box"] },
  { key: "th.follow", label: "ข้อความชวนติดตาม", groups: ["text", "hide"] },
  { key: "th.social", label: "ปุ่มโซเชียล", groups: ["text", "box"] },
  { key: "th.pay", label: "กล่องวิธีชำระเงิน", groups: ["box"] },
  { key: "th.reco", label: "หัวข้อสินค้าแนะนำ", groups: ["text", "layout"] },
];

/** 🎁 ป๊อปอัปแจกโค้ด (เว็บร้าน components/layout/PromoPopup) */
export const POPUP_PARTS: PartDef[] = [
  { key: "pp.box", label: "กรอบป๊อป", groups: ["box", "layout"] },
  { key: "pp.title", label: "หัวข้อ", groups: ["text"] },
  { key: "pp.text", label: "ข้อความ", groups: ["text", "hide"] },
  { key: "pp.input", label: "ช่องกรอกอีเมล", groups: ["text", "box"] },
  { key: "pp.btn", label: "ปุ่ม", groups: ["text", "box"] },
  { key: "pp.code", label: "โค้ดที่ได้", groups: ["text", "box"] },
];

/** 🔍 ช่องค้นหาเต็มจอ (เว็บร้าน components/layout/SearchOverlay · ค่าเก็บที่ theme.page.areaParts.search) */
export const SEARCH_PARTS: PartDef[] = [
  { key: "sr.box", label: "กรอบช่องค้นหา", hint: "แผงเต็มจอ", groups: ["box", "layout"] },
  { key: "sr.bar", label: "แถบพิมพ์ค้นหา", groups: ["box", "layout"] },
  { key: "sr.input", label: "ช่องพิมพ์", groups: ["text"] },
  { key: "sr.head", label: "หัวข้อย่อย", hint: "หมวดสินค้า · คำยอดนิยม · สินค้า", groups: ["text"] },
  { key: "sr.cat", label: "ลิงก์หมวด", groups: ["text"] },
  { key: "sr.chip", label: "ปุ่มคำยอดนิยม", groups: ["text", "box"] },
  { key: "sr.item", label: "การ์ดสินค้า", groups: ["box", "layout"] },
  { key: "sr.name", label: "ชื่อสินค้า", groups: ["text"] },
  { key: "sr.price", label: "ราคา", groups: ["text"] },
  { key: "sr.empty", label: "ข้อความค้นหาไม่เจอ", groups: ["text", "box"] },
  { key: "sr.all", label: "ปุ่มดูทั้งหมด", groups: ["text", "box"] },
];

/** 🛒 ตะกร้า — ลิ้นชัก + หน้า /cart (เว็บร้าน CartDrawer · CartPageClient · components/cart/* · theme.page.areaParts.cart) */
export const CART_PARTS: PartDef[] = [
  { key: "cart.panel", label: "กรอบลิ้นชัก/หน้าต่างตะกร้า", groups: ["box"] },
  { key: "cart.head", label: "หัวข้อ \"ตะกร้า\"", groups: ["text"] },
  { key: "cart.box", label: "กล่องในหน้าตะกร้า", hint: "หน้า /cart", groups: ["box", "layout"] },
  { key: "cart.line", label: "แถวสินค้า", groups: ["box", "layout"] },
  { key: "cart.img", label: "รูปสินค้า", groups: ["box"] },
  { key: "cart.name", label: "ชื่อสินค้า", groups: ["text"] },
  { key: "cart.price", label: "ราคาแถว", groups: ["text"] },
  { key: "cart.qty", label: "ปุ่มเพิ่ม/ลดจำนวน", groups: ["text", "box"] },
  { key: "cart.ship", label: "แถบส่งฟรี", groups: ["text", "box"] },
  { key: "cart.sum", label: "กล่องสรุปยอด", groups: ["box", "layout"] },
  { key: "cart.sum-head", label: "หัวข้อสรุปคำสั่งซื้อ", hint: "หน้า /cart แบบ 2 ฝั่ง", groups: ["text"] },
  { key: "cart.total-label", label: "คำว่า ยอดรวม", groups: ["text"] },
  { key: "cart.total", label: "ตัวเลขยอดรวม", groups: ["text"] },
  { key: "cart.btn", label: "ปุ่มสั่งซื้อ", groups: ["text", "box"] },
  { key: "cart.btn2", label: "ปุ่มรอง", hint: "เลือกซื้อต่อ · สมาชิก · ตะกร้าเต็มหน้า", groups: ["text", "box"] },
  { key: "cart.trust", label: "แถบความมั่นใจ", groups: ["text", "layout"] },
  { key: "cart.reco-head", label: "หัวข้อสินค้าแนะนำ", groups: ["text"] },
  { key: "cart.empty-icon", label: "ไอคอนตะกร้าว่าง", groups: ["text", "hide"] },
  { key: "cart.empty", label: "ข้อความตะกร้าว่าง", groups: ["text"] },
];

/** 💳 หน้าชำระเงิน (เว็บร้าน components/checkout/CheckoutClient · theme.page.areaParts.checkout) */
export const CHECKOUT_PARTS: PartDef[] = [
  { key: "co.box", label: "กล่องแต่ละส่วน", hint: "ผู้รับ · ที่อยู่ · วิธีชำระ", groups: ["box", "layout"] },
  { key: "co.title", label: "หัวข้อแต่ละส่วน", groups: ["text"] },
  { key: "co.label", label: "ป้ายช่องกรอก", groups: ["text"] },
  { key: "co.input", label: "ช่องกรอก", groups: ["text", "box"] },
  { key: "co.pay", label: "ตัวเลือกวิธีชำระ", groups: ["text", "box", "active"] },
  { key: "co.sum", label: "กล่องสรุปคำสั่งซื้อ", groups: ["box", "layout"] },
  { key: "co.total", label: "แถวยอดรวม", groups: ["text"] },
  { key: "co.btn", label: "ปุ่มยืนยันสั่งซื้อ", groups: ["text", "box"] },
];

/** 🧭 หัวเว็บ + แถบประกาศ (เว็บร้าน Navbar · AnnouncementBar · theme.page.areaParts.header) */
export const HEADER_PARTS: PartDef[] = [
  { key: "hd.announce", label: "แถบประกาศ", hint: "แถบบนสุด", groups: ["box", "layout", "hide"] },
  { key: "hd.announce-text", label: "ข้อความแถบประกาศ", groups: ["text"] },
  { key: "hd.bar", label: "แถบหัวเว็บ", hint: "ตั้งสีพื้น = ทับตอนลอยบนรูปปกด้วย", groups: ["box"] },
  { key: "hd.row", label: "แถวในหัวเว็บ", groups: ["layout", "box"] },
  { key: "hd.logo", label: "โลโก้", groups: ["text", "layout"] },
  { key: "hd.link", label: "ลิงก์เมนู", groups: ["text", "box", "active"] },
  { key: "hd.dd", label: "กล่องเมนูย่อย", groups: ["box"] },
  { key: "hd.dd-link", label: "ลิงก์เมนูย่อย", groups: ["text", "box"] },
  { key: "hd.icon", label: "ปุ่มไอคอน", hint: "ค้นหา · ตะกร้า · บัญชี", groups: ["box", "icon"] },
  { key: "hd.word", label: "คำข้างไอคอน", groups: ["text"] },
  { key: "hd.badge", label: "ป้ายจำนวนในตะกร้า", groups: ["text", "box"] },
  { key: "hd.btn", label: "ปุ่มบนหัวเว็บ", groups: ["text", "box"] },
  { key: "hd.drawer", label: "เมนูมือถือ (ลิ้นชัก)", groups: ["box"] },
];

/** 🦶 ท้ายเว็บ (เว็บร้าน components/layout/Footer · theme.page.areaParts.footer) */
export const FOOTER_PARTS: PartDef[] = [
  { key: "ft.box", label: "ท้ายเว็บทั้งก้อน", groups: ["box"] },
  { key: "ft.logo", label: "โลโก้", groups: ["layout", "hide"] },
  { key: "ft.text", label: "ข้อความเกี่ยวกับร้าน", groups: ["text"] },
  { key: "ft.head", label: "หัวคอลัมน์", groups: ["text"] },
  { key: "ft.link", label: "ลิงก์", groups: ["text"] },
  { key: "ft.social", label: "ปุ่มโซเชียล", groups: ["text", "box"] },
  { key: "ft.bottom", label: "แถวล่างสุด", groups: ["text", "box", "layout"] },
  { key: "ft.copy", label: "ข้อความลิขสิทธิ์", groups: ["text", "hide"] },
];

/** 🛍 หน้าสินค้า — ทุกแบบหน้า (เว็บร้าน ProductShowcase · Style หรู · ProductDetailClient แบบคลาสสิก · theme.page.areaParts.product) */
export const PRODUCT_PARTS: PartDef[] = [
  { key: "pd.crumb", label: "ทางเดิน (หน้าแรก / หมวด)", groups: ["text", "layout", "hide"] },
  { key: "pd.title", label: "ชื่อสินค้า", groups: ["text", "layout"] },
  { key: "pd.sub", label: "ข้อความรองใต้ชื่อ", groups: ["text", "hide"] },
  { key: "pd.price", label: "ราคา", groups: ["text"] },
  { key: "pd.compare", label: "ราคาก่อนลด", groups: ["text", "hide"] },
  { key: "pd.desc", label: "คำอธิบายสั้น", groups: ["text", "box"] },
  { key: "pd.stock", label: "สถานะสต๊อก", groups: ["text", "box", "hide"] },
  { key: "pd.label", label: "ป้ายหัวตัวเลือก", hint: "สี · จำนวน", groups: ["text"] },
  { key: "pd.opt", label: "ปุ่มตัวเลือก", hint: "สี/แบบ · รูป · จุดสี", groups: ["text", "box", "active"] },
  { key: "pd.qty", label: "ปุ่มเพิ่ม/ลดจำนวน", groups: ["text", "box"] },
  { key: "pd.add", label: "ปุ่มใส่ตะกร้า", groups: ["text", "box"] },
  { key: "pd.tab", label: "แท็บรายละเอียด", hint: "แบบแท็บ", groups: ["text", "box", "active"] },
  { key: "pd.h3", label: "หัวข้อรายละเอียด", hint: "แบบเรียงลงมา", groups: ["text"] },
  { key: "pd.h2", label: "หัวข้อส่วน", hint: "สินค้าที่เกี่ยวข้อง ฯลฯ", groups: ["text", "layout"] },
  { key: "pd.bar", label: "แถบลอย (คอม)", groups: ["box"] },
  { key: "pd.bar-btn", label: "ปุ่มบนแถบลอย", groups: ["text", "box"] },
  { key: "pd.mbar", label: "แถบใส่ตะกร้าล่างจอ (มือถือ)", groups: ["box"] },
];

/** 🃏 การ์ดสินค้า — ทุกที่ที่มีการ์ด: หน้ารวม · หมวด · หน้าแรก · สินค้าที่เกี่ยวข้อง (เว็บร้าน components/shop/ProductCard · theme.page.areaParts.card) */
export const CARD_PARTS: PartDef[] = [
  { key: "pc.card", label: "กรอบการ์ด", groups: ["box"] },
  { key: "pc.media", label: "กรอบรูป", groups: ["box"] },
  { key: "pc.info", label: "ส่วนข้อความใต้รูป", groups: ["layout", "box"] },
  { key: "pc.cat", label: "ชื่อหมวด", groups: ["text", "hide"] },
  { key: "pc.stock", label: "สถานะสต๊อก", groups: ["text", "hide"] },
  { key: "pc.name", label: "ชื่อสินค้า", groups: ["text"] },
  { key: "pc.price", label: "ราคา", groups: ["text"] },
  { key: "pc.compare", label: "ราคาก่อนลด", groups: ["text", "hide"] },
  { key: "pc.badge", label: "ป้ายบนรูป", hint: "ใหม่ · ลดราคา", groups: ["text", "box"] },
  { key: "pc.add", label: "ปุ่มใส่ตะกร้าบนรูป", groups: ["text", "box"] },
  { key: "pc.swatches", label: "แถวจุดสี", groups: ["layout", "hide"] },
];

/** 🍪 แถบคุกกี้ (เว็บร้าน components/layout/Tracking) */
export const COOKIE_PARTS: PartDef[] = [
  { key: "ck.box", label: "กรอบแถบคุกกี้", groups: ["box", "layout"] },
  { key: "ck.title", label: "หัวข้อ", groups: ["text", "hide"] },
  { key: "ck.text", label: "ข้อความ", groups: ["text"] },
  { key: "ck.btn", label: "ปุ่มยอมรับ", groups: ["text", "box"] },
  { key: "ck.btn2", label: "ปุ่มรอง", hint: "ใช้เฉพาะที่จำเป็น", groups: ["text", "box"] },
];
