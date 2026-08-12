// ============================================================
// ค่ากลางของโมดูล "เทรนด์" (Creative Trends)
//   - TREND_CHECKLIST = รายการ "สิ่งที่ต้องมีในบอร์ดเทรนด์" (เตือนอย่างเดียว ไม่บล็อก)
//   - TREND_HEAT      = ระดับความแรงของเทรนด์
//   - TREND_PLATFORMS = ช่องทางที่จะเอาเทรนด์ไปใช้
// ใช้ทั้งหน้า /tasks/trends, การ์ดบนกระดานแคมเปญ และ API (คิด % ความครบ)
// ============================================================

export type TrendCheckKey =
  | "palette" | "refs" | "layout" | "font" | "copy" | "audience" | "platform" | "products"
  | "source" | "period" | "sound" | "hook" | "props" | "hashtag" | "dont" | "result";

export type TrendCheckItem = {
  key: TrendCheckKey;
  icon: string;
  /** จำเป็นจริง ๆ (โชว์ป้าย "ควรมี") — ยังไม่ครบก็ยังใช้งาน/ส่งขึ้นกระดานได้ */
  core: boolean;
  th: string; en: string;
  thHint: string; enHint: string;
};

/** สิ่งที่ควรมีในบอร์ดเทรนด์ 1 ใบ (เรียงตามลำดับที่ควรทำ) */
export const TREND_CHECKLIST: TrendCheckItem[] = [
  { key: "palette", icon: "🎨", core: true,
    th: "โทนสี (Color palette)", en: "Color palette",
    thHint: "วางชิปสี 3–6 สี พร้อมโค้ดสี (#RRGGBB) บอกว่าสีไหนสีหลัก/สีเน้น/สีพื้น",
    enHint: "3–6 color chips with hex codes — mark primary / accent / background" },
  { key: "refs", icon: "🖼", core: true,
    th: "ภาพอ้างอิง (Reference)", en: "Reference images",
    thHint: "แปะรูปตัวอย่างอย่างน้อย 3 รูป + บอกที่มา/เครดิต ว่าเอามาจากไหน",
    enHint: "At least 3 sample images with their source / credit" },
  { key: "layout", icon: "📐", core: true,
    th: "เลย์เอาต์แบนเนอร์", en: "Banner layout",
    thHint: "โครงวางองค์ประกอบ + ขนาดที่ใช้จริง (1:1 · 4:5 · 9:16 · ภาพปก) ว่าอะไรอยู่ตรงไหน",
    enHint: "Composition sketch + real sizes used (1:1 · 4:5 · 9:16 · cover)" },
  { key: "font", icon: "✍️", core: true,
    th: "ฟอนต์ / ตัวอักษร", en: "Typography",
    thHint: "ชื่อฟอนต์ + ขนาดหัวเรื่อง/ข้อความรอง + ตัวไหนต้องเด่นสุด",
    enHint: "Font names, heading vs body sizes, and the visual hierarchy" },
  { key: "copy", icon: "💬", core: true,
    th: "ข้อความหลัก (Key message)", en: "Key message / copy",
    thHint: "หัวเรื่อง + คำรอง + ปุ่มชวนกด (CTA) ตัวอย่าง 2–3 ชุดให้เลือกใช้",
    enHint: "Headline + subhead + CTA — give 2–3 options to pick from" },
  { key: "audience", icon: "🧍", core: false,
    th: "กลุ่มเป้าหมาย", en: "Target audience",
    thHint: "ใครดู อายุ/ความสนใจ + เขาสนใจเรื่องอะไรถึงจะหยุดดู",
    enHint: "Who sees it — age, interests, and what makes them stop scrolling" },
  { key: "platform", icon: "📱", core: true,
    th: "ช่องทางที่จะลง", en: "Where it will be posted",
    thHint: "FB / IG / TikTok / Shopee / Lazada / เว็บ — คนละช่องขนาดไม่เท่ากัน",
    enHint: "FB / IG / TikTok / Shopee / Lazada / web — each needs its own size" },
  { key: "products", icon: "🛍", core: false,
    th: "สินค้า/SKU ที่จะใช้", en: "Products / SKUs",
    thHint: "รหัสสินค้าที่จะโปรโมตกับเทรนด์นี้ (วางการ์ดสินค้าลงบอร์ดได้)",
    enHint: "SKU codes to promote with this trend" },
  { key: "source", icon: "🔗", core: true,
    th: "ลิงก์ต้นทางของเทรนด์", en: "Source link",
    thHint: "โพสต์/คลิปที่เป็นต้นเรื่อง เอาไว้เปิดดูของจริงว่าเขาทำยังไง",
    enHint: "The original post / clip so anyone can see the real thing" },
  { key: "period", icon: "📅", core: false,
    th: "ช่วงเวลา / ความแรง", en: "Time window / heat",
    thHint: "เทรนด์นี้ใช้ได้ถึงเมื่อไหร่ + ตอนนี้มาแรงแค่ไหน (กันหยิบของตกเทรนด์มาใช้)",
    enHint: "How long this trend lasts and how hot it is right now" },
  { key: "sound", icon: "🎵", core: false,
    th: "เพลง / เสียง (ถ้าเป็นคลิป)", en: "Sound / music (for video)",
    thHint: "ชื่อเพลง + ลิงก์เสียง + ท่อนที่ใช้ (วินาทีที่เท่าไหร่)",
    enHint: "Track name, link, and which part of it to use" },
  { key: "hook", icon: "🎬", core: false,
    th: "ฮุก 3 วิแรก (ถ้าเป็นคลิป)", en: "First 3-second hook (video)",
    thHint: "ประโยค/ภาพเปิดที่ทำให้คนหยุดดู + ความยาวคลิปที่เหมาะ",
    enHint: "Opening line or shot that stops the scroll + ideal clip length" },
  { key: "props", icon: "🧩",  core: false,
    th: "พร็อพ / ฉาก / สถานที่", en: "Props / set / location",
    thHint: "ของที่ต้องเตรียมถ้าต้องถ่ายจริง เช่น พื้นหลัง แสง อุปกรณ์ประกอบ",
    enHint: "What to prepare if this needs a real shoot — backdrop, light, props" },
  { key: "hashtag", icon: "#️⃣", core: false,
    th: "แฮชแท็ก / คีย์เวิร์ด", en: "Hashtags / keywords",
    thHint: "แท็กที่ต้องติดตอนโพสต์ + คำค้นที่เกี่ยวข้อง",
    enHint: "Tags to use when posting + related search keywords" },
  { key: "dont", icon: "🚫", core: false,
    th: "ข้อห้าม (Do & Don’t)", en: "Do & Don’t",
    thHint: "สิ่งที่ห้ามทำกับเทรนด์นี้ เช่น ห้ามทับโลโก้ ห้ามใช้ภาพลูกค้าจริง",
    enHint: "What must not be done — e.g. don’t cover the logo, no real customer photos" },
  { key: "result", icon: "📊", core: false,
    th: "ผลลัพธ์ที่คาดหวัง", en: "Expected result",
    thHint: "เคยทำแล้วได้ผลยังไง หรือคาดหวังอะไร (ยอดวิว / คนทัก / ยอดขาย)",
    enHint: "Past results or the goal — views, messages, sales" },
];

export const TREND_CHECK_TOTAL = TREND_CHECKLIST.length;
export const TREND_CORE_KEYS = TREND_CHECKLIST.filter((c) => c.core).map((c) => c.key);

/** ค่าที่เก็บใน erp_creative_trends.checklist — { key: { done, note } } */
export type TrendChecklist = Record<string, { done?: boolean; note?: string } | undefined>;

/** นับความครบ: กี่ข้อจากทั้งหมด + ข้อ "ควรมี" ที่ยังขาด */
export function trendProgress(checklist: TrendChecklist | null | undefined) {
  const cl = checklist ?? {};
  const done = TREND_CHECKLIST.filter((c) => cl[c.key]?.done).length;
  const missingCore = TREND_CHECKLIST.filter((c) => c.core && !cl[c.key]?.done);
  return {
    done, total: TREND_CHECK_TOTAL,
    percent: TREND_CHECK_TOTAL ? Math.round((done / TREND_CHECK_TOTAL) * 100) : 0,
    missingCore,                                   // รายการที่ยังขาด (เอาไปเตือน)
    coreDone: missingCore.length === 0,
  };
}

/** ระดับความแรงของเทรนด์ */
export const TREND_HEAT: { value: string; icon: string; th: string; en: string; cls: string }[] = [
  { value: "hot",     icon: "🔥", th: "มาแรงตอนนี้", en: "Hot now",   cls: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "rising",  icon: "🌱", th: "กำลังมา",     en: "Rising",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cooling", icon: "❄️", th: "เริ่มตกแล้ว", en: "Cooling",   cls: "bg-slate-100 text-slate-500 border-slate-200" },
];
export const heatMeta = (v: string | null | undefined) => TREND_HEAT.find((h) => h.value === v) ?? TREND_HEAT[1];

/** ช่องทางที่เอาเทรนด์ไปใช้ (ติ๊กได้หลายอัน) */
export const TREND_PLATFORMS: { value: string; icon: string; label: string }[] = [
  { value: "facebook", icon: "📘", label: "Facebook" },
  { value: "instagram", icon: "📸", label: "Instagram" },
  { value: "tiktok", icon: "🎵", label: "TikTok" },
  { value: "shopee", icon: "🛒", label: "Shopee" },
  { value: "lazada", icon: "🛍", label: "Lazada" },
  { value: "line", icon: "💚", label: "LINE" },
  { value: "website", icon: "🌐", label: "เว็บไซต์" },
  { value: "print", icon: "🖨", label: "สื่อสิ่งพิมพ์" },
];
