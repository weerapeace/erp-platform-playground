/**
 * 🧭 โครงเมนูหน้าดีไซน์เว็บร้าน (แท็บ 🎨 ดีไซน์ ใน /website/<ร้าน>) — หมวด · หน้า · การ์ด · คำค้น
 *
 * ใช้ร่วม: เมนูซ้ายจัดหมวด (SettingsNavLayout) · หน้าภาพรวม · จุดส้ม "แก้แล้วยังไม่บันทึก" · ค้นหาการตั้งค่า
 *   - เพิ่มการ์ดใหม่ในหน้าดีไซน์ → ใส่ชื่อการ์ด (ตรงกับหัวการ์ดบนจอ) + คำค้น ใน cards ของหน้านั้น
 *   - เพิ่มค่าใหม่ในธีม → ใส่ path ใน paths ของหน้าที่แก้ค่านั้น (เทสต์ตรวจว่าทุกค่าในธีมมีหน้าอยู่)
 * ไม่มีผลกับค่าที่บันทึก/หน้าเว็บร้าน — เป็นแค่สารบัญของหน้าตั้งค่า
 */

export type DesignPageKey =
  | "overview"
  | "colors" | "fonts" | "shape" | "motion" | "mobile"
  | "logo" | "header" | "menu" | "footer"
  | "card" | "listing" | "product" | "related"
  | "cart" | "checkout"
  | "pages" | "campaign" | "history";

export interface DesignCardDef {
  /** หัวการ์ดบนจอ (ไม่ต้องมีอีโมจิ) — ใช้หาการ์ดตอนกดผลค้นหา */
  title: string;
  /** คำค้นเพิ่ม: ชื่อช่องในการ์ด / คำอังกฤษ / คำที่คนน่าจะพิมพ์ */
  keywords?: string;
  /**
   * 👷 พนักงานที่แก้ได้บางหัวข้อ (lib/website-access · designAccess):
   *   advanced = ซ่อนในแบบง่าย (ไม่มีสิทธิ์ "โชว์การตั้งค่าละเอียด")
   *   full     = ซ่อนเสมอ — ใช้ API ที่ต้องแก้ได้ทุกหัวข้อ หรือเปลี่ยนหลายหัวข้อพร้อมกัน
   */
  level?: "advanced" | "full";
}

export interface DesignPageDef {
  label: string;
  /** คำอธิบายสั้นใต้ชื่อในเมนูซ้าย */
  desc: string;
  /** ค่าในธีมที่หน้านี้แก้ (ใช้ขึ้นจุดส้ม) — "page.transition" = theme.page.transition */
  paths: string[];
  cards: DesignCardDef[];
  keywords?: string;
}

export interface DesignGroupDef {
  key: string;
  label: string;
  /** ชื่อความหมายไอคอนกลาง (<Icon name>) */
  icon: string;
  pages: Exclude<DesignPageKey, "overview">[];
}

export const DESIGN_GROUPS: DesignGroupDef[] = [
  { key: "site", label: "ทั้งเว็บ", icon: "design", pages: ["colors", "fonts", "shape", "motion", "mobile"] },
  { key: "frame", label: "หัว-ท้ายเว็บ", icon: "navigate", pages: ["logo", "header", "menu", "footer"] },
  { key: "product", label: "สินค้า", icon: "package", pages: ["card", "listing", "product", "related"] },
  { key: "sell", label: "ซื้อขาย", icon: "cart", pages: ["cart", "checkout"] },
  { key: "more", label: "หน้าอื่น ๆ", icon: "documents", pages: ["pages", "campaign", "history"] },
];

const LOGO_PATHS = ["logo.mark", "logo.text", "logo.mode", "logo.imageKey", "logo.imageDarkKey", "logo.faviconKey", "logo.height"];

export const DESIGN_PAGES: Record<Exclude<DesignPageKey, "overview">, DesignPageDef> = {
  colors: {
    label: "สีและธีม",
    desc: "ธีมสำเร็จรูป · สีหลัก · อ่านง่ายไหม",
    paths: ["colors"],
    keywords: "สี color theme preset palette",
    cards: [
      { title: "ธีมที่บันทึกไว้", level: "full", keywords: "saved theme บันทึกธีม ข้ามร้าน" },
      { title: "ธีมทั้งชุด (กดครั้งเดียว)", level: "full", keywords: "preset ธีมสำเร็จรูป" },
      { title: "ชุดสีสำเร็จรูป", keywords: "palette ชุดสี" },
      { title: "สี", keywords: "สีหลักแบรนด์ สีหลักเข้ม สีตัวอักษร สีพื้นหลังเว็บ สีพื้นการ์ด brand" },
      { title: "ปรับสีละเอียด", level: "advanced", keywords: "สีลิงก์ สีราคา ราคาลด พร้อมส่ง เหลือน้อย เส้นขอบ ตัวอักษรบนปุ่ม สีอ่อน" },
      { title: "ตรวจความอ่านง่าย (WCAG)", keywords: "contrast อ่านยาก ความคมชัด" },
    ],
  },
  fonts: {
    label: "ตัวอักษร",
    desc: "ฟอนต์หัวข้อ/เนื้อหา · ขนาดรายบทบาท",
    paths: ["fonts", "typography"],
    keywords: "font ฟอนต์ typography",
    cards: [
      { title: "ฟอนต์หลัก", keywords: "ฟอนต์หัวข้อ ฟอนต์เนื้อหา ฟอนต์อังกฤษ" },
      { title: "ปรับละเอียดรายบทบาท", level: "advanced", keywords: "ขนาดตัวอักษร น้ำหนัก ตัวพิมพ์ใหญ่ ระยะห่างตัวอักษร หัวข้อใหญ่ ราคา เมนู" },
    ],
  },
  shape: {
    label: "รูปทรงและปุ่ม",
    desc: "ความมน · ปุ่ม · เส้นขอบ · เงา · พื้นหลัง",
    paths: ["radius", "shape", "page.density", "page.width", "page.texture", "page.textureStrength", "page.mobileScale", "page.bigTap", "page.priceFormat"],
    keywords: "radius shape button shadow border",
    cards: [
      { title: "พื้นที่ · พื้นหลัง · มือถือ (ทั้งเว็บ)", keywords: "ความกว้าง ความแน่น ลายพื้นหลัง texture รูปแบบราคา ปุ่มใหญ่บนมือถือ" },
      { title: "ปุ่ม · ลิงก์ · ช่องกรอก (ทั้งเว็บ)", keywords: "button link input ช่องกรอก ชี้เมาส์" },
      { title: "ความมนของขอบ (ค่ารวมทั้งเว็บ)", keywords: "มน เหลี่ยม radius" },
      { title: "ปุ่ม · เส้นขอบ · เงา", keywords: "ทรงปุ่ม ขนาดปุ่ม เงา shadow เส้นขอบ" },
    ],
  },
  motion: {
    label: "ลูกเล่นและการเคลื่อนไหว",
    desc: "เปลี่ยนหน้า · Section โผล่ · เลื่อนนุ่ม",
    paths: ["page.transition", "page.smoothScroll", "page.sectionMotion", "page.sectionSpeed", "page.sectionStagger", "page.intro", "page.cursor", "page.readProgress", "page.backToTop", "page.backToTopSide"],
    keywords: "animation motion แอนิเมชัน",
    cards: [
      { title: "การเคลื่อนไหวทั้งเว็บ", keywords: "เปลี่ยนหน้า จางเปลี่ยนหน้า ม่าน โลโก้วาบ smooth scroll เลื่อนจอนุ่ม" },
      { title: "ลูกเล่นทั้งเว็บ", keywords: "section โผล่ หน้าโหลดแรก เคอร์เซอร์ แถบเลื่อนอ่าน ปุ่มกลับขึ้นบน" },
    ],
  },
  mobile: {
    label: "มือถือและช่วยขาย",
    desc: "แถบเมนูล่าง · ปุ่มแชท · ค้นหา · คุกกี้",
    paths: ["page.mobileNav", "page.chat", "page.searchEmpty", "page.cookie", "page.areaParts.search"],
    keywords: "mobile มือถือ chat line",
    cards: [{ title: "มือถือและช่วยขาย", keywords: "แถบเมนูล่าง ปุ่มแชท LINE Messenger ค้นหาตอนยังไม่พิมพ์ แถบคุกกี้ cookie" }],
  },
  logo: {
    label: "โลโก้",
    desc: "แบบโลโก้ · รูปโลโก้ · Favicon",
    paths: LOGO_PATHS,
    keywords: "logo โลโก้ แบรนด์",
    cards: [
      { title: "รูปแบบโลโก้", keywords: "ความสูงโลโก้ ขนาดโลโก้ อักษรในกล่อง ชื่อร้าน" },
      { title: "รูปโลโก้ & ไอคอน", keywords: "อัปโหลดโลโก้ โลโก้พื้นเข้ม favicon ไอคอนแท็บเบราว์เซอร์" },
    ],
  },
  header: {
    label: "หัวเว็บ (Header)",
    desc: "สี · ความสูง · ตำแหน่งชิ้นส่วน",
    paths: ["header", "page.areaParts.header"],
    keywords: "header หัวเว็บ แถบบน",
    cards: [
      { title: "แถบหัวเว็บ — ขนาด · สี · ตำแหน่งเมนู", keywords: "ความสูง สีพื้นหลัง ตำแหน่งเมนู ตรึงด้านบน ไอคอนตะกร้า เส้นคั่น สีตัวอักษร" },
      { title: "ตำแหน่งชิ้นส่วน (ซ้าย · กลาง · ขวา)", keywords: "โซน โลโก้ เมนู ค้นหา ตะกร้า โซเชียล บัญชีสมาชิก" },
      { title: "ปุ่มบนหัวเว็บ · เมนูมือถือ", keywords: "ปุ่ม ลิงก์ เมนูมือถือ ลิ้นชัก ซ่อนตอนเลื่อน" },
      { title: "หัวเว็บทับรูปใหญ่ (โปร่งใสตอนอยู่บนสุด)", keywords: "โปร่งใส ทับรูป hero" },
      { title: "ไอคอนบนหัวเว็บ", keywords: "ไอคอน เส้น ทึบ" },
      { title: "ปรับละเอียดทีละชิ้น", level: "advanced", keywords: "แถบประกาศ ลิงก์เมนู ป้ายตะกร้า" },
    ],
  },
  menu: {
    label: "เมนู",
    desc: "รายการเมนู · เมนูย่อย/แผงใหญ่",
    paths: ["menu"],
    keywords: "menu nav เมนู",
    cards: [{ title: "เมนูด้านบน", keywords: "ลิงก์ไป ป้ายเล็ก แสดงช่วง เมนูย่อย แผงเมนูใหญ่ mega dropdown แบบ A แบบ B แบบ C แม่แบบ ชี้เมาส์ หน่วงเวลา เมนูมือถือ" }],
  },
  footer: {
    label: "ท้ายเว็บ (Footer)",
    desc: "สี · คอลัมน์ · แถวล่างสุด",
    paths: ["footer", "page.areaParts.footer"],
    keywords: "footer ท้ายเว็บ",
    cards: [
      { title: "ท้ายเว็บ (Footer) — สี", keywords: "สีพื้น ฟอนต์ หัวคอลัมน์ ลิงก์" },
      { title: "โลโก้ท้ายเว็บ" },
      { title: "ระยะห่าง", keywords: "ระยะบนล่าง ช่องไฟ" },
      { title: "คอลัมน์", keywords: "เกี่ยวกับเรา ศูนย์ช่วยเหลือ ติดต่อ โซเชียล" },
      { title: "แถวล่างสุด", keywords: "ลิขสิทธิ์ copyright ไอคอนชำระเงิน" },
      { title: "บนมือถือ", keywords: "พับคอลัมน์ กึ่งกลาง" },
    ],
  },
  card: {
    label: "การ์ดสินค้า",
    desc: "ชุดสำเร็จรูป · กรอบรูป · ป้าย · จุดสี",
    paths: ["card", "logo.placeholder", "page.areaParts.card"],
    keywords: "card การ์ด product card",
    cards: [
      { title: "ตัวอย่างการ์ด (ดูผลทันที)" },
      { title: "หน้าตาการ์ด — ชุดสำเร็จรูป · รูปแบบ · ช่องหลัก", keywords: "สัดส่วนรูป ชี้เมาส์ สลับรูป ชื่อสินค้ากี่บรรทัด ราคาเต็ม ปุ่มเพิ่มลงตะกร้า คอลัมน์ ช่องไฟ ความมน" },
      { title: "จุดสีบนการ์ด", keywords: "swatch สี" },
      { title: "ป้าย · รูปบนการ์ด · ชื่อ/ราคา · ดูด่วน", keywords: "ป้ายลดราคา ป้ายสินค้าใหม่ ขายดี รูปในกรอบ quick view" },
      { title: "ระหว่างรอรูปโหลด", keywords: "placeholder" },
      { title: "ปรับละเอียดทีละชิ้น", level: "advanced" },
    ],
  },
  listing: {
    label: "หน้ารายการสินค้า",
    desc: "ต่อแถว · แบ่งหน้า · ตัวกรอง · รูปแทรก",
    paths: ["listing"],
    keywords: "listing shop หน้าร้าน",
    cards: [{ title: "หน้ารายการสินค้า", keywords: "หัวหน้า ต่อแถว แบ่งหน้า การเรียง ตัวกรอง รูปแทรก ทีละสี sku" }],
  },
  product: {
    label: "หน้าสินค้า",
    desc: "Style · ลำดับส่วน · รูป · รายละเอียด",
    paths: ["product", "page.areaParts.product"],
    keywords: "product page pdp หน้าสินค้า",
    cards: [
      { title: "หน้าสินค้า — เลือก Style", keywords: "ลำดับส่วนประกอบ รูปสินค้า พื้นหลังรูป หัวข้อรายละเอียด แบนเนอร์ ขนาดตัวอักษร มือถือ ราคา ตะกร้า วัสดุ หรู luxe introduction คำแนะนำสินค้า" },
      { title: "📜 นโยบายจัดส่ง & คืนสินค้า", keywords: "policy shipping returns นโยบาย คืนสินค้า เปลี่ยนสินค้า ลิงก์" },
      { title: "♡ รายการโปรด", keywords: "wishlist หัวใจ ถูกใจ favorite" },
    ],
  },
  related: {
    label: "แนะนำสินค้า",
    desc: "คุณอาจชอบ · ดูล่าสุด",
    paths: ["product.parts.related", "product.parts.recent"],
    keywords: "related recommend",
    cards: [
      { title: "สินค้าที่เกี่ยวข้อง (คุณอาจชอบ)", keywords: "กฎ หมวดเดียวกัน ขายดี" },
      { title: "สินค้าที่ดูล่าสุด", keywords: "recent viewed" },
    ],
  },
  cart: {
    label: "ตะกร้า",
    desc: "หน้าตา · ส่งฟรี · ชวนซื้อเพิ่ม",
    paths: ["cart", "page.areaParts.cart"],
    keywords: "cart ตะกร้า bag",
    cards: [
      { title: "หน้าตาตะกร้า", keywords: "ลิ้นชัก ความกว้าง หัวข้อ" },
      { title: "รายการสินค้าในตะกร้า", keywords: "ราคาต่อชิ้น ตัวเลือก รายการโปรด" },
      { title: "หน้าตะกร้าเต็มหน้า (/cart) + ตัวเลือกต่อชิ้น", keywords: "ติ๊กเลือก เปลี่ยนสี สลักชื่อ" },
      { title: "ตอนตะกร้าว่าง" },
      { title: "ท้ายตะกร้า (ยอดรวม + ปุ่ม)", keywords: "ปุ่มสั่งซื้อ เลือกซื้อต่อ ล้างตะกร้า" },
      { title: "แถบ “อีก ฿X ส่งฟรี”", keywords: "ส่งฟรี free shipping" },
      { title: "สินค้าแนะนำในตะกร้า", keywords: "คุณอาจชอบ ซื้อคู่กัน" },
      { title: "เข้าชุดกับชิ้นนี้ (ใต้แต่ละรายการ)" },
      { title: "ฟังก์ชันเพิ่มในตะกร้า", keywords: "โค้ดส่วนลด คูปอง ห่อของขวัญ การ์ดอวยพร โน้ต" },
      { title: "แถบความมั่นใจ (ใต้ปุ่มสั่งซื้อ)", keywords: "trust ไอคอน" },
      { title: "วันที่คาดว่าได้รับ", keywords: "วันส่ง delivery" },
    ],
  },
  checkout: {
    label: "หน้าชำระเงิน",
    desc: "ข้อความ · ช่องกรอก · ช่องทางจ่าย",
    paths: ["checkout", "page.areaParts.checkout"],
    keywords: "checkout ชำระเงิน จ่ายเงิน",
    cards: [
      { title: "ข้อความ" },
      { title: "ช่องที่ลูกค้ากรอก", keywords: "อีเมล หมายเหตุ" },
      { title: "การจัดวาง", keywords: "คอลัมน์" },
      { title: "ช่องทางชำระเงิน", keywords: "พร้อมเพย์ โอน ปลายทาง cod" },
      { title: "🔒 หัวเว็บ + มือถือ", keywords: "หัวเว็บเรียบ simple header สรุปพับ ปุ่มติดล่างจอ sticky" },
      { title: "แถบความมั่นใจใต้ปุ่มยืนยัน" },
      { title: "📜 นโยบาย + ยอมรับเงื่อนไข", keywords: "policy terms ข้อกำหนด ยอมรับ ติ๊ก" },
      { title: "หน้าขอบคุณ (หลังกดสั่ง)" },
    ],
  },
  pages: {
    label: "หน้าพิเศษ",
    desc: "404 · ขอบคุณ · ป๊อปอัป · เข้าสู่ระบบ",
    paths: ["page.notFound", "page.thanks", "page.popup", "page.share", "page.login", "page.account"],
    keywords: "special pages",
    cards: [
      { title: "หน้า 404 (ไม่พบหน้า)", keywords: "not found" },
      { title: "หน้าขอบคุณหลังสั่งซื้อ", keywords: "thank you ลูกเล่น animation confetti รูปสินค้า ขั้นตอนถัดไป ข้อความจากร้าน 2 คอลัมน์" },
      { title: "ป๊อปอัปรับส่วนลด", keywords: "popup สมัครสมาชิก" },
      { title: "รูปตอนแชร์ลิงก์สินค้า (Facebook · LINE)", keywords: "og image share" },
      { title: "หน้าเข้าสู่ระบบ / สมัครสมาชิก", keywords: "login signup" },
      { title: "หน้าบัญชีของฉัน", keywords: "account สมาชิก" },
    ],
  },
  campaign: {
    label: "แคมเปญและตั้งเวลา",
    desc: "ตั้งเวลาเผยแพร่ · ธีมตามช่วงวัน",
    paths: ["page.festive", "page.proof"],
    keywords: "campaign schedule แคมเปญ",
    cards: [
      { title: "ตั้งเวลาเผยแพร่", level: "full", keywords: "schedule" },
      { title: "ธีมแคมเปญตามช่วงวันที่", level: "full", keywords: "11.11 โปรโมชัน" },
      { title: "ของตกแต่งเทศกาล (ธีมปกติ)", keywords: "หิมะ ปีใหม่" },
      { title: "ป้ายคนดู / ขายแล้ว", keywords: "social proof" },
    ],
  },
  history: {
    label: "ประวัติ",
    desc: "เวอร์ชันที่เผยแพร่ · กู้คืน",
    paths: [],
    keywords: "history version กู้คืน",
    cards: [{ title: "ประวัติการเผยแพร่" }],
  },
};

export const DESIGN_PAGE_KEYS = Object.keys(DESIGN_PAGES) as Exclude<DesignPageKey, "overview">[];
export const isDesignPageKey = (k: unknown): k is DesignPageKey => k === "overview" || (typeof k === "string" && k in DESIGN_PAGES);
export const designGroupOf = (k: DesignPageKey) => DESIGN_GROUPS.find((g) => (g.pages as string[]).includes(k)) ?? null;

/** ค่าตาม path ("page.areaParts.header") */
export function valueAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** หน้าที่ค่าต่างจากที่บันทึกล่าสุด (จุดส้มในเมนู/ภาพรวม/แถบล่าง) */
export function dirtyDesignPages(theme: unknown, saved: unknown): Exclude<DesignPageKey, "overview">[] {
  if (!theme || !saved) return [];
  const same = (p: string) => JSON.stringify(valueAt(theme, p)) === JSON.stringify(valueAt(saved, p));
  return DESIGN_PAGE_KEYS.filter((k) => DESIGN_PAGES[k].paths.some((p) => !same(p)));
}

/** ตัดอีโมจิ/ช่องว่าง/ตัวพิมพ์ — ใช้เทียบหัวการ์ดบนจอกับชื่อในทะเบียน */
export function normTitle(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface DesignHit {
  page: Exclude<DesignPageKey, "overview">;
  /** ชื่อการ์ด (ไม่มี = ทั้งหน้า) */
  card?: string;
  label: string;
  /** หมวด › หน้า (› การ์ด) */
  crumb: string;
}

/** 🔎 ค้นหาการตั้งค่า — ทุกคำที่พิมพ์ต้องเจอ · ลำดับ: ชื่อหน้า → ชื่อการ์ด → ช่องในการ์ด → คำอธิบายหน้า */
export function searchDesign(q: string, limit = 8): DesignHit[] {
  const words = normTitle(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  const scored: { hit: DesignHit; score: number }[] = [];
  for (const g of DESIGN_GROUPS) {
    for (const k of g.pages) {
      const p = DESIGN_PAGES[k];
      const pageHay = normTitle(`${p.label} ${p.desc} ${p.keywords ?? ""} ${g.label}`);
      if (words.every((w) => pageHay.includes(w))) scored.push({ hit: { page: k, label: p.label, crumb: g.label }, score: words.every((w) => normTitle(p.label).includes(w)) ? 0 : 3 });
      for (const c of p.cards) {
        const hay = normTitle(`${c.title} ${c.keywords ?? ""}`);
        if (!words.every((w) => hay.includes(w))) continue;
        scored.push({ hit: { page: k, card: c.title, label: c.title, crumb: `${g.label} › ${p.label}` }, score: words.every((w) => normTitle(c.title).includes(w)) ? 1 : 2 });
      }
    }
  }
  const seen = new Set<string>();
  return scored
    .sort((a, b) => a.score - b.score)
    .map((x) => x.hit)
    .filter((h) => {
      const id = `${h.page}|${h.card ?? ""}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit);
}

/**
 * 🎯 ชิ้นส่วนในพรีวิว → หน้าตั้งค่า (โหมด "คลิกเลือกส่วน" บนแถบพรีวิว + เลื่อนพรีวิวไปส่วนที่กำลังแก้)
 * อิงป้าย data-part ของชุดปรับหน้าตาชิ้นส่วนที่เว็บร้านติดไว้แล้ว (hd.* ft.* pc.* …) — เว็บร้านตัวรับ src/components/layout/DesignAreaBridge
 * เรียงจากเจาะจง → กว้าง (ตัวแรกที่ขึ้นต้นตรงชนะ) · card = ชื่อการ์ดที่จะกางให้ (ไม่ใส่ = เปิดหน้าเฉย ๆ)
 */
export interface PreviewPartRule {
  prefix: string;
  page: Exclude<DesignPageKey, "overview">;
  card?: string;
  /** ป้ายบนกรอบในพรีวิว "แก้: <label>" */
  label: string;
}

export const PREVIEW_PART_RULES: PreviewPartRule[] = [
  { prefix: "hd.logo", page: "logo", card: "รูปแบบโลโก้", label: "โลโก้" },
  { prefix: "hd.link", page: "menu", card: "เมนูด้านบน", label: "เมนู" },
  { prefix: "hd.dd", page: "menu", card: "เมนูด้านบน", label: "เมนู" },
  { prefix: "hd.drawer", page: "menu", card: "เมนูด้านบน", label: "เมนูมือถือ" },
  { prefix: "hd.", page: "header", label: "หัวเว็บ" },
  { prefix: "ft.", page: "footer", label: "ท้ายเว็บ" },
  { prefix: "pc.", page: "card", card: "หน้าตาการ์ด — ชุดสำเร็จรูป · รูปแบบ · ช่องหลัก", label: "การ์ดสินค้า" },
  { prefix: "pd.", page: "product", label: "หน้าสินค้า" },
  { prefix: "cart.", page: "cart", label: "ตะกร้า" },
  { prefix: "co.", page: "checkout", label: "หน้าชำระเงิน" },
  { prefix: "sr.", page: "mobile", card: "มือถือและช่วยขาย", label: "ค้นหา" },
  { prefix: "ck.", page: "mobile", card: "มือถือและช่วยขาย", label: "แถบคุกกี้" },
  { prefix: "pp.", page: "pages", card: "ป๊อปอัปรับส่วนลด", label: "ป๊อปอัปรับส่วนลด" },
  { prefix: "nf.", page: "pages", card: "หน้า 404 (ไม่พบหน้า)", label: "หน้า 404" },
  { prefix: "th.", page: "pages", card: "หน้าขอบคุณหลังสั่งซื้อ", label: "หน้าขอบคุณ" },
  { prefix: "login.", page: "pages", card: "หน้าเข้าสู่ระบบ / สมัครสมาชิก", label: "หน้าเข้าสู่ระบบ" },
  { prefix: "acc.", page: "pages", card: "หน้าบัญชีของฉัน", label: "หน้าบัญชีของฉัน" },
];

/** ชิ้นที่คลิกในพรีวิว (data-part) → กฎที่ตรง (ไม่ตรง = null) */
export const previewRuleOf = (part: string): PreviewPartRule | null => PREVIEW_PART_RULES.find((r) => part.startsWith(r.prefix)) ?? null;

/** เปิดหน้านี้แล้วพรีวิวเลื่อนไปชิ้นไหน (prefix ของหน้านั้น · ไม่มี = ไม่เลื่อน) */
export const previewFocusOf = (page: DesignPageKey): string[] => PREVIEW_PART_RULES.filter((r) => r.page === page).map((r) => r.prefix);

/** ตั้งค่าตาม path จุด (สร้างก้อนกลางทางให้ · ค่า undefined = ลบ) */
function setAt(obj: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    const next = cur[k];
    if (next == null || typeof next !== "object" || Array.isArray(next)) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (v === undefined) delete cur[last];
  else cur[last] = v;
}

/**
 * 👷 คัดเฉพาะค่าของหน้าที่ระบุจาก src ไปทับ base (คืนก้อนใหม่ · ค่าหน้าอื่นใน base ไม่ถูกแตะ)
 *   API ธีมใช้กับพนักงานที่แก้ได้บางหัวข้อ: ร่างในระบบ + เฉพาะหัวข้อที่เขาแก้ → ไม่ทับงานคนอื่น/หัวข้อที่ไม่มีสิทธิ์
 */
export function applyDesignPages<T>(base: T, src: unknown, pages: readonly DesignPageKey[]): T {
  const out = structuredClone(base ?? {}) as Record<string, unknown>;
  for (const p of pages) {
    if (p === "overview" || !(p in DESIGN_PAGES)) continue;
    for (const path of DESIGN_PAGES[p].paths) {
      const v = valueAt(src, path);
      setAt(out, path, v === undefined ? undefined : structuredClone(v));
    }
  }
  return out as T;
}

/** การ์ดที่ซ่อนสำหรับพนักงานที่แก้ได้บางหัวข้อ (หัวการ์ดบนจอ → ระดับ · เทียบแบบขึ้นต้นด้วยชื่อในทะเบียน) */
const CARD_LEVELS: [string, "advanced" | "full"][] = DESIGN_PAGE_KEYS.flatMap((k) =>
  DESIGN_PAGES[k].cards.filter((c) => c.level).map((c) => [normTitle(c.title), c.level!] as [string, "advanced" | "full"])
);
export function designCardLevel(title: string): "advanced" | "full" | null {
  const t = normTitle(title);
  return CARD_LEVELS.find(([k]) => t.startsWith(k))?.[1] ?? null;
}
