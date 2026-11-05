// ============================================================
// ทะเบียนกลาง: แต่ละแพลตฟอร์ม "โพสต์ได้แบบไหน / ระบบทำอะไรได้" (ไม่มี I/O — ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์)
//  ใช้ที่: ตัวเลือกรูปแบบโพสต์ในการ์ดแคปชั่น (POST_FORMATS) · ค่าเริ่มต้นรายแบรนด์ (FORMATS ใน brand-platforms-modal)
//          · หน้า /admin/platform-accounts (ส่วน "โพสต์ได้แบบไหน" + "ข้อควรรู้")
//  เปิดโพสต์อัตโนมัติแพลตฟอร์มใหม่ (เช่น YouTube) → เปลี่ยน mode "manual" → "auto" ที่นี่ที่เดียว ทุกหน้าเปลี่ยนตาม
//  key ของรูปแบบ (single/carousel/video/reels/story) ต้องตรงกับที่ตัวยิง lib/social-publish รับ
// ============================================================

/** auto = ระบบโพสต์/ทำให้เอง (เมื่อเชื่อมต่อแล้ว) · manual = ระบบเตรียมให้ แล้วคนกดเองในแอป */
export type CapMode = "auto" | "manual";

export type FormatCap = {
  key: string;
  th: string; en: string;              // ชื่อเต็ม (ตัวเลือกในการ์ดแคปชั่น)
  thShort: string; enShort: string;    // ชื่อสั้น (ค่าเริ่มต้นรายแบรนด์ · การ์ดในหน้าบัญชีแพลตฟอร์ม)
  spec: string;                        // สเปกสั้น ๆ ภาษาคน
  mode: CapMode;
  icon: string;                        // ชื่อไอคอนกลาง (<Icon name>)
};

export type PlatformCaps = {
  kind: "social" | "shop";             // social = โพสต์คอนเทนต์ · shop = ร้านค้า (ระบบทำอะไรกับร้านได้)
  pickFormat?: boolean;                // ให้เลือกรูปแบบโพสต์ในการ์ดแคปชั่นไหม
  formats: FormatCap[];                // social = รูปแบบโพสต์ · shop = สิ่งที่ระบบทำได้
  tips: string[];                      // ข้อควรรู้ (สั้น ๆ 2–3 ข้อ)
};

const f = (key: string, th: string, en: string, thShort: string, enShort: string, spec: string, mode: CapMode, icon: string): FormatCap =>
  ({ key, th, en, thShort, enShort, spec, mode, icon });

export const PLATFORM_CAPS: Record<string, PlatformCaps> = {
  facebook: {
    kind: "social", pickFormat: true,
    formats: [
      f("single", "โพสต์รูปเดียว", "Single post", "รูปเดียว", "Single", "รูปแนวไหนก็ได้", "auto", "image"),
      f("carousel", "อัลบั้มหลายรูป", "Album", "อัลบั้ม", "Album", "หลายรูปในโพสต์เดียว", "auto", "folders"),
      f("video", "วิดีโอ", "Video", "วิดีโอ", "Video", "วิดีโอแนวไหนก็ได้", "auto", "video"),
      f("reels", "Reels (วิดีโอแนวตั้ง)", "Reels", "Reels", "Reels", "วิดีโอแนวตั้ง 9:16", "auto", "play"),
      f("story", "Story (24 ชม.)", "Story", "Story", "Story", "หายใน 24 ชม.", "auto", "clock"),
    ],
    tips: [
      "แคปชั่นยาวได้ และลิงก์ในโพสต์กดได้",
      "Story ไม่แสดงแคปชั่น — ใส่ข้อความไว้ในรูปแทน",
      "โพสต์แล้วคนอื่นไม่เห็น = แอป Meta ยังอยู่โหมด Development (ต้องสลับเป็น Live)",
    ],
  },
  instagram: {
    kind: "social", pickFormat: true,
    formats: [
      f("single", "โพสต์รูปเดียว", "Single post", "รูปเดียว", "Single", "สัดส่วน 4:5 – 1.91:1", "auto", "image"),
      f("carousel", "อัลบั้มหลายรูป", "Carousel", "อัลบั้ม", "Carousel", "2 – 10 รูป ปัดดู", "auto", "folders"),
      f("reels", "Reels (วิดีโอ)", "Reels", "Reels", "Reels", "วิดีโอแนวตั้ง 9:16", "auto", "play"),
      f("story", "Story (24 ชม.)", "Story", "Story", "Story", "หายใน 24 ชม.", "auto", "clock"),
    ],
    tips: [
      "แคปชั่นยาวสุด 2,200 ตัวอักษร · แฮชแท็กไม่เกิน 30",
      "รูปสัดส่วนไม่ผ่าน (เช่น 2:3) ระบบเติมขอบให้เอง",
      "ลิงก์ในแคปชั่นกดไม่ได้ — ใส่ลิงก์ที่ไบโอแทน",
    ],
  },
  tiktok: {
    kind: "social", pickFormat: true,
    formats: [
      f("video", "วิดีโอ", "Video", "วิดีโอ", "Video", "วิดีโอแนวตั้ง 9:16", "manual", "video"),
      f("carousel", "โพสต์รูปภาพ", "Photo post", "โพสต์รูป", "Photo", "หลายรูป ปัดดู", "manual", "folders"),
    ],
    tips: [
      "ตอนนี้ระบบเตรียมแคปชั่นให้คัดลอก แล้วกดโพสต์ในแอป TikTok เอง",
      "โพสต์อัตโนมัติอยู่ในแผน (TikTok บังคับให้แอปผ่านการตรวจก่อน ไม่งั้นโพสต์ได้แค่แบบส่วนตัว)",
    ],
  },
  youtube: {
    kind: "social", pickFormat: true,
    formats: [
      f("video", "วิดีโอปกติ", "Video", "วิดีโอ", "Video", "วิดีโอแนวนอน", "manual", "video"),
      f("reels", "Shorts", "Shorts", "Shorts", "Shorts", "แนวตั้ง ไม่เกิน 3 นาที", "manual", "play"),
    ],
    tips: [
      "ตอนนี้ระบบเตรียมชื่อ/คำอธิบายให้คัดลอก แล้วอัปโหลดใน YouTube เอง",
      "โพสต์ Shorts อัตโนมัติอยู่ในแผนคิวโพสต์ก้อนถัดไป",
    ],
  },
  pinterest: {
    kind: "social",
    formats: [f("pin", "Pin รูป", "Image pin", "Pin รูป", "Pin", "แนวตั้ง 2:3 เห็นชัดสุด", "manual", "image")],
    tips: ["ตอนนี้ระบบเตรียมคำอธิบายให้คัดลอก แล้วปักหมุดใน Pinterest เอง", "โพสต์อัตโนมัติอยู่ในแผนคิวโพสต์"],
  },
  x: {
    kind: "social",
    formats: [f("post", "โพสต์ข้อความ / รูป", "Post", "โพสต์", "Post", "ข้อความสั้น + รูป", "manual", "chat")],
    tips: ["X ใช้โพสต์แบบกดเองถาวร — ระบบเตรียมแคปชั่นให้คัดลอก", "บัญชีปกติพิมพ์ได้ 280 ตัวอักษรต่อโพสต์"],
  },
  line_oa: {
    kind: "social",
    formats: [],
    tips: ["ยังไม่มีการส่งข้อความ LINE OA ผ่านระบบ — ตอนนี้ใช้เก็บไอดีบัญชีและทำลิงก์เพิ่มเพื่อน"],
  },
  lazada: {
    kind: "shop",
    formats: [
      f("orders", "ดึงออเดอร์", "Pull orders", "ดึงออเดอร์", "Orders", "ออเดอร์เข้าระบบเอง", "auto", "cart"),
      f("products", "ดึงรายการสินค้า", "Pull products", "ดึงสินค้า", "Products", "จับคู่กับสินค้าในระบบ", "auto", "package"),
    ],
    tips: ["Lazada ให้สิทธิ์ทีละ ~30 วัน ระบบต่ออายุให้ทุกวัน — ขึ้น “หมดอายุ” ให้กดเชื่อมใหม่"],
  },
  line_shopping: {
    kind: "shop",
    formats: [
      f("create", "ลงสินค้าใหม่", "Create product", "ลงสินค้า", "Create", "ส่งสินค้าขึ้นร้าน", "auto", "upload"),
      f("details", "อัปเดตรายละเอียด", "Push details", "รายละเอียด", "Details", "ชื่อ รูป คำอธิบาย", "auto", "edit"),
      f("prices", "อัปเดตราคา", "Push prices", "ราคา", "Prices", "ราคาตรงกับระบบ", "auto", "money"),
      f("display", "เปิด/ปิดการแสดง", "Show/hide", "เปิด/ปิด", "Display", "ซ่อนสินค้าที่หมด", "auto", "view"),
      f("sync", "ดึงรายการสินค้า", "Pull products", "ดึงสินค้า", "Sync", "จับคู่กับสินค้าในระบบ", "auto", "refresh"),
    ],
    tips: ["ทุกอย่างทำงานผ่าน API Key ของร้าน — ล้างคีย์แล้วจะหยุดทั้งหมด"],
  },
  shopee: {
    kind: "shop",
    formats: [f("link", "ระบุร้าน + ทำลิงก์", "Shop link", "ลิงก์ร้าน", "Link", "ใช้เลือกร้านตามแบรนด์", "manual", "link")],
    tips: ["Shopee เปิด API ให้เฉพาะร้าน Mall / Managed Seller — ตอนนี้จึงยังเชื่อมอัตโนมัติไม่ได้"],
  },
  website: {
    kind: "shop",
    formats: [f("link", "ลิงก์หน้าเว็บ", "Website link", "ลิงก์เว็บ", "Link", "ใช้ทำลิงก์ไปหน้าเว็บ", "manual", "web")],
    tips: [],
  },
};

export const capsOf = (code: string): PlatformCaps | null => PLATFORM_CAPS[(code || "").toLowerCase()] ?? null;

/** ตัวเลือกรูปแบบโพสต์ต่อแพลตฟอร์ม (เฉพาะที่ pickFormat) — short = ชื่อสั้น */
export function postFormatOptions(short = false): Record<string, { key: string; th: string; en: string }[]> {
  const out: Record<string, { key: string; th: string; en: string }[]> = {};
  for (const [code, c] of Object.entries(PLATFORM_CAPS)) {
    if (!c.pickFormat) continue;
    out[code] = c.formats.map((x) => ({ key: x.key, th: short ? x.thShort : x.th, en: short ? x.enShort : x.en }));
  }
  return out;
}
