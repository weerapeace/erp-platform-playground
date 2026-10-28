/**
 * 🔣 ทะเบียนไอคอนกลางของ ERP — "ความหมาย" → อีโมจิเดิม + ไอคอนเส้น (ชุด lib/erp-icons) + สีตามความหมาย
 *   pure ไม่มี "use client" → ใช้ได้ทั้งหน้าจอและ API (/api/admin/icon-settings ใช้ cleanIconSettings)
 *
 * แนวคิด: ไม่ต้องไล่แก้อีโมจิทีละไฟล์ก่อน — ของกลาง <Icon value="📦" /> ดูว่าอีโมจินี้ "หมายถึงอะไร" (ตาราง ICON_MEANINGS)
 *   แล้ววาดตามโหมดที่แอดมินเลือกในหน้า /admin/icons: อีโมจิแบบเดิม / ไอคอนเส้น / ไอคอนเส้น+สี
 *   แอดมินเปลี่ยนไอคอน/สีของความหมายไหน = ทุกจุดที่ใช้ความหมายนั้นเปลี่ยนตาม · อัปโหลดไอคอนเองได้ (ไอคอนของฉัน)
 *
 * ค่าไอคอนที่เก็บ (ข้อความเดียว · เข้ากับ lib/website-icons เดิม):
 *   "i:<key>"  = ไอคอนเส้น (ชุด ERP ก่อน แล้วค่อยชุดเว็บร้าน)
 *   "c:<id>"   = ไอคอนของฉัน (รูปที่อัปโหลดเอง เก็บใน app_settings.icon_settings.custom)
 *   "img:<r2>" = รูปตรง ๆ
 *   อื่น ๆ     = อีโมจิ/ตัวอักษร (หาความหมายจากตาราง → วาดตามโหมด · ไม่รู้จัก = โชว์ตามเดิม)
 * เอกสาร: docs/icon-system.md
 */
import { erpIconDef } from "@/lib/erp-icons";
import { siteIconDef } from "@/lib/website-icons";

export type IconMode = "emoji" | "line" | "color";
export type IconTone = "neutral" | "accent" | "success" | "warning" | "danger" | "violet";
export type IconGroup = "action" | "status" | "doc" | "goods" | "money" | "people" | "misc";

export const ICON_GROUP_LABEL: Record<IconGroup, string> = {
  action: "ปุ่มคำสั่ง",
  status: "สถานะ",
  doc: "เอกสาร & ข้อมูล",
  goods: "สินค้า & ผลิต",
  money: "เงิน",
  people: "คน & องค์กร",
  misc: "อื่น ๆ",
};

export const ICON_MODE_LABEL: Record<IconMode, string> = {
  emoji: "อีโมจิแบบเดิม",
  line: "ไอคอนเส้น",
  color: "ไอคอนเส้น + สี",
};

export interface IconMeaning {
  key: string;
  label: string;
  group: IconGroup;
  /** อีโมจิหลัก (ใช้ในโหมดอีโมจิ + จับคู่ของเดิม) */
  emoji: string;
  /** ไอคอนเส้นเริ่มต้น (key ใน lib/erp-icons) */
  icon: string;
  tone?: IconTone;
  /** อีโมจิอื่นที่หมายถึงสิ่งเดียวกัน */
  alias?: string[];
}

const M = (key: string, label: string, group: IconGroup, emoji: string, icon: string, tone?: IconTone, alias?: string[]): IconMeaning =>
  ({ key, label, group, emoji, icon, tone, alias });

/** ความหมายพื้นฐาน — ครอบคลุมอีโมจิในเมนูทุกตัว + ตัวที่ใช้บ่อยในหน้าจอ (ราว 9 ใน 10 จุด) */
export const ICON_MEANINGS: IconMeaning[] = [
  // ── ปุ่มคำสั่ง ──
  M("save", "บันทึก", "action", "💾", "device-floppy"),
  M("edit", "แก้ไข", "action", "✏️", "pencil", undefined, ["✎", "🖊️", "🖋️"]),
  M("delete", "ลบ", "action", "🗑️", "trash", "danger"),
  M("add", "เพิ่ม / สร้างใหม่", "action", "➕", "plus", "accent"),
  M("settings", "ตั้งค่า", "action", "⚙️", "settings"),
  M("tool", "เครื่องมือ / ซ่อม", "action", "🔧", "tool", undefined, ["🛠️"]),
  M("print", "พิมพ์", "action", "🖨️", "printer"),
  M("search", "ค้นหา", "action", "🔍", "search", undefined, ["🔎"]),
  M("list", "รายการ / คัดลอก", "action", "📋", "clipboard-list"),
  M("link", "ลิงก์", "action", "🔗", "link"),
  M("open", "เปิดหน้าใหม่", "action", "↗️", "external-link"),
  M("back", "ย้อนกลับ / ส่งคืน", "action", "↩️", "arrow-back-up", undefined, ["🔙"]),
  M("refresh", "รีเฟรช / ซิงค์", "action", "🔄", "refresh", undefined, ["🔃"]),
  M("repeat", "ทำซ้ำ / ประจำ", "action", "🔁", "repeat"),
  M("shuffle", "สลับ / เส้นทาง", "action", "🔀", "arrows-shuffle"),
  M("upload", "อัปโหลด / นำเข้าไฟล์", "action", "⬆️", "upload"),
  M("download", "ดาวน์โหลด", "action", "⬇️", "download"),
  M("export", "ส่งออก", "action", "📤", "package-export"),
  M("import", "รับเข้า / นำเข้า", "action", "📥", "package-import"),
  M("play", "เริ่ม / รัน", "action", "▶️", "player-play"),
  M("stop-hand", "หยุด / กฎอนุมัติ", "action", "✋", "hand-stop"),
  M("view", "ดู", "action", "👁️", "eye"),
  M("hide", "ซ่อน", "action", "🙈", "eye-off"),
  M("attach", "แนบไฟล์", "action", "📎", "paperclip"),
  M("pin", "ปักหมุด", "action", "📌", "pin", "danger", ["📍"]),
  M("navigate", "นำทาง / จัดการเมนู", "action", "🧭", "compass"),
  M("sliders", "ปรับ / เลย์เอาต์", "action", "🎚️", "adjustments-horizontal"),
  M("lock", "ล็อก / ส่วนตัว", "action", "🔒", "lock"),
  M("unlock", "ปลดล็อก", "action", "🔓", "lock-open"),
  M("permission", "สิทธิ์ / ความปลอดภัย", "action", "🔐", "shield-lock"),
  // ── สถานะ ──
  M("warning", "คำเตือน", "status", "⚠️", "alert-triangle", "warning"),
  M("done", "เสร็จ / ผ่าน", "status", "✅", "circle-check", "success", ["✔️", "☑️"]),
  M("cancel", "ยกเลิก / ไม่ผ่าน", "status", "❌", "circle-x", "danger", ["✖️", "❎"]),
  M("forbidden", "ห้าม / ไม่อนุญาต", "status", "🚫", "ban", "danger", ["⛔"]),
  M("waiting", "รอ / กำลังทำ", "status", "⏳", "hourglass", "warning", ["⌛"]),
  M("tip", "เคล็ดลับ / ไอเดีย", "status", "💡", "bulb", "warning"),
  M("info", "ข้อมูล", "status", "ℹ️", "info-circle", "accent"),
  M("help", "ช่วยเหลือ / คำถาม", "status", "❓", "help-circle", "accent", ["❔"]),
  M("support", "แจ้งปัญหา", "status", "🛟", "lifebuoy", "danger"),
  M("celebrate", "ฉลอง / สำเร็จ", "status", "🎉", "confetti", "success", ["🥳"]),
  M("star", "ดาว / สำคัญ", "status", "⭐", "star", "warning", ["🌟"]),
  M("hot", "มาแรง / ด่วนมาก", "status", "🔥", "flame", "danger"),
  M("fast", "เร็ว / ด่วน", "status", "⚡", "bolt", "warning"),
  M("notify", "แจ้งเตือน", "status", "🔔", "bell", "accent"),
  M("flag", "ธง / ติดตาม", "status", "🚩", "flag", "danger"),
  M("finish", "จบงาน / ปิดใบ", "status", "🏁", "flag-check", "success"),
  M("new", "ใหม่ / ตกแต่ง", "status", "✨", "sparkles", "violet", ["🆕"]),
  M("ai", "AI / บอท", "status", "🤖", "robot", "violet"),
  M("target", "เป้าหมาย", "status", "🎯", "target", "danger"),
  M("trophy", "รางวัล / ผลงาน", "status", "🏆", "trophy", "warning", ["🥇", "🏅"]),
  // ── เอกสาร & ข้อมูล ──
  M("receipt", "ใบเสร็จ / เอกสารขาย", "doc", "🧾", "receipt"),
  M("document", "เอกสาร", "doc", "📄", "file-text", undefined, ["📃"]),
  M("documents", "หลายเอกสาร / บิล", "doc", "📑", "files"),
  M("note", "บันทึก / ฟอร์ม", "doc", "📝", "notes", undefined, ["🗒️"]),
  M("history", "ประวัติ", "doc", "📜", "history"),
  M("guide", "คู่มือ / วิธีใช้", "doc", "📖", "book-2"),
  M("library", "คลัง / ทะเบียน", "doc", "📚", "books"),
  M("folder", "โฟลเดอร์", "doc", "📁", "folder"),
  M("folder-open", "เปิดโฟลเดอร์", "doc", "📂", "folder-open"),
  M("folders", "หมวด / บอร์ด", "doc", "🗂️", "folders"),
  M("cabinet", "แฟ้ม / แผนก", "doc", "🗃️", "archive"),
  M("chart", "แดชบอร์ด / สถิติ", "doc", "📊", "chart-bar", "accent"),
  M("trend-up", "ยอดขึ้น / สรุปยอด", "doc", "📈", "trending-up", "success"),
  M("trend-down", "ยอดลง", "doc", "📉", "trending-down", "danger"),
  M("calendar", "ปฏิทิน / วันที่", "doc", "📅", "calendar", undefined, ["🗓️", "📆"]),
  M("alarm", "เวลาเข้าออก", "doc", "⏰", "alarm"),
  M("clock", "เวลา", "doc", "🕐", "clock", undefined, ["⏱️", "⌚", "🕒"]),
  M("holiday", "วันหยุด", "doc", "🎌", "beach"),
  M("number", "เลขที่ / นับ", "doc", "🔢", "numbers"),
  M("puzzle", "ส่วนประกอบ / โมดูล", "doc", "🧩", "puzzle"),
  M("plugin", "ปลั๊กอิน", "doc", "🔌", "plug"),
  M("map", "แผนที่ / ผัง", "doc", "🗺️", "map"),
  M("home", "หน้าแรก", "doc", "🏠", "home"),
  M("web", "เว็บ / ออนไลน์", "doc", "🌐", "world"),
  M("mobile", "มือถือ / แอป", "doc", "📱", "device-mobile"),
  M("computer", "คอมพิวเตอร์", "doc", "💻", "device-laptop"),
  M("mail", "อีเมล", "doc", "📧", "mail", undefined, ["✉️", "📩"]),
  M("request", "คำขอ / ข้อความเข้า", "doc", "📨", "mail-forward"),
  M("chat", "แชท / ข้อความ", "doc", "💬", "message-circle"),
  M("phone", "โทรศัพท์", "doc", "📞", "phone", undefined, ["☎️"]),
  M("ads", "โฆษณา", "doc", "📢", "speakerphone"),
  M("campaign", "แคมเปญ", "doc", "📣", "ad"),
  M("image", "รูปภาพ", "doc", "🖼️", "photo"),
  M("camera", "กล้อง / สแกน", "doc", "📷", "camera", undefined, ["📸"]),
  M("video", "วิดีโอ", "doc", "🎬", "movie", undefined, ["🎥"]),
  M("design", "ออกแบบ / สี", "doc", "🎨", "palette", "violet"),
  M("bookmark", "บุ๊กมาร์ก", "doc", "🔖", "bookmark"),
  // ── สินค้า & ผลิต ──
  M("package", "สินค้า / พัสดุ", "goods", "📦", "package", "accent"),
  M("cart", "ซื้อ / ตะกร้า", "goods", "🛒", "shopping-cart", "accent"),
  M("bag", "ช้อปปิ้ง / ขอซื้อ", "goods", "🛍️", "shopping-bag", "accent", ["👜"]),
  M("basket", "ตะกร้า / กลุ่มสินค้า", "goods", "🧺", "basket", "accent"),
  M("tag", "ป้าย / SKU", "goods", "🏷️", "tag", "accent"),
  M("factory", "ผลิต / โรงงาน", "goods", "🏭", "building-factory"),
  M("warehouse", "คลังเก็บ / ชั้นวาง", "goods", "🗄️", "building-warehouse"),
  M("truck", "ขนส่ง / จ่ายงาน", "goods", "🚚", "truck", undefined, ["🚛"]),
  M("store", "ร้านค้า", "goods", "🏪", "building-store"),
  M("mall", "ช่องทางขาย / ห้าง", "goods", "🏬", "buildings"),
  M("cut", "ตัด", "goods", "✂️", "scissors"),
  M("thread", "ด้าย / วัสดุ", "goods", "🧵", "needle-thread"),
  M("safety-pin", "แพทเทิร์น / หมุด", "goods", "🧷", "needle"),
  M("measure", "สูตร / ขนาด", "goods", "📐", "ruler-measure"),
  M("ruler", "หน่วย / ความยาว", "goods", "📏", "ruler"),
  M("saw", "เจาะ / ทำรู", "goods", "🪚", "hammer"),
  M("toolbox", "งานผลิต / กล่องเครื่องมือ", "goods", "🧰", "tools"),
  M("build", "ศูนย์งาน / ก่อสร้าง", "goods", "🏗️", "crane"),
  M("bricks", "ข้อมูลตั้งต้น", "goods", "🧱", "wall"),
  M("dna", "ต้นแบบสินค้า", "goods", "🧬", "dna"),
  M("magnet", "กระดาน / ดึงดูด", "goods", "🧲", "magnet"),
  M("test", "ทดลอง", "goods", "🧪", "flask"),
  M("inspect", "ตรวจสอบ", "goods", "🔬", "microscope"),
  M("shirt", "เสื้อผ้า", "goods", "👕", "shirt", undefined, ["👗"]),
  M("diamond", "พิเศษ / พรีเมียม", "goods", "💎", "diamond", "violet", ["💠"]),
  M("gift", "ของขวัญ", "goods", "🎁", "gift", "danger"),
  M("flower", "รายการเสนอ / ดอกไม้", "goods", "🌸", "flower", "danger"),
  // ── เงิน ──
  M("money", "เงิน / ภาษี", "money", "💰", "moneybag", "success"),
  M("cash", "เงินสด / รับชำระ", "money", "💵", "cash-banknote", "success"),
  M("pay-out", "จ่ายเงิน / โอน", "money", "💸", "transfer-out", "success"),
  M("card", "บัตร / วงเงิน", "money", "💳", "credit-card", "success"),
  M("exchange", "เรทเงิน / แลกเปลี่ยน", "money", "💱", "arrows-exchange", "success"),
  M("yuan", "เงินหยวน / บิลจีน", "money", "💴", "currency-yuan", "success"),
  M("cashflow", "กระแสเงินสด", "money", "💧", "droplet", "success"),
  M("calc", "คำนวณ", "money", "🧮", "calculator"),
  M("bank", "ธนาคาร / หนี้", "money", "🏦", "building-bank"),
  M("coin", "เหรียญ", "money", "🪙", "coin", "success"),
  // ── คน & องค์กร ──
  M("user", "คน / ผู้ใช้", "people", "👤", "user"),
  M("users", "หลายคน / ทีม", "people", "👥", "users"),
  M("customer", "ลูกค้า", "people", "🧑‍💼", "user-star", undefined, ["👨‍💼", "👩‍💼"]),
  M("employee", "พนักงาน", "people", "🪪", "id"),
  M("partner", "คู่ค้า", "people", "🤝", "heart-handshake"),
  M("company", "บริษัท / ผู้ขาย", "people", "🏢", "building"),
  M("contacts", "สมุดรายชื่อ", "people", "📇", "address-book"),
];

// ── อีโมจิ → ความหมาย ──
/** ตัด variation selector (FE0F) + ช่องว่าง → เทียบอีโมจิได้ทั้งแบบมี/ไม่มี ️ */
export const normEmoji = (s: string): string => s.replace(/️/g, "").trim();

const MEANING_BY_KEY = new Map(ICON_MEANINGS.map((m) => [m.key, m]));
export const iconMeaning = (key: string): IconMeaning | null => MEANING_BY_KEY.get(key) ?? null;

const BASE_EMOJI_MAP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const m of ICON_MEANINGS) for (const e of [m.emoji, ...(m.alias ?? [])]) if (!map.has(normEmoji(e))) map.set(normEmoji(e), m.key);
  return map;
})();

// ── ค่าตั้งค่าที่แอดมินแก้ได้ (app_settings.icon_settings) ──
export interface CustomIcon {
  id: string;
  label: string;
  /** r2 key ของรูป (PNG พื้นใส — SVG ถูกแปลงเป็น PNG ก่อนอัป) */
  src: string;
  /** true = ระบายสีตามข้อความ (เหมาะกับไอคอนสีเดียว) · false = ใช้สีเดิมของรูป */
  tint: boolean;
}
export interface IconSettings {
  mode: IconMode;
  /** ความหมาย → ไอคอนที่เลือกแทนค่าเริ่มต้น ("i:<key>" / "c:<id>") */
  overrides: Record<string, string>;
  /** อีโมจิเพิ่มเติม → ความหมาย (แอดมินจับคู่เอง · ชนะตารางพื้นฐาน) */
  emojiMap: Record<string, string>;
  custom: CustomIcon[];
  /** ความหมาย → สีที่แอดมินตั้งเอง ("#rrggbb") · ตั้งแล้วโชว์ทั้งโหมดไอคอนเส้นและไอคอนเส้น+สี */
  colors: Record<string, string>;
}
export const DEFAULT_ICON_SETTINGS: IconSettings = { mode: "emoji", overrides: {}, emojiMap: {}, custom: [], colors: {} };

// ── สี ──
/** สีอัตโนมัติของแต่ละโทน (โหมด "ไอคอนเส้น + สี") · neutral = ตามตัวหนังสือ */
export const TONE_COLOR: Record<IconTone, string | null> = {
  neutral: null,
  accent: "#ea580c",
  success: "#059669",
  warning: "#f59e0b",
  danger: "#ef4444",
  violet: "#7c3aed",
};
/** สีให้เลือกเร็วในหน้าตั้งค่า (เลือกสีอื่นเองได้จากตัวเลือกสี) */
export const ICON_COLOR_SWATCHES: { hex: string; label: string }[] = [
  { hex: "#334155", label: "เทาเข้ม" }, { hex: "#94a3b8", label: "เทาอ่อน" }, { hex: "#ea580c", label: "ส้ม" },
  { hex: "#ef4444", label: "แดง" }, { hex: "#f59e0b", label: "เหลืองอำพัน" }, { hex: "#059669", label: "เขียว" },
  { hex: "#0d9488", label: "เขียวน้ำทะเล" }, { hex: "#0284c7", label: "ฟ้า" }, { hex: "#4f46e5", label: "คราม" },
  { hex: "#7c3aed", label: "ม่วง" }, { hex: "#db2777", label: "ชมพู" }, { hex: "#92400e", label: "น้ำตาล" },
];
const HEX_RE = /^#[0-9a-f]{6}$/;
/** สีเริ่มต้นของความหมายในโหมด "ไอคอนเส้น + สี" (null = ตามตัวหนังสือ) */
export const meaningDefaultColor = (m: IconMeaning): string | null => TONE_COLOR[m.tone ?? "neutral"];
/** สีที่ใช้จริงในโหมดนั้น — สีที่ตั้งเองชนะเสมอ · โหมดไอคอนเส้น = ไม่มีสีอัตโนมัติ */
export function meaningColor(m: IconMeaning, s: IconSettings, mode: IconMode = s.mode): string | null {
  if (mode === "emoji") return null;
  return s.colors[m.key] ?? (mode === "color" ? meaningDefaultColor(m) : null);
}

const R2_KEY_RE = /^[\w\-./%()]{1,200}$/;
const ICON_VALUE_RE = /^(i:[a-z0-9-]{1,40}|c:[a-z0-9]{1,24})$/;

/** ตรวจ/ทำความสะอาดค่าที่ส่งมาก่อนเก็บ (API) และค่าที่อ่านจาก DB (หน้าจอ) — ค่าแปลก ๆ ถูกทิ้ง */
export function cleanIconSettings(raw: unknown): IconSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode: IconMode = o.mode === "line" || o.mode === "color" ? o.mode : "emoji";
  const custom: CustomIcon[] = [];
  if (Array.isArray(o.custom))
    for (const c of o.custom.slice(0, 200)) {
      const x = (c ?? {}) as Record<string, unknown>;
      const id = String(x.id ?? "");
      const src = String(x.src ?? "");
      if (!/^[a-z0-9]{1,24}$/.test(id) || !R2_KEY_RE.test(src) || custom.some((y) => y.id === id)) continue;
      custom.push({ id, label: String(x.label ?? "").slice(0, 60), src, tint: x.tint !== false });
    }
  const overrides: Record<string, string> = {};
  if (o.overrides && typeof o.overrides === "object")
    for (const [k, v] of Object.entries(o.overrides as Record<string, unknown>)) {
      if (!MEANING_BY_KEY.has(k) || typeof v !== "string" || !ICON_VALUE_RE.test(v)) continue;
      if (v.startsWith("c:") && !custom.some((c) => c.id === v.slice(2))) continue;
      overrides[k] = v;
    }
  const emojiMap: Record<string, string> = {};
  if (o.emojiMap && typeof o.emojiMap === "object")
    for (const [e, k] of Object.entries(o.emojiMap as Record<string, unknown>)) {
      const ne = normEmoji(e);
      if (!ne || ne.length > 16 || typeof k !== "string" || !MEANING_BY_KEY.has(k)) continue;
      emojiMap[ne] = k;
    }
  const colors: Record<string, string> = {};
  if (o.colors && typeof o.colors === "object")
    for (const [k, v] of Object.entries(o.colors as Record<string, unknown>)) {
      const hex = typeof v === "string" ? v.trim().toLowerCase() : "";
      if (MEANING_BY_KEY.has(k) && HEX_RE.test(hex)) colors[k] = hex;
    }
  return { mode, overrides, emojiMap, custom, colors };
}

/** อีโมจินี้หมายถึงอะไร (ค่าที่แอดมินจับคู่เอง ชนะตารางพื้นฐาน) */
export function meaningOfEmoji(emoji: string, s: IconSettings): IconMeaning | null {
  const ne = normEmoji(emoji);
  if (!ne) return null;
  const key = s.emojiMap[ne] ?? BASE_EMOJI_MAP.get(ne);
  return key ? MEANING_BY_KEY.get(key) ?? null : null;
}

/** อีโมจิสำหรับโชว์ — ตัวที่ปกติเป็นตัวอักษรขาวดำ (✏ ⚙ ⚠) เติม FE0F กลับให้เป็นอีโมจิสี */
export const displayEmoji = (e: string): string =>
  /^\p{Extended_Pictographic}$/u.test(e) && !/\p{Emoji_Presentation}/u.test(e) ? `${e}️` : e;

/** อีโมจิทั้งหมดที่ชี้มาที่ความหมายนี้ (ตารางพื้นฐาน + ที่แอดมินจับคู่เพิ่ม) — แบบพร้อมโชว์ */
export function emojisOfMeaning(key: string, s: IconSettings): string[] {
  const out: string[] = [];
  for (const [e, k] of BASE_EMOJI_MAP) if (k === key && s.emojiMap[e] === undefined) out.push(displayEmoji(e));
  for (const [e, k] of Object.entries(s.emojiMap)) if (k === key) out.push(displayEmoji(e));
  return out;
}

// ── แปลงเป็นสิ่งที่ต้องวาด ──
export type ResolvedIcon =
  | { kind: "line"; d: string[]; color: string | null }
  | { kind: "img"; src: string; tint: boolean; color: string | null }
  | { kind: "text"; text: string }
  | null;

/** ค่าไอคอนตรง ๆ ("i:" / "c:" / "img:") → สิ่งที่วาด · ไม่ใช่รูปแบบนี้ = null */
function resolveIconValue(v: string, s: IconSettings, color: string | null): ResolvedIcon {
  if (v.startsWith("i:")) {
    const def = erpIconDef(v.slice(2)) ?? siteIconDef(v.slice(2));
    return def ? { kind: "line", d: def.d, color } : null;
  }
  if (v.startsWith("c:")) {
    const c = s.custom.find((x) => x.id === v.slice(2));
    return c ? { kind: "img", src: c.src, tint: c.tint, color } : null;
  }
  if (v.startsWith("img:")) {
    const key = v.slice(4);
    return R2_KEY_RE.test(key) ? { kind: "img", src: key, tint: false, color } : null;
  }
  return null;
}

/** ไอคอนที่ใช้จริงของความหมายนี้ในโหมดไอคอน (ที่แอดมินเลือก หรือค่าเริ่มต้น) */
export const meaningIconValue = (m: IconMeaning, s: IconSettings): string => s.overrides[m.key] ?? `i:${m.icon}`;

/**
 * ตัดสินว่าจะวาดอะไร
 *   name  = ชื่อความหมาย (โค้ดใหม่ใช้แบบนี้ เช่น name="save")
 *   value = ค่าที่เก็บไว้เดิม (อีโมจิในเมนู/DB หรือ "i:" / "c:" / "img:")
 * ค่า "i:"/"c:"/"img:" = ผู้ใช้เลือกไอคอนเจาะจงแล้ว → วาดตามนั้นทุกโหมด
 */
export function resolveIcon(input: { name?: string; value?: string | null }, s: IconSettings, mode: IconMode = s.mode): ResolvedIcon {
  const raw = (input.value ?? "").trim();
  if (raw) {
    const direct = resolveIconValue(raw, s, null);
    if (direct) return direct;
    if (/^(i|c|img):/.test(raw)) return null; // ค่าไอคอนที่หาไม่เจอ (ถูกลบ) — ไม่วาดดีกว่าโชว์รหัส
  }
  const m = input.name ? iconMeaning(input.name) : raw ? meaningOfEmoji(raw, s) : null;
  if (!m) return raw ? { kind: "text", text: raw } : null;
  if (mode === "emoji") return { kind: "text", text: raw || m.emoji };
  return resolveIconValue(meaningIconValue(m, s), s, meaningColor(m, s, mode)) ?? { kind: "text", text: raw || m.emoji };
}
