/**
 * 🧭 ศูนย์ช่วยเหลือ (Help Center) ของเว็บร้าน — ของกลาง (2026-10-19)
 *
 * แนวคิด: หน้า "ข้อกฎหมาย" (Privacy / Terms) และ "ช่วยเหลือ" (FAQ / ติดตาม / ติดต่อ / จัดส่ง-คืน)
 *   = หน้าเว็บธรรมดา (store_pages) ที่ตั้ง "กลุ่มศูนย์ช่วยเหลือ" ไว้ → เว็บร้านวาดแบบ เมนูซ้าย (หน้าอื่นในกลุ่ม) + เนื้อหาขวา
 *   แก้เนื้อหาด้วย Section เดิมในแท็บ 📄 หน้าเว็บ (2 ภาษา) · ไม่โผล่ในเมนูหลักอัตโนมัติ · ท้ายเว็บใช้คอลัมน์ "ศูนย์ช่วยเหลือ (อัตโนมัติ)"
 *
 * ข้อมูลเสริมของหน้าเก็บใน store_pages.seo (jsonb เดิม — ไม่ต้องเพิ่มคอลัมน์):
 *   title / description           = SEO ไทย          title_en / description_en = SEO อังกฤษ
 *   name_en                       = ชื่อหน้าอังกฤษ (เมนูซ้าย / หัวหน้า / ท้ายเว็บ)
 *   help / help_en                = ชื่อกลุ่มศูนย์ช่วยเหลือ (ว่าง = หน้าธรรมดา)
 * API สาธารณะ (/api/public/storefront/page) แปลงเป็น title_en + help { group, group_en, nav } ให้เว็บร้านสลับภาษาเองด้วยกฎ <key>_en
 *
 * แม่แบบ (HELP_CENTER_PAGES): ปุ่ม "🧭 สร้างชุดศูนย์ช่วยเหลือ" สร้างหน้าที่ยังไม่มีเป็น "ร่าง" (เจ้าของตรวจแล้วกดเผยแพร่เอง)
 *   ⚠️ ข้อความกฎหมายเป็นแม่แบบทั่วไปตาม PDPA สำหรับร้านออนไลน์ — ควรให้ผู้รู้กฎหมายตรวจก่อนใช้จริง
 *   ข้อความใส่ {shop} {email} {phone} {line} {address} {free_shipping} {shipping_fee} ได้ (Section เอกสาร) — เว็บร้านแทนด้วยข้อมูลร้าน
 */
import { normalizeBlocks, type Block } from "@/lib/website-blocks";

/* ─────────── ข้อมูลเสริมของหน้า (เก็บใน seo jsonb) ─────────── */

export interface PageMeta {
  title: string;
  description: string;
  title_en: string;
  description_en: string;
  /** ชื่อหน้าภาษาอังกฤษ */
  name_en: string;
  /** กลุ่มศูนย์ช่วยเหลือ ("" = หน้าธรรมดา) */
  help: string;
  help_en: string;
  /** ⏰ เผยแพร่อัตโนมัติเมื่อถึงเวลา (ISO · "" = ทันทีที่กดเผยแพร่) — ก่อนเวลา เว็บซ่อนหน้านี้ (พรีวิวยังเห็น) */
  publishAt: string;
  /** 🎯 หน้า Landing: ซ่อนหัวเว็บ/ท้ายเว็บ (หน้าแคมเปญ/โฆษณา) */
  bare: boolean;
  /** 📝 บทความ (page_type post): รูปปก r2 key · สรุปสั้น · แท็ก · ผู้เขียน */
  cover: string;
  excerpt: string;
  excerpt_en: string;
  tags: string[];
  author: string;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** อ่าน/ทำความสะอาด seo jsonb ของหน้า (ข้อมูลเก่ามีแค่ title/description = ได้ค่าว่างที่เหลือ) */
export function cleanPageMeta(raw: unknown): PageMeta {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    title: str(o.title, 160),
    description: str(o.description, 320),
    title_en: str(o.title_en, 160),
    description_en: str(o.description_en, 320),
    name_en: str(o.name_en, 120),
    help: str(o.help, 40),
    help_en: str(o.help_en, 40),
    publishAt: (() => {
      const v = str(o.publishAt, 40);
      return v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : "";
    })(),
    bare: o.bare === true,
    cover: /^[\w./-]{1,300}$/.test(str(o.cover, 300)) && !str(o.cover, 300).includes("..") ? str(o.cover, 300) : "",
    excerpt: str(o.excerpt, 400),
    excerpt_en: str(o.excerpt_en, 400),
    tags: [...new Set((Array.isArray(o.tags) ? o.tags : String(o.tags ?? "").split(",")).map((t) => String(t).trim().slice(0, 30)).filter(Boolean))].slice(0, 10),
    author: str(o.author, 60),
  };
}

/** หน้านี้ถึงเวลาเผยแพร่แล้วไหม (publishAt ว่าง = ใช่) */
export function pageLive(meta: Pick<PageMeta, "publishAt">, now: Date = new Date()): boolean {
  return !meta.publishAt || new Date(meta.publishAt).getTime() <= now.getTime();
}

/* ─────────── แม่แบบชุดหน้า ─────────── */

export const HELP_GROUPS = {
  legal: { th: "ข้อกฎหมาย", en: "Legal" },
  support: { th: "ช่วยเหลือ", en: "Support" },
} as const;

export interface HelpPageTemplate {
  slug: string;
  title: string;
  name_en: string;
  group: keyof typeof HELP_GROUPS;
  description: string;
  description_en: string;
  /** บล็อกดิบ (ผ่าน normalizeBlocks ตอนสร้าง) */
  blocks: () => Record<string, unknown>[];
}

const UPDATED = { updated: "อัปเดตล่าสุด 19 ตุลาคม 2569", updated_en: "Last updated 19 October 2026" };

/** ช่วยสร้างหัวข้อของ Section เอกสาร (ไทย + อังกฤษ) */
const sec = (id: string, title: string, title_en: string, body: string, body_en: string) => ({ id, enabled: true, title, title_en, body, body_en });

const doc = (id: string, intro: string, intro_en: string, sections: ReturnType<typeof sec>[]) => ({
  id,
  type: "doc",
  enabled: true,
  title: "",
  ...UPDATED,
  intro,
  intro_en,
  numbered: true,
  width: "normal",
  sections,
});

const CONTACT_LINES_TH = "{shop}\n{address}\nอีเมล {email}\nโทร {phone}\nLINE {line}";
const CONTACT_LINES_EN = "{shop}\n{address}\nEmail {email}\nPhone {phone}\nLINE {line}";

export const HELP_CENTER_PAGES: HelpPageTemplate[] = [
  /* ── ข้อกฎหมาย ── */
  {
    slug: "privacy",
    title: "นโยบายความเป็นส่วนตัว",
    name_en: "Privacy Policy",
    group: "legal",
    description: "เราเก็บข้อมูลอะไร ใช้ทำอะไร และสิทธิของคุณตาม PDPA",
    description_en: "What we collect, how we use it, and your rights under Thailand's PDPA.",
    blocks: () => [
      doc(
        "help-privacy",
        "{shop} (“ร้าน” หรือ “เรา”) ให้ความสำคัญกับข้อมูลส่วนบุคคลของคุณ และปฏิบัติตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) นโยบายนี้อธิบายว่าเราเก็บข้อมูลอะไร ใช้ทำอะไร และคุณมีสิทธิอะไรบ้าง",
        "{shop} (“the shop”, “we” or “us”) values your personal data and complies with Thailand's Personal Data Protection Act B.E. 2562 (PDPA). This policy explains what we collect, how we use it, and your rights.",
        [
          sec(
            "collect",
            "ข้อมูลที่เราเก็บ",
            "Information we collect",
            "- เมื่อสั่งซื้อ: ชื่อผู้รับ เบอร์โทร อีเมล (ถ้ากรอก) ที่อยู่จัดส่ง รายการสินค้า วิธีชำระเงิน และหมายเหตุที่คุณเขียนถึงร้าน\n- เมื่อสมัครสมาชิกหรือเข้าสู่ระบบด้วย Google, LINE หรือ Facebook: ชื่อ อีเมล รูปโปรไฟล์ และรหัสผู้ใช้ของบริการนั้น (เราไม่ได้รับรหัสผ่านของคุณ และไม่โพสต์อะไรแทนคุณ) รวมถึงที่อยู่ที่คุณบันทึกไว้ในบัญชี\n- เมื่อสมัครรับข่าวสาร: อีเมลของคุณ\n- เมื่อส่งข้อความผ่านฟอร์มติดต่อ: ชื่อ อีเมล เบอร์โทร (ถ้ากรอก) และข้อความของคุณ\n- ขณะใช้เว็บ: คุกกี้ที่จำเป็นต่อการทำงาน เช่น การเข้าสู่ระบบ และข้อมูลตะกร้าสินค้าที่เก็บไว้ในเครื่องของคุณเอง",
            "- When you order: the recipient's name, phone number, email (if provided), shipping address, items ordered, payment method, and any note you leave for the shop\n- When you register or sign in with Google, LINE or Facebook: your name, email, profile picture and user ID from that service (we never receive your password and never post on your behalf), plus any addresses you save in your account\n- When you subscribe to our newsletter: your email\n- When you send us a message through the contact form: your name, email, phone (if provided) and your message\n- While you browse: cookies needed for the site to work, such as signing in, and cart data stored on your own device"
          ),
          sec(
            "use",
            "เราใช้ข้อมูลเพื่อ",
            "How we use it",
            "- จัดส่งสินค้า ยืนยันการชำระเงิน และให้บริการหลังการขาย (ฐานสัญญา)\n- ดูแลบัญชีสมาชิก เช่น แสดงประวัติการสั่งซื้อ และเติมที่อยู่ให้อัตโนมัติ\n- ติดต่อคุณเรื่องคำสั่งซื้อ และตอบข้อความที่คุณส่งมา\n- ส่งข่าวสารและโปรโมชัน — เฉพาะเมื่อคุณยินยอม และยกเลิกได้ทุกเมื่อ\n- ปฏิบัติตามกฎหมาย เช่น การเก็บหลักฐานการขายและภาษี",
            "- To deliver your order, confirm payment and provide after-sales service (contract basis)\n- To manage your account, e.g. showing your order history and filling in saved addresses\n- To contact you about your order and reply to your messages\n- To send news and promotions — only with your consent, and you can unsubscribe at any time\n- To comply with the law, e.g. keeping sales and tax records"
          ),
          sec(
            "share",
            "การเปิดเผยข้อมูล",
            "Sharing your information",
            "เราไม่ขายข้อมูลส่วนบุคคลของคุณ เราเปิดเผยเท่าที่จำเป็นให้กับบริษัทขนส่ง (ชื่อ เบอร์ และที่อยู่สำหรับจัดส่ง) และผู้ให้บริการระบบที่ช่วยให้เว็บทำงาน (เช่น โฮสติ้งและฐานข้อมูล) ซึ่งต้องรักษาความลับของข้อมูล หรือเมื่อกฎหมายกำหนด",
            "We never sell your personal data. We only share what is necessary with delivery companies (name, phone and shipping address) and with service providers that keep the site running (such as hosting and database providers), who must keep it confidential — or when required by law."
          ),
          sec(
            "retention",
            "ระยะเวลาการเก็บ",
            "How long we keep it",
            "- บัญชีสมาชิก: จนกว่าคุณจะลบบัญชี\n- ข้อมูลการสั่งซื้อ: ตามระยะเวลาที่กฎหมายบัญชีและภาษีกำหนด\n- อีเมลรับข่าวสาร: จนกว่าคุณจะขอยกเลิก\n- ข้อความจากฟอร์มติดต่อ: ไม่เกิน 2 ปี หรือจนกว่าคุณขอให้ลบ",
            "- Member accounts: until you delete your account\n- Order records: for the period required by accounting and tax law\n- Newsletter emails: until you unsubscribe\n- Contact form messages: up to 2 years, or until you ask us to delete them"
          ),
          sec(
            "rights",
            "สิทธิของคุณ",
            "Your rights",
            "คุณมีสิทธิขอเข้าถึงและขอสำเนาข้อมูล ขอแก้ไขให้ถูกต้อง ขอลบ คัดค้านหรือขอให้ระงับการใช้ ขอโอนย้ายข้อมูล และถอนความยินยอมได้ทุกเมื่อ รวมถึงร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) — ติดต่อเราได้ตามช่องทางด้านล่าง",
            "You may request access to and a copy of your data, ask us to correct or delete it, object to or restrict its use, request data portability, and withdraw consent at any time. You may also file a complaint with Thailand's Personal Data Protection Committee (PDPC). Contact us through the channels below."
          ),
          sec(
            "delete-account",
            "การลบบัญชีและข้อมูล",
            "Deleting your account and data",
            "- สมาชิก: เข้าสู่ระบบ ไปที่ บัญชีของฉัน › โปรไฟล์ แล้วกด “ลบบัญชีของฉัน…” ระบบจะลบชื่อ อีเมล เบอร์ รูป ที่อยู่ที่บันทึก และการเชื่อมต่อ Google / LINE / Facebook ทันที (ข้อมูลการสั่งซื้อเก็บไว้เป็นหลักฐานการขายตามกฎหมาย)\n- หรือแจ้งขอลบข้อมูลกับเราทางหน้า [ติดต่อเรา](/contact) — เราจะดำเนินการภายใน 30 วัน\n- อีเมลสำหรับเรื่องข้อมูลส่วนบุคคล: {email}",
            "- Members: sign in, go to My account › Profile and tap “Delete my account…”. Your name, email, phone, photo, saved addresses and Google / LINE / Facebook connections are deleted immediately (order records are kept as sales records as required by law)\n- Or ask us to delete your data through our [Contact us](/contact) page — we will complete it within 30 days\n- Email for personal data requests: {email}"
          ),
          sec("contact", "ติดต่อเรา", "Contact us", `${CONTACT_LINES_TH}\n\nเราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว โดยจะแสดงวันที่ปรับปรุงล่าสุดไว้ด้านบน`, `${CONTACT_LINES_EN}\n\nWe may update this policy from time to time; the latest update date is shown at the top.`),
        ]
      ),
    ],
  },
  {
    slug: "terms",
    title: "ข้อกำหนดและเงื่อนไข",
    name_en: "Terms & Conditions",
    group: "legal",
    description: "เงื่อนไขการใช้เว็บไซต์และการสั่งซื้อสินค้า",
    description_en: "The terms for using our website and ordering our products.",
    blocks: () => [
      doc(
        "help-terms",
        "ข้อกำหนดนี้ใช้กับการเข้าชมเว็บไซต์และการสั่งซื้อสินค้าจาก {shop} การใช้เว็บไซต์หรือสั่งซื้อสินค้าถือว่าคุณได้อ่านและยอมรับข้อกำหนดนี้แล้ว",
        "These terms apply to your use of this website and to orders placed with {shop}. By using the website or placing an order, you confirm that you have read and accept these terms.",
        [
          sec(
            "products",
            "สินค้าและราคา",
            "Products and prices",
            "- เราพยายามแสดงรูป สี และรายละเอียดสินค้าให้ตรงที่สุด แต่สีที่เห็นอาจต่างเล็กน้อยตามหน้าจอของคุณ และงานวัสดุธรรมชาติหรืองานทำมือแต่ละชิ้นอาจมีลายหรือรายละเอียดไม่เหมือนกันทุกชิ้น\n- ราคาแสดงเป็นเงินบาท ราคาที่ใช้คือราคา ณ เวลาที่คุณยืนยันคำสั่งซื้อ\n- หากราคาหรือข้อมูลสินค้าผิดพลาดอย่างชัดเจน เราขอสงวนสิทธิ์ยกเลิกคำสั่งซื้อนั้นและคืนเงินเต็มจำนวน",
            "- We do our best to show product photos, colours and details accurately, but colours may look slightly different on your screen, and natural-material or handmade pieces may vary from item to item\n- Prices are shown in Thai baht. The price that applies is the one shown when you confirm your order\n- If a price or product detail is clearly wrong, we may cancel that order and give you a full refund"
          ),
          sec(
            "orders",
            "การสั่งซื้อและการชำระเงิน",
            "Orders and payment",
            "- คำสั่งซื้อจะสมบูรณ์เมื่อเราได้รับชำระเงิน หรือเมื่อยืนยันคำสั่งซื้อแบบเก็บเงินปลายทาง\n- ช่องทางชำระเงินที่ใช้ได้จะแสดงในหน้าชำระเงิน\n- เราอาจยกเลิกคำสั่งซื้อได้หากสินค้าหมด ข้อมูลจัดส่งไม่ครบ หรือพบความผิดปกติในการสั่งซื้อ โดยจะคืนเงินเต็มจำนวนสำหรับยอดที่ชำระแล้ว",
            "- Your order is confirmed once we receive payment, or once a cash-on-delivery order is confirmed\n- Available payment methods are shown at checkout\n- We may cancel an order if an item is out of stock, delivery details are incomplete, or the order looks irregular, and we will fully refund any amount already paid"
          ),
          sec(
            "custom",
            "สินค้าสั่งทำและสินค้าปั๊มชื่อ",
            "Made-to-order and personalized items",
            "สินค้าที่สั่งทำพิเศษหรือปั๊มชื่อ/ตัวอักษรตามที่คุณกำหนด จะยกเลิกไม่ได้หลังเริ่มผลิต และไม่รับคืน เว้นแต่สินค้าชำรุดจากการผลิต — กรุณาตรวจตัวสะกดก่อนยืนยันคำสั่งซื้อ",
            "Made-to-order items and items personalized with your name or letters cannot be cancelled once production starts and cannot be returned unless they have a manufacturing defect. Please check the spelling before you confirm your order."
          ),
          sec(
            "delivery",
            "การจัดส่ง การคืนและเปลี่ยนสินค้า",
            "Delivery, returns and exchanges",
            "รายละเอียดค่าจัดส่ง ระยะเวลา และเงื่อนไขการคืน/เปลี่ยนสินค้า ดูได้ที่หน้า [การจัดส่งและการคืนสินค้า](/shipping-returns)",
            "Shipping fees, delivery times and our return and exchange conditions are explained on our [Shipping & Return Policy](/shipping-returns) page."
          ),
          sec(
            "account",
            "บัญชีสมาชิก",
            "Member accounts",
            "คุณรับผิดชอบการดูแลบัญชีของคุณ และข้อมูลที่ให้ไว้ต้องเป็นความจริง เราอาจระงับบัญชีที่ใช้งานผิดวัตถุประสงค์หรือละเมิดข้อกำหนดนี้",
            "You're responsible for keeping your account secure, and the information you give us must be accurate. We may suspend accounts that are misused or that break these terms."
          ),
          sec(
            "ip",
            "ทรัพย์สินทางปัญญา",
            "Intellectual property",
            "รูปภาพ โลโก้ ข้อความ และเนื้อหาทั้งหมดบนเว็บไซต์นี้เป็นของ {shop} หรือผู้ให้สิทธิ์ ห้ามคัดลอก ดัดแปลง หรือนำไปใช้เชิงพาณิชย์โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษร",
            "All photos, logos, text and other content on this website belong to {shop} or its licensors. You may not copy, modify or use them commercially without our written permission."
          ),
          sec(
            "liability",
            "ข้อจำกัดความรับผิด",
            "Limitation of liability",
            "ภายใต้ขอบเขตที่กฎหมายอนุญาต ความรับผิดของเราเกี่ยวกับคำสั่งซื้อใด ๆ จำกัดไม่เกินราคาสินค้าที่คุณชำระสำหรับคำสั่งซื้อนั้น ทั้งนี้ไม่กระทบสิทธิของผู้บริโภคตามกฎหมาย",
            "To the extent permitted by law, our liability for any order is limited to the price you paid for that order. This does not affect your statutory consumer rights."
          ),
          sec(
            "law",
            "กฎหมายที่ใช้บังคับ",
            "Governing law",
            "ข้อกำหนดนี้อยู่ภายใต้กฎหมายแห่งราชอาณาจักรไทย",
            "These terms are governed by the laws of the Kingdom of Thailand."
          ),
          sec(
            "changes",
            "การเปลี่ยนแปลงข้อกำหนด",
            "Changes to these terms",
            "เราอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว ฉบับที่แสดงบนเว็บไซต์ ณ วันที่คุณสั่งซื้อจะใช้กับคำสั่งซื้อนั้น",
            "We may update these terms from time to time. The version shown on the website when you place an order applies to that order."
          ),
          sec("contact", "ติดต่อเรา", "Contact us", CONTACT_LINES_TH, CONTACT_LINES_EN),
        ]
      ),
    ],
  },

  /* ── ช่วยเหลือ ── */
  {
    slug: "faq",
    title: "คำถามที่พบบ่อย",
    name_en: "FAQ",
    group: "support",
    description: "คำถามเรื่องการสั่งซื้อ การจัดส่ง และการคืนสินค้า",
    description_en: "Answers about ordering, delivery and returns.",
    blocks: () => {
      const q = (id: string, cat: string, cat_en: string, question: string, q_en: string, a: string, a_en: string) => ({ id, enabled: true, q: question, q_en, a, a_en, cat, cat_en });
      const ORDER = ["การสั่งซื้อ", "Orders"] as const;
      const SHIP = ["การจัดส่ง", "Shipping"] as const;
      const RET = ["เปลี่ยน / คืนสินค้า", "Returns"] as const;
      return [
        {
          id: "help-faq",
          type: "faq",
          enabled: true,
          eyebrow: "",
          title: "",
          subtitle: "",
          // ปุ่มใต้หัวข้อปิดไว้ — ในศูนย์ช่วยเหลือมี "ติดต่อเรา" ในเมนูซ้ายอยู่แล้ว (เปิดเองได้ใน ERP)
          showContact: false,
          contact: { text: "ยังมีคำถาม? ติดต่อเรา", href: "/contact" },
          contact_en: "Still have questions? Contact us",
          layout: "tabs",
          itemStyle: "line",
          icon: "chev",
          openMode: "none",
          search: true,
          seo: true,
          items: [
            q("o1", ...ORDER, "สั่งซื้ออย่างไร?", "How do I place an order?", "เลือกสินค้าแล้วกด “ใส่ตะกร้า” จากนั้นกดชำระเงิน กรอกชื่อ ที่อยู่จัดส่ง และเลือกวิธีชำระเงิน แล้วยืนยันคำสั่งซื้อ — คุณจะได้เลขที่คำสั่งซื้อไว้ติดตามสถานะ", "Choose a product and tap “Add to cart”, then go to checkout, fill in your name and shipping address, choose a payment method and confirm. You'll get an order number to track your order."),
            q("o2", ...ORDER, "ชำระเงินช่องทางไหนได้บ้าง?", "Which payment methods can I use?", "ช่องทางที่เปิดให้บริการจะแสดงในหน้าชำระเงิน เช่น โอนผ่านพร้อมเพย์ หรือเก็บเงินปลายทาง", "Available methods are shown at checkout, such as PromptPay transfer or cash on delivery."),
            q("o3", ...ORDER, "ยกเลิกหรือแก้ไขคำสั่งซื้อได้ไหม?", "Can I cancel or change my order?", "ได้ก่อนสินค้าถูกจัดส่ง กรุณาติดต่อเราโดยเร็วพร้อมเลขที่คำสั่งซื้อ — สินค้าสั่งทำหรือปั๊มชื่อยกเลิกไม่ได้หลังเริ่มผลิต", "Yes, before it ships. Contact us as soon as possible with your order number. Made-to-order and personalized items can't be cancelled once production starts."),
            q("s1", ...SHIP, "ใช้เวลาจัดส่งกี่วัน?", "How long does delivery take?", "เราแพ็กและส่งภายใน 1–2 วันทำการหลังยืนยันการชำระเงิน กรุงเทพฯ และปริมณฑลได้รับภายใน 1–2 วันทำการ ต่างจังหวัด 2–4 วันทำการ", "We pack and ship within 1–2 business days after payment is confirmed. Delivery takes 1–2 business days in Bangkok and nearby provinces, and 2–4 business days elsewhere."),
            q("s2", ...SHIP, "ค่าจัดส่งเท่าไร?", "How much is shipping?", "ค่าจัดส่งจะคำนวณให้ในหน้าตะกร้าและหน้าชำระเงิน ดูเงื่อนไขส่งฟรีได้ที่หน้า การจัดส่งและการคืนสินค้า", "Shipping is calculated in your cart and at checkout. See our Shipping & Return Policy page for free-shipping conditions."),
            q("s3", ...SHIP, "ติดตามพัสดุได้อย่างไร?", "How can I track my parcel?", "ไปที่หน้า ติดตามคำสั่งซื้อ แล้วกรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่ง เมื่อจัดส่งแล้วจะเห็นเลขพัสดุพร้อมลิงก์ไปเว็บขนส่ง — ถ้าเป็นสมาชิก เข้าสู่ระบบแล้วเห็นทุกคำสั่งซื้อได้ทันที", "Go to Track Your Order and enter your order number and the phone number you ordered with. Once shipped, you'll see the tracking number with a link to the carrier. Members can sign in to see all their orders."),
            q("r1", ...RET, "เปลี่ยนหรือคืนสินค้าได้ไหม?", "Can I return or exchange an item?", "ได้ภายใน 14 วันหลังได้รับสินค้า สินค้าต้องยังไม่ผ่านการใช้งาน อยู่ในสภาพเดิม และมีป้าย/บรรจุภัณฑ์ครบ ดูขั้นตอนได้ที่หน้า การจัดส่งและการคืนสินค้า", "Yes, within 14 days of delivery. Items must be unused, in their original condition, with all tags and packaging. See the steps on our Shipping & Return Policy page."),
            q("r2", ...RET, "สินค้าปั๊มชื่อหรือสั่งทำคืนได้ไหม?", "Can personalized or made-to-order items be returned?", "ไม่รับคืน เพราะผลิตตามที่คุณกำหนดโดยเฉพาะ ยกเว้นสินค้าชำรุดจากการผลิตหรือเราส่งผิด", "No, because they're made especially for you — unless they have a manufacturing defect or we sent the wrong item."),
            q("r3", ...RET, "ได้รับสินค้าชำรุดหรือผิดรายการต้องทำอย่างไร?", "What if my item arrives damaged or wrong?", "ถ่ายรูปสินค้าและกล่องพัสดุ แล้วติดต่อเราภายใน 14 วันหลังได้รับสินค้า เราจะเปลี่ยนให้หรือคืนเงิน โดยรับผิดชอบค่าส่งทั้งไปและกลับ", "Take photos of the item and the parcel and contact us within 14 days of delivery. We'll replace it or refund you and cover shipping both ways."),
          ],
        },
      ];
    },
  },
  {
    slug: "track",
    title: "ติดตามคำสั่งซื้อ",
    name_en: "Track Your Order",
    group: "support",
    description: "ดูสถานะคำสั่งซื้อและเลขพัสดุ",
    description_en: "Check your order status and tracking number.",
    blocks: () => [
      {
        id: "help-track",
        type: "order-track",
        enabled: true,
        title: "",
        intro: "กรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่ง เพื่อดูสถานะและเลขพัสดุ",
        intro_en: "Enter your order number and the phone number you ordered with to see the status and tracking number.",
        showMemberOrders: true,
        helpText: "ไม่พบคำสั่งซื้อ? ติดต่อเราได้ที่หน้า ติดต่อเรา",
        helpText_en: "Can't find your order? Get in touch on our Contact us page.",
      },
    ],
  },
  {
    slug: "contact",
    title: "ติดต่อเรา",
    name_en: "Contact Us",
    group: "support",
    description: "ส่งข้อความถึงเรา หรือติดต่อทางโทรศัพท์ / LINE / อีเมล",
    description_en: "Send us a message, or reach us by phone, LINE or email.",
    blocks: () => [
      {
        id: "help-contact",
        type: "contact-form",
        enabled: true,
        title: "",
        intro: "ส่งข้อความถึงเรา ทีมงานจะตอบกลับภายใน 1 วันทำการ",
        intro_en: "Send us a message and our team will reply within 1 business day.",
        topics: "สอบถามสินค้า\nคำสั่งซื้อ / การจัดส่ง\nเปลี่ยน / คืนสินค้า\nอื่น ๆ",
        topics_en: "Product question\nOrder or delivery\nReturn or exchange\nOther",
        askPhone: true,
        phoneRequired: false,
        showChannels: true,
        buttonText: "ส่งข้อความ",
        buttonText_en: "Send message",
        successText: "ได้รับข้อความแล้ว ขอบคุณที่ติดต่อเรา เราจะตอบกลับโดยเร็วที่สุด",
        successText_en: "Thanks for getting in touch. We've received your message and will reply as soon as we can.",
      },
    ],
  },
  {
    slug: "shipping-returns",
    title: "การจัดส่งและการคืนสินค้า",
    name_en: "Shipping & Return Policy",
    group: "support",
    description: "ค่าจัดส่ง ระยะเวลา และเงื่อนไขการเปลี่ยน/คืนสินค้าภายใน 14 วัน",
    description_en: "Shipping fees, delivery times, and our 14-day return and exchange policy.",
    blocks: () => [
      doc(
        "help-shipping",
        "",
        "",
        [
          sec(
            "fees",
            "ค่าจัดส่ง",
            "Shipping fees",
            "- ค่าจัดส่ง {shipping_fee} ต่อคำสั่งซื้อ\n- ส่งฟรีเมื่อซื้อครบ {free_shipping}\n- จัดส่งทั่วประเทศไทย ค่าจัดส่งจริงจะแสดงในหน้าตะกร้าและหน้าชำระเงินก่อนยืนยันคำสั่งซื้อ",
            "- Shipping is {shipping_fee} per order\n- Free shipping on orders of {free_shipping} or more\n- We deliver anywhere in Thailand. The exact shipping fee is shown in your cart and at checkout before you confirm"
          ),
          sec(
            "times",
            "ระยะเวลาจัดส่ง",
            "Delivery times",
            "- แพ็กและส่งภายใน 1–2 วันทำการหลังยืนยันการชำระเงิน (ไม่รวมวันหยุด)\n- กรุงเทพฯ และปริมณฑล ได้รับภายใน 1–2 วันทำการ / ต่างจังหวัด 2–4 วันทำการ\n- สินค้าสั่งทำหรือปั๊มชื่อใช้เวลาผลิตเพิ่ม ตามที่แจ้งในหน้าสินค้า\n- เมื่อจัดส่งแล้ว ดูเลขพัสดุได้ที่หน้า [ติดตามคำสั่งซื้อ](/track)",
            "- We pack and ship within 1–2 business days after payment is confirmed (excluding holidays)\n- Delivery takes 1–2 business days in Bangkok and nearby provinces, and 2–4 business days elsewhere\n- Made-to-order and personalized items need extra production time, as shown on the product page\n- Once shipped, you'll find the tracking number on our [Track Your Order](/track) page"
          ),
          sec(
            "returns",
            "การเปลี่ยนและคืนสินค้า (ภายใน 14 วัน)",
            "Returns and exchanges (within 14 days)",
            "คุณขอเปลี่ยนหรือคืนสินค้าได้ภายใน 14 วันนับจากวันที่ได้รับสินค้า โดย\n- สินค้ายังไม่ผ่านการใช้งาน อยู่ในสภาพเดิม และมีป้าย/บรรจุภัณฑ์ครบ\n- มีเลขที่คำสั่งซื้อหรือหลักฐานการซื้อ\n- ขอเปลี่ยนเป็นสีหรือขนาดอื่นได้ หากมีสินค้าในสต็อก",
            "You can ask to exchange or return an item within 14 days of receiving it, as long as:\n- It's unused, in its original condition, with all tags and packaging\n- You have your order number or proof of purchase\n- Exchanges for another colour or size depend on stock"
          ),
          sec(
            "no-return",
            "สินค้าที่เปลี่ยน/คืนไม่ได้",
            "Items that can't be returned",
            "- สินค้าสั่งทำพิเศษ หรือปั๊มชื่อ/ตัวอักษรตามที่คุณกำหนด\n- สินค้าที่ผ่านการใช้งานแล้ว หรือเสียหายจากการใช้งาน\n- สินค้าที่ระบุว่า “ลดราคาพิเศษ ไม่รับเปลี่ยนคืน”\n(ยกเว้นกรณีสินค้าชำรุดจากการผลิตหรือเราส่งผิด)",
            "- Made-to-order items, or items personalized with your name or letters\n- Items that have been used or damaged through use\n- Items marked “final sale”\n(unless the item has a manufacturing defect or we sent the wrong item)"
          ),
          sec(
            "steps",
            "ขั้นตอนการเปลี่ยน/คืนสินค้า",
            "How to return or exchange",
            "- ติดต่อเราผ่านหน้า [ติดต่อเรา](/contact) พร้อมเลขที่คำสั่งซื้อ รูปสินค้า และเหตุผล\n- หรือทัก LINE {line}\n- เราจะยืนยันและแจ้งที่อยู่สำหรับส่งคืน\n- ส่งสินค้ากลับภายใน 7 วันหลังได้รับการยืนยัน (ลูกค้าออกค่าส่งคืน เว้นแต่สินค้าชำรุดหรือเราส่งผิด)\n- เมื่อได้รับและตรวจสอบสินค้าแล้ว เราจะส่งสินค้าใหม่ให้ หรือคืนเงินภายใน 7 วันทำการ",
            "- Contact us through our [Contact us](/contact) page with your order number, photos of the item and the reason\n- Or message us on LINE {line}\n- We'll confirm and send you the return address\n- Send the item back within 7 days of our confirmation (return shipping is paid by you unless the item is defective or we sent the wrong item)\n- Once we receive and check the item, we'll send the replacement or refund you within 7 business days"
          ),
          sec(
            "damaged",
            "สินค้าชำรุดหรือส่งผิด",
            "Damaged or wrong items",
            "ถ่ายรูปสินค้าและกล่องพัสดุตอนเปิด แล้วแจ้งเราภายใน 14 วันหลังได้รับสินค้า เราจะเปลี่ยนให้หรือคืนเงินเต็มจำนวน และรับผิดชอบค่าส่งทั้งไปและกลับ",
            "Take photos of the item and the parcel when you open it and let us know within 14 days of delivery. We'll replace it or give you a full refund and cover shipping both ways."
          ),
          sec(
            "refunds",
            "การคืนเงิน",
            "Refunds",
            "คืนเงินผ่านช่องทางเดิมที่ชำระ หรือโอนเข้าบัญชีธนาคารของคุณ (กรณีเก็บเงินปลายทาง) ภายใน 7 วันทำการหลังตรวจสอบสินค้า ค่าจัดส่งเดิมไม่คืน เว้นแต่สินค้าชำรุดหรือเราส่งผิด",
            "Refunds go back to your original payment method, or to your bank account for cash-on-delivery orders, within 7 business days after we check the item. Original shipping fees aren't refunded unless the item is defective or we sent the wrong item."
          ),
        ]
      ),
    ],
  },
];

/** แม่แบบของหน้า slug นี้ → ข้อมูลหน้า + บล็อกที่ทำความสะอาดแล้ว (พร้อมบันทึก) */
export function buildHelpPage(t: HelpPageTemplate): { slug: string; title: string; seo: PageMeta; blocks: Block[] } {
  const g = HELP_GROUPS[t.group];
  return {
    slug: t.slug,
    title: t.title,
    seo: cleanPageMeta({ description: t.description, description_en: t.description_en, name_en: t.name_en, help: g.th, help_en: g.en }),
    blocks: normalizeBlocks(t.blocks()),
  };
}
