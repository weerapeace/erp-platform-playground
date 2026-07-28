/**
 * ของกลาง — นิยาม "บล็อก" ของหน้าแรกเว็บร้าน (เก็บที่ shops.home_layout)
 *
 * โครงเดิมในระบบเป็น array ของ { type, ...props } อยู่แล้ว (ร้าน Pixiedustie ใช้ hero/product-grid)
 * ไฟล์นี้เพิ่มชนิดบล็อกสำหรับเว็บร้านวัสดุ โดย "ไม่แตะ" ชนิดเดิมของร้านอื่น
 *
 * ใช้ที่: /api/website/layout (แก้ไข) · /api/public/storefront/site (ส่งให้เว็บ) · UI ตัวจัดหน้า
 */

export type BlockType =
  | "announcement"
  | "hero"
  | "two-tracks"
  | "categories"
  | "featured"
  | "faq"
  | "cta"
  | "rich-text";

export interface BlockBase {
  /** id ไว้ลาก/ลบ (ไม่ซ้ำในหน้าเดียว) */
  id: string;
  type: BlockType;
  /** ปิดชั่วคราวโดยไม่ต้องลบ */
  enabled: boolean;
}

export interface CtaLink {
  text: string;
  href: string;
}

export interface AnnouncementBlock extends BlockBase {
  type: "announcement";
  messages: string[];
}

export interface HeroBlock extends BlockBase {
  type: "hero";
  eyebrow: string;
  title: string;
  titleAccent: string;
  subtitle: string;
  primary: CtaLink;
  secondary: CtaLink;
  features: { title: string; desc: string }[];
}

export interface TwoTracksBlock extends BlockBase {
  type: "two-tracks";
  eyebrow: string;
  title: string;
  subtitle: string;
  cards: {
    emoji: string;
    title: string;
    desc: string;
    bullets: string[];
    primary: CtaLink;
    secondary: CtaLink;
    dark: boolean;
  }[];
}

export interface CategoriesBlock extends BlockBase {
  type: "categories";
  eyebrow: string;
  title: string;
}

export interface FeaturedBlock extends BlockBase {
  type: "featured";
  eyebrow: string;
  title: string;
  limit: number;
}

export interface FaqBlock extends BlockBase {
  type: "faq";
  eyebrow: string;
  title: string;
  subtitle: string;
  items: { q: string; a: string }[];
}

export interface CtaBlock extends BlockBase {
  type: "cta";
  title: string;
  subtitle: string;
  primary: CtaLink;
  secondary: CtaLink;
}

export interface RichTextBlock extends BlockBase {
  type: "rich-text";
  eyebrow: string;
  title: string;
  body: string;
}

export type Block =
  | AnnouncementBlock
  | HeroBlock
  | TwoTracksBlock
  | CategoriesBlock
  | FeaturedBlock
  | FaqBlock
  | CtaBlock
  | RichTextBlock;

export const BLOCK_META: Record<BlockType, { label: string; icon: string; hint: string }> = {
  announcement: { label: "แถบประกาศ", icon: "🎗️", hint: "ข้อความเลื่อนบนสุดของเว็บ" },
  hero: { label: "แบนเนอร์หลัก (Hero)", icon: "🖼️", hint: "หัวเรื่องใหญ่ + ปุ่ม + จุดเด่น" },
  "two-tracks": { label: "สองบริการ", icon: "⚖️", hint: "การ์ดเปรียบเทียบ 2 บริการ" },
  categories: { label: "หมวดสินค้า", icon: "📂", hint: "ปุ่มลัดไปแต่ละหมวด" },
  featured: { label: "สินค้าแนะนำ", icon: "⭐", hint: "ดึงสินค้าที่ติ๊กแนะนำมาแสดง" },
  faq: { label: "คำถามที่พบบ่อย", icon: "❓", hint: "รายการถาม-ตอบแบบพับได้" },
  cta: { label: "แถบชวนติดต่อ", icon: "📣", hint: "กล่องสีเน้น + ปุ่ม" },
  "rich-text": { label: "ข้อความอิสระ", icon: "📝", hint: "หัวข้อ + ย่อหน้าอิสระ" },
};

const uid = (t: string, n: number) => `${t}-${n}`;

/** บล็อกเปล่าเมื่อกด "เพิ่มบล็อก" */
export function newBlock(type: BlockType, seq: number): Block {
  const id = uid(type, seq);
  switch (type) {
    case "announcement":
      return { id, type, enabled: true, messages: ["ข้อความประกาศของร้าน"] };
    case "hero":
      return {
        id,
        type,
        enabled: true,
        eyebrow: "รับผลิตเครื่องหนัง & วัสดุงานหนัง",
        title: "งานหนังคุณภาพ",
        titleAccent: "ครบ จบ ที่เดียว",
        subtitle: "รับผลิตกระเป๋าและเข็มขัดหนังแท้สำหรับแบรนด์ของคุณ พร้อมจำหน่ายวัสดุงานหนังครบวงจร",
        primary: { text: "ขอใบเสนอราคา", href: "/quote" },
        secondary: { text: "เข้าร้านวัสดุ", href: "/shop" },
        features: [
          { title: "หนังแท้", desc: "คัดเกรดทุกผืน" },
          { title: "งานเย็บมือ", desc: "ประณีตทุกตะเข็บ" },
          { title: "รับผลิต", desc: "ตามแบบของคุณ" },
          { title: "วัสดุครบ", desc: "4 หมวดหลัก" },
        ],
      };
    case "two-tracks":
      return {
        id,
        type,
        enabled: true,
        eyebrow: "บริการของเรา",
        title: "สองบริการหลัก",
        subtitle: "ไม่ว่าคุณจะเป็นแบรนด์ที่อยากผลิตสินค้า หรือช่างที่มองหาวัสดุคุณภาพ เรามีให้ครบ",
        cards: [
          {
            emoji: "🏭",
            title: "รับผลิต (OEM)",
            desc: "รับผลิตกระเป๋าและเข็มขัดหนังแท้ตามแบบของคุณ ตั้งแต่ออกแบบจนถึงผลิตจริง",
            bullets: ["กระเป๋า / เข็มขัด / กระเป๋าสตางค์", "ทำตัวอย่างก่อนผลิตจริง", "รับงานแบรนด์และงานองค์กร"],
            primary: { text: "ขอใบเสนอราคา", href: "/quote" },
            secondary: { text: "ดูผลงาน", href: "/gallery" },
            dark: true,
          },
          {
            emoji: "🛒",
            title: "ร้านวัสดุงานหนัง",
            desc: "จำหน่ายวัสดุและอุปกรณ์งานหนังคุณภาพ พร้อมส่ง เลือกซื้อออนไลน์ได้เลย",
            bullets: ["หนังวัว หนังแพะ ฟอกฝาด Pull-up", "ผ้าซับใน อะไหล่ ซิป หัวเข็มขัด", "สีทาขอบ น้ำยาเคลือบขอบ"],
            primary: { text: "เข้าร้านวัสดุ", href: "/shop" },
            secondary: { text: "ดูสินค้าทั้งหมด", href: "/shop" },
            dark: false,
          },
        ],
      };
    case "categories":
      return { id, type, enabled: true, eyebrow: "ร้านวัสดุ", title: "เลือกซื้อตามหมวด" };
    case "featured":
      return { id, type, enabled: true, eyebrow: "ขายดี", title: "วัสดุแนะนำ", limit: 4 };
    case "faq":
      return {
        id,
        type,
        enabled: true,
        eyebrow: "คำถามที่พบบ่อย",
        title: "เรื่องที่ลูกค้าถามบ่อย",
        subtitle: "ไม่พบคำตอบที่ต้องการ? ทีมงานยินดีให้คำปรึกษาโดยตรง",
        items: [{ q: "สั่งผลิตขั้นต่ำกี่ชิ้น?", a: "โดยทั่วไปเริ่มต้นที่ประมาณ 30–50 ชิ้นต่อแบบ" }],
      };
    case "cta":
      return {
        id,
        type,
        enabled: true,
        title: "มีแบบในใจแล้ว? ให้เราผลิตให้",
        subtitle: "ส่งแบบหรือไอเดียของคุณมา ทีมงานจะประเมินราคาให้ฟรี",
        primary: { text: "ขอใบเสนอราคา", href: "/quote" },
        secondary: { text: "ติดต่อเรา", href: "/contact" },
      };
    case "rich-text":
      return { id, type, enabled: true, eyebrow: "", title: "หัวข้อ", body: "เนื้อหาที่ต้องการ" };
  }
}

/** โครงหน้าแรกเริ่มต้น (ตรงกับหน้าเว็บปัจจุบัน) — ใช้เมื่อร้านยังไม่เคยตั้งค่า */
export function defaultLayout(): Block[] {
  return [
    newBlock("announcement", 1),
    newBlock("hero", 2),
    newBlock("two-tracks", 3),
    newBlock("categories", 4),
    newBlock("featured", 5),
    newBlock("faq", 6),
    newBlock("cta", 7),
  ];
}

const str = (v: unknown, fb = "", max = 2000) => (typeof v === "string" ? v.slice(0, max) : fb);
const strArr = (v: unknown, max = 20) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((s) => (s as string).slice(0, 300)) : [];
const link = (v: unknown, fbText = "", fbHref = "/"): CtaLink => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { text: str(o.text, fbText, 60), href: str(o.href, fbHref, 200) };
};

/**
 * ทำให้ข้อมูลที่มาจาก DB/ฟอร์มปลอดภัยและครบเสมอ
 * บล็อกที่ไม่รู้จัก (เช่นของร้านอื่น) จะถูก "คงไว้ตามเดิม" ไม่ทิ้ง
 */
export function normalizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];

  raw.slice(0, 40).forEach((item, i) => {
    const b = (item ?? {}) as Record<string, unknown>;
    const type = str(b.type) as BlockType;
    if (!BLOCK_META[type]) return; // ข้ามชนิดที่ไม่รู้จัก (ของร้านอื่น)

    const base = { id: str(b.id, uid(type, i + 1), 60), type, enabled: b.enabled !== false };

    switch (type) {
      case "announcement":
        out.push({ ...base, type, messages: strArr(b.messages, 10) });
        break;
      case "hero":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 120),
          titleAccent: str(b.titleAccent, "", 120),
          subtitle: str(b.subtitle, "", 600),
          primary: link(b.primary, "ขอใบเสนอราคา", "/quote"),
          secondary: link(b.secondary, "เข้าร้านวัสดุ", "/shop"),
          features: Array.isArray(b.features)
            ? (b.features as Record<string, unknown>[])
                .slice(0, 6)
                .map((f) => ({ title: str(f?.title, "", 60), desc: str(f?.desc, "", 120) }))
            : [],
        });
        break;
      case "two-tracks":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 120),
          subtitle: str(b.subtitle, "", 400),
          cards: Array.isArray(b.cards)
            ? (b.cards as Record<string, unknown>[]).slice(0, 2).map((c) => ({
                emoji: str(c?.emoji, "📦", 4),
                title: str(c?.title, "", 80),
                desc: str(c?.desc, "", 400),
                bullets: strArr(c?.bullets, 8),
                primary: link(c?.primary),
                secondary: link(c?.secondary),
                dark: Boolean(c?.dark),
              }))
            : [],
        });
        break;
      case "categories":
        out.push({ ...base, type, eyebrow: str(b.eyebrow, "", 120), title: str(b.title, "", 120) });
        break;
      case "featured":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 120),
          limit: Math.max(2, Math.min(12, Number(b.limit) || 4)),
        });
        break;
      case "faq":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 120),
          subtitle: str(b.subtitle, "", 400),
          items: Array.isArray(b.items)
            ? (b.items as Record<string, unknown>[])
                .slice(0, 20)
                .map((it) => ({ q: str(it?.q, "", 200), a: str(it?.a, "", 1500) }))
                .filter((it) => it.q)
            : [],
        });
        break;
      case "cta":
        out.push({
          ...base,
          type,
          title: str(b.title, "", 160),
          subtitle: str(b.subtitle, "", 400),
          primary: link(b.primary),
          secondary: link(b.secondary),
        });
        break;
      case "rich-text":
        out.push({ ...base, type, eyebrow: str(b.eyebrow, "", 120), title: str(b.title, "", 160), body: str(b.body, "", 3000) });
        break;
    }
  });

  return out;
}
