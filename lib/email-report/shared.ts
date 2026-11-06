/**
 * 📧 ส่งอีเมลรายงาน — ส่วนที่ใช้ร่วมกันทั้งหน้าจอและ API (ห้าม import ของฝั่งเซิร์ฟเวอร์ในไฟล์นี้)
 * ชนิดข้อมูล · ชื่อวัน · รายชื่อแหล่งข้อมูล · ตรวจค่าที่ส่งมาก่อนบันทึก (กฎเดียว ใช้ทั้ง 2 ฝั่ง)
 * doc: docs/email-reports.md
 */

export type EmailRecipient =
  | { type: "user"; id: string; name: string; email: string | null }
  | { type: "email"; email: string; /** ชื่อเรียก (จากสมุดอีเมลที่บันทึกไว้ · ไม่บังคับ) */ name?: string | null };

export type BrandGroupFilter = "all" | "customer" | "own";

export type EmailReportFilters = {
  /** design_sheets_pending: กลุ่มแบรนด์ (ทุกแบรนด์ / งานลูกค้า / แบรนด์เรา) */
  brand_group?: BrandGroupFilter;
  /** เฉพาะแบรนด์ที่เลือก (ว่าง = ทุกแบรนด์ในกลุ่ม) */
  brand_ids?: string[];
  /** เฉพาะสถานะที่เลือก (ว่าง = ทุกสถานะที่ยังไม่ปิด) */
  statuses?: string[];
  /** ช่วงของยอด: เมื่อวาน (ค่าเริ่มต้น) · วันนี้ถึงเวลาที่ส่ง · 7 วันล่าสุด (ถึงเมื่อวาน) · เดือนที่แล้วทั้งเดือน (ส่งวันที่ 1 ของเดือน) */
  day?: ReportPeriod;
};

export type ReportPeriod = "yesterday" | "today" | "last7" | "last_month";
export const REPORT_PERIODS: { key: ReportPeriod; label: string; hint: string }[] = [
  { key: "yesterday", label: "เมื่อวาน (ทั้งวัน)", hint: "ส่งทุกเช้า เทียบกับวันก่อนหน้า" },
  { key: "today", label: "วันนี้ (ถึงเวลาที่ส่ง)", hint: "ส่งตอนเย็น ดูยอดระหว่างวัน" },
  { key: "last7", label: "7 วันล่าสุด", hint: "เหมาะส่งทุกวันจันทร์ · เทียบกับ 7 วันก่อนหน้า" },
  { key: "last_month", label: "เดือนที่แล้ว (ทั้งเดือน)", hint: "ส่งวันที่ 1 ของทุกเดือน · เทียบกับเดือนก่อนหน้า" },
];
export const isReportPeriod = (v: unknown): v is ReportPeriod => REPORT_PERIODS.some((p) => p.key === v);

export type EmailReportOptions = {
  /** โชว์ในอีเมลสูงสุดกี่แถว (ที่เหลือ = ลิงก์ "ดูทั้งหมด") */
  max_rows?: number;
  /** ไม่ขยับเกินกี่วัน = เตือนสีส้ม */
  stale_days?: number;
  /** เหลือไม่เกินกี่วันถึงกำหนด = ป้าย "ใกล้กำหนด" */
  due_soon_days?: number;
  /** จัดกลุ่มตาม (key จาก groupBy ของแหล่งข้อมูล) */
  group_by?: string;
  /** เรียงงานตาม (key จาก sortBy ของแหล่งข้อมูล) */
  sort_by?: string;
  /** ส่งเฉพาะงานที่มีป้ายเตือน (เกิน/ใกล้กำหนด/ไม่ขยับนาน) */
  only_flagged?: boolean;
  /** ตัวเลขสรุปด้านบน (key จาก stats ของแหล่งข้อมูล · เรียงตามรายการของแหล่งข้อมูล) */
  stats?: string[];
  /** ข้อมูลของแต่ละงาน เรียงตามลำดับที่เลือก (key จาก rowFields ของแหล่งข้อมูล) */
  row_fields?: string[];
  /** หัวเรื่องอีเมล (ว่าง = แบบเดิม) ใส่ {จำนวน} {วันที่} ฯลฯ ได้ */
  subject_template?: string;
  /** ข้อความเกริ่นบนสุดของอีเมล (ไม่บังคับ) */
  intro?: string;
  /** 🧮 แบบตาราง: แถวรวมท้ายตาราง */
  show_total?: boolean;
  /** 🖼 อีเมล: แถบ "ขายดี" รูปใหญ่เหนือตาราง กี่อันดับ (0 = ไม่มี) — ใช้กับแหล่งที่มี spotlight */
  top_photos?: number;
  /** 📎 อีเมล: แนบไฟล์ Excel รายการทั้งหมด — ใช้กับแหล่งที่มี export */
  attach_excel?: boolean;
  /** 🧮 ชื่อสินค้าแบบสั้น (ตัดชื่อแบรนด์/รหัสท้าย เหลือบรรทัดเดียว) */
  short_names?: boolean;
  /** 🧮 ขนาดรูปในตารางอีเมล */
  img_size?: "s" | "m" | "l";
  /** 🧮 ซ่อนแถวที่ยังไม่จับคู่ SKU (ยังนับในยอดรวม) */
  hide_unmatched?: boolean;
  /** 🧮 ชื่อหัวคอลัมน์ที่ตั้งเอง (key คอลัมน์ → ชื่อ · ว่าง = ชื่อเดิม) */
  col_labels?: Record<string, string>;
  /** 🎯 เป้ายอดขายต่อเดือน (บาท · 0 = ไม่ตั้ง) — ตัวเลข "ยอดสะสมเดือนนี้" บอก % ของเป้า */
  monthly_target?: number;
  /** ⚠️ เตือนของขายดีใกล้หมด: สต๊อกเหลือไม่เกินกี่ชิ้น (0 = ปิด) */
  low_stock?: number;
};
export const IMG_SIZE_PX: Record<"s" | "m" | "l", number> = { s: 28, m: 40, l: 56 };
export const LOW_STOCK_CHOICES = [0, 3, 5, 10];
export const TOP_PHOTO_CHOICES = [0, 3];
/** ตัวเลือกที่เติมค่าเริ่มต้นครบแล้ว (ใช้ตอนประกอบอีเมล) */
export type ResolvedReportOptions = Required<EmailReportOptions>;

export type EmailReport = {
  id: string;
  name: string;
  source_key: string;
  filters: EmailReportFilters;
  options: EmailReportOptions;
  days: number[];            // 1=จันทร์ … 7=อาทิตย์
  send_time: string;         // "HH:MM" เวลาไทย
  recipients: EmailRecipient[];
  /** ✉️ รายงานนี้ส่งอีเมลไหม (สวิตช์รายรายงาน · ทั้งระบบ = ReportChannels.email) */
  email_enabled: boolean;
  /** 💬 ส่งเข้า Discord ด้วย (normalizeReportDiscord) */
  discord: EmailReportDiscord;
  /** 🔔 เด้งป๊อปตอนเข้า ERP (normalizeReportPopup) */
  popup: EmailReportPopup;
  /** 🟢 ส่งเข้ากลุ่ม LINE (normalizeReportLine) */
  line: EmailReportLine;
  skip_if_empty: boolean;
  is_enabled: boolean;
  last_sent_on: string | null;
  created_at: string;
  updated_at: string;
};

/** 🔌 สวิตช์ช่องทางทั้งระบบ (ตาราง erp_report_channels แถวเดียว) — ปิดช่องไหน ทุกรายงานหยุดใช้ช่องนั้น · lib/email-report/channels */
export type ReportChannelKey = "email" | "line" | "discord" | "popup";
export type ReportChannels = Record<ReportChannelKey, boolean>;
export const REPORT_CHANNELS: { key: ReportChannelKey; icon: string; label: string; hint: string }[] = [
  { key: "email", icon: "✉️", label: "Gmail", hint: "ผู้รับ · หัวเรื่อง · ข้อความเกริ่น" },
  { key: "line", icon: "🟢", label: "LINE", hint: "กลุ่ม · หน้าตา · นับโควตาตามจำนวนคนในกลุ่ม" },
  { key: "discord", icon: "💬", label: "Discord", hint: "ห้อง · แท็ก · การ์ดติ๊ก" },
  { key: "popup", icon: "🔔", label: "ERP ป๊อป", hint: "ใครเห็น · ช่วงเวลา · รับทราบ" },
];
export function normalizeReportChannels(raw: unknown): ReportChannels {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { email: o.email !== false, line: o.line !== false, discord: o.discord !== false, popup: o.popup !== false };
}
/** รายงานนี้เปิดช่องไหนไว้บ้าง (สวิตช์รายรายงาน — ยังไม่รวมสวิตช์ทั้งระบบ) */
export const reportChannelOn = (r: Pick<EmailReport, "email_enabled" | "discord" | "popup"> & { line?: EmailReportLine | null }, k: ReportChannelKey) =>
  k === "email" ? r.email_enabled !== false : k === "line" ? !!r.line?.enabled : k === "discord" ? !!r.discord?.enabled : !!r.popup?.enabled;

/**
 * 🟢 ส่งเข้ากลุ่ม LINE (บอทตัวเดียวกับระบบแจ้งเตือน LINE อื่น ๆ ของ ERP) — lib/email-report/line
 * ส่งเป็น "กล่องเดียว" (Flex 1 ข้อความ) ต่อครั้ง เพราะ LINE ฟรีนับโควตาต่อข้อความ (300/เดือน ใช้ร่วมทั้ง ERP)
 */
export type EmailReportLine = {
  enabled: boolean;
  /** id กลุ่ม LINE (ขึ้นต้น C) */
  group_id: string | null;
  group_name: string | null;
  /** โชว์ในกล่องกี่อันดับ/งาน (ที่เหลือ = ปุ่ม "ดูทั้งหมดใน ERP") · แบบการ์ด = จำนวนการ์ดสินค้า */
  max_rows: number;
  /** cards = การ์ดสรุป + การ์ดสินค้ารูปใหญ่ปัดดู (แหล่งที่มี spotlight) · list = กล่องเดียวรายการสั้น */
  style: "cards" | "list";
};
export const LINE_MAX_ROW_CHOICES = [3, 5, 8, 10];
/** แบบการ์ด: การ์ดสินค้าสูงสุด (LINE ให้ 12 การ์ดต่อข้อความ — เผื่อการ์ดสรุป 1) */
export const LINE_CARD_CHOICES = [3, 5, 9];
const LINE_GROUP_ID = /^C[0-9a-f]{32}$/;
export function normalizeReportLine(raw: unknown): EmailReportLine {
  const o = (raw ?? {}) as Record<string, unknown>;
  const group_id = typeof o.group_id === "string" && LINE_GROUP_ID.test(o.group_id) ? o.group_id : null;
  const n = Math.round(Number(o.max_rows));
  return {
    enabled: o.enabled === true && !!group_id,
    group_id, group_name: group_id && typeof o.group_name === "string" && o.group_name.trim() ? o.group_name.trim().slice(0, 100) : null,
    max_rows: Number.isFinite(n) && n >= 1 ? Math.min(10, n) : 5,
    style: o.style === "list" ? "list" : "cards",
  };
}

/** ส่งเข้าห้อง Discord: ข้อความภาพรวม + รูปรายงาน + การ์ดเฉพาะใบที่มีเช็กลิสต์ค้าง (ปุ่มติ๊ก) — docs/discord-setup.md */
export type EmailReportDiscord = {
  enabled: boolean;
  channel_id: string | null;
  channel_name: string | null;
  /** แท็กบทบาท (เช่น @ทีมออกแบบ) */
  role_id: string | null;
  role_name: string | null;
  /** แท็กเมื่อไหร่: มีงานเกินกำหนด / ทุกครั้ง / ไม่แท็ก */
  mention: "overdue" | "always" | "never";
  /** จำนวนงานในรูปรายงาน */
  image_rows: number;
  /** การ์ด "ต้องติ๊ก" สูงสุดกี่ใบ (0 = ไม่ส่งการ์ด) */
  max_cards: number;
  /** รูปที่ส่ง (แหล่งที่มี spotlight): grid = กริดรูปสินค้าขายดี 3×3 · table = รูปตาราง */
  look: "grid" | "table";
  /** 📎 แนบไฟล์ Excel รายการทั้งหมด (แหล่งที่มี export) */
  attach_excel: boolean;
};
export const DISCORD_MENTION_LABEL: Record<EmailReportDiscord["mention"], string> = { overdue: "เมื่อมีงานเกินกำหนด", always: "ทุกครั้ง", never: "ไม่แท็ก" };
const SNOWFLAKE = /^\d{15,25}$/;

/** เด้งป๊อปตอนเข้า ERP — เนื้อหาจากรายงานเดียวกัน · "งานของคุณ" (ข้อที่ใส่ชื่อคนนั้น) ขึ้นก่อน — lib/email-report/popup */
export type EmailReportPopup = {
  enabled: boolean;
  /** ตำแหน่ง (erp_roles.key) ที่เห็นป๊อป */
  roles: string[];
  /** รายคนเพิ่ม */
  users: { id: string; name: string }[];
  /** ช่วงเวลาที่เด้ง (เวลาไทย "HH:MM") · วัน = วันส่งของรายงาน */
  from: string;
  to: string;
  /** daily = วันละครั้ง (กดรับทราบแล้ววันนั้นไม่เด้งอีก) · every = ทุกครั้งที่เปิด ERP */
  frequency: "daily" | "every";
  /** เด้งเฉพาะวันที่มีงานด่วน / ใกล้ครบ / ของรอ */
  only_alert: boolean;
  /** ต้องกด "รับทราบ" (กดนอกกล่องปิดไม่ได้) */
  require_ack: boolean;
  /** ผู้รับผิดชอบข้อที่ค้างเห็นป๊อป (เฉพาะงานของตัวเอง) แม้ไม่อยู่ในตำแหน่งที่เลือก */
  assignees: boolean;
  /** โชว์อะไรในแต่ละงาน (POPUP_FIELDS · เรียงตามรายการกลาง) */
  fields: PopupFieldKey[];
  /** ด้านบนป๊อป: ตัวเลขสรุป · แยก "งานของคุณ" ขึ้นก่อน */
  show_stats: boolean;
  show_mine: boolean;
  /** ใครติ๊กของรอในป๊อปได้: edit = ทุกคนที่แก้ใบงานได้ (products.edit) · own = เฉพาะผู้รับผิดชอบข้อนั้น */
  tick: "edit" | "own";
  /** โชว์ "ต้องตามวันนี้" สูงสุดกี่งาน */
  max_items: number;
};
/** ข้อมูลที่เลือกโชว์ได้ในแต่ละงานของป๊อป — ค่าเริ่มต้นตามที่เจ้าของเลือก (2026-10-24) */
export const POPUP_FIELDS = [
  { key: "img", label: "รูปปก" }, { key: "code", label: "รหัสใบงาน" }, { key: "brand", label: "แบรนด์" }, { key: "status", label: "สถานะ" },
  { key: "due", label: "กำหนดส่ง" }, { key: "flag", label: "ป้ายเตือน" }, { key: "wait", label: "ของรอ (ติ๊กได้)" }, { key: "who", label: "ชื่อผู้รับผิดชอบ" },
  { key: "note", label: "โน้ต" },
] as const;
export type PopupFieldKey = (typeof POPUP_FIELDS)[number]["key"];
export const DEFAULT_POPUP_FIELDS: PopupFieldKey[] = ["img", "code", "flag", "wait", "who"];
export const POPUP_MAX_CHOICES = [5, 8, 12];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function normalizeReportPopup(raw: unknown): EmailReportPopup {
  const o = (raw ?? {}) as Record<string, unknown>;
  const hm = (v: unknown, d: string) => { const s = String(v ?? "").slice(0, 5); return HM.test(s) || s === "24:00" ? s : d; };
  const roles = Array.isArray(o.roles) ? [...new Set(o.roles.filter((k): k is string => typeof k === "string" && /^[A-Za-z0-9_]{1,40}$/.test(k)))].slice(0, 20) : [];
  const users: { id: string; name: string }[] = [];
  for (const x of Array.isArray(o.users) ? o.users : []) {
    const u = (x ?? {}) as Record<string, unknown>;
    if (typeof u.id === "string" && /^[0-9a-f-]{36}$/i.test(u.id) && !users.some((y) => y.id === u.id)) users.push({ id: u.id, name: String(u.name ?? "").slice(0, 120) });
  }
  const from = hm(o.from, "08:00"); let to = hm(o.to, "12:00");
  if (to <= from) to = "24:00";
  const known = POPUP_FIELDS.map((f) => f.key as PopupFieldKey);
  const fields = Array.isArray(o.fields) ? known.filter((k) => (o.fields as unknown[]).includes(k)) : DEFAULT_POPUP_FIELDS;   // เรียงตามรายการกลาง
  const max = Math.round(Number(o.max_items));
  return {
    enabled: o.enabled === true, roles, users: users.slice(0, 50), from, to,
    frequency: o.frequency === "every" ? "every" : "daily",
    only_alert: o.only_alert !== false, require_ack: o.require_ack !== false, assignees: o.assignees !== false,
    fields, show_stats: o.show_stats !== false, show_mine: o.show_mine !== false,
    tick: o.tick === "own" ? "own" : "edit",
    max_items: Number.isFinite(max) && max >= 1 ? Math.min(20, max) : 8,
  };
}
export function normalizeReportDiscord(raw: unknown): EmailReportDiscord {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" && SNOWFLAKE.test(v) ? v : null);
  const name = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);
  const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return v !== undefined && v !== null && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const channel_id = id(o.channel_id); const role_id = id(o.role_id);
  return {
    enabled: o.enabled === true && !!channel_id,
    channel_id, channel_name: channel_id ? name(o.channel_name) : null,
    role_id, role_name: role_id ? name(o.role_name) : null,
    mention: o.mention === "always" || o.mention === "never" ? o.mention : "overdue",
    image_rows: clamp(o.image_rows, 5, 25, 10),
    max_cards: clamp(o.max_cards, 0, 15, 10),
    look: o.look === "table" ? "table" : "grid",
    attach_excel: o.attach_excel !== false,
  };
}

export type EmailReportRun = {
  id: string;
  report_id: string;
  report_name?: string | null;
  ran_at: string;
  trigger: "schedule" | "test" | "manual";
  status: "sent" | "partial" | "failed" | "skipped_empty" | "not_configured" | "channel_off";
  item_count: number | null;
  recipient_count: number | null;
  sent_count: number | null;
  error: string | null;
  actor_name: string | null;
};

/** ค่าที่ฟอร์มส่งมา (ยังไม่มี id/เวลา) */
export type EmailReportInput = Pick<EmailReport, "name" | "source_key" | "filters" | "options" | "days" | "send_time" | "recipients" | "email_enabled" | "discord" | "popup" | "line" | "skip_if_empty" | "is_enabled">;

// ---- แหล่งข้อมูล (เพิ่มรายงานแบบใหม่ = เพิ่มที่นี่ + ตัวดึงข้อมูลใน lib/email-report/sources.ts) ----
// แต่ละแหล่งประกาศเองว่า "เลือกโชว์อะไรได้บ้าง" — หน้าตั้งค่าอ่านจากที่นี่ ส่วนที่ติ๊ก/ลำดับเก็บใน email_reports.options
export type ReportChoice = { key: string; label: string };
export type EmailReportSourceDef = {
  key: string;
  label: string;
  description: string;
  /** ข้อมูลของแต่ละงานที่เลือกโชว์ได้ (ชื่องานโชว์เสมอ ไม่อยู่ในรายการ) */
  rowFields: ReportChoice[];
  defaultRowFields: string[];
  /** ตัวเลขสรุปด้านบน · {stale_days} ในชื่อ = ค่าที่ตั้ง */
  stats: ReportChoice[];
  defaultStats: string[];
  /** ตัวแรก = ค่าเริ่มต้น */
  groupBy: ReportChoice[];
  sortBy: ReportChoice[];
  /** คำที่ใส่ในหัวเรื่องได้ {key} (นอกจาก {วันที่} {ชื่อรายงาน} ที่ใช้ได้ทุกแหล่ง) */
  subjectTokens: ReportChoice[];
  /** หัวเรื่องแบบเดิม (โชว์เป็นตัวอย่างในช่อง · ว่าง = ใช้แบบนี้) */
  defaultSubject: string;
  /** ตัวกรองที่หน้าตั้งค่าโชว์ (brand = กลุ่มแบรนด์/แบรนด์ · status = สถานะใบงาน · day = ยอดของเมื่อวาน/วันนี้) · ว่าง = ไม่มีตัวกรอง */
  filterUi: ("brand" | "status" | "day")[];
  /** หน้าตา: list = รายการงาน (ค่าเริ่มต้น) · table = ตาราง (rowFields = คอลัมน์ · มีแถวรวม) — lib/email-report/render ReportTable */
  layout?: "list" | "table";
  /** ช่องทางที่แหล่งนี้รองรับ (ไม่ใส่ = ทุกช่อง) เช่น รายงานยอดขายยังไม่ทำป๊อป */
  channels?: ReportChannelKey[];
  /** รายงานใหม่ที่เลือกแหล่งนี้ → ตั้งวัน/เวลาส่งให้ก่อน (แก้ได้) */
  defaultDays?: number[];
  defaultTime?: string;
};

export const EMAIL_REPORT_SOURCES: EmailReportSourceDef[] = [
  {
    key: "design_sheets_pending", label: "ใบงานออกแบบที่ค้าง", description: "ใบงานที่ยังไม่ถึงสถานะปิดงาน แยกตามสถานะ พร้อมรูปปก",
    rowFields: [
      { key: "cover", label: "รูปปก" }, { key: "code", label: "รหัสใบงาน" }, { key: "brand", label: "แบรนด์" },
      { key: "status", label: "สถานะ" }, { key: "deadline", label: "กำหนดส่ง" }, { key: "order_date", label: "วันที่สั่ง" },
      { key: "creator", label: "ผู้สร้างใบงาน" }, { key: "waiting_for", label: "รออะไรอยู่" }, { key: "note", label: "โน้ต" },
      { key: "detail", label: "รายละเอียดสั้น" }, { key: "flag", label: "ป้ายเตือน (เกิน/ใกล้กำหนด/ไม่ขยับ)" }, { key: "open", label: "ปุ่ม \"เปิดใบงาน\"" },
    ],
    defaultRowFields: ["cover", "code", "brand", "deadline", "note", "flag", "open"],
    stats: [
      { key: "total", label: "ค้างทั้งหมด" }, { key: "overdue", label: "เกินกำหนด" }, { key: "due_soon", label: "ใกล้กำหนด" },
      { key: "stale", label: "ไม่ขยับเกิน {stale_days} วัน" }, { key: "fresh", label: "อัปเดตวันนี้" }, { key: "by_status", label: "แยกตามสถานะ" },
    ],
    defaultStats: ["total", "overdue", "stale"],
    groupBy: [{ key: "status", label: "สถานะ" }, { key: "brand", label: "แบรนด์" }, { key: "none", label: "ไม่จัดกลุ่ม" }],
    sortBy: [
      { key: "urgent", label: "ด่วนก่อน (เกิน/ใกล้กำหนด → ไม่ขยับนาน)" }, { key: "stale", label: "ไม่ขยับนานสุดก่อน" },
      { key: "deadline", label: "กำหนดส่งใกล้สุดก่อน" }, { key: "newest", label: "ใบงานใหม่สุดก่อน" },
    ],
    subjectTokens: [
      { key: "จำนวน", label: "จำนวนงาน" }, { key: "เกินกำหนด", label: "เกินกำหนดกี่งาน" },
      { key: "ใกล้กำหนด", label: "ใกล้กำหนดกี่งาน" }, { key: "ไม่ขยับ", label: "ไม่ขยับนานกี่งาน" },
    ],
    defaultSubject: "งานออกแบบที่ค้าง {จำนวน} งาน · {วันที่}",
    filterUi: ["brand", "status"],
  },
  {
    key: "team_plan_weekly", label: "สรุปแผนงานทีม (รายสัปดาห์)",
    description: "เสร็จกี่งานใน 7 วัน · ค้างกี่งาน · เกินกำหนด / รอคนอื่น อะไรบ้าง ของใคร — เหมาะตั้งส่งทุกวันศุกร์เย็น (docs/team-plan.md)",
    rowFields: [
      { key: "who", label: "ผู้รับผิดชอบ" }, { key: "priority", label: "ความด่วน" }, { key: "due", label: "กำหนด" },
      { key: "waiting", label: "รอคนอื่น (รออะไร)" }, { key: "note", label: "โน้ต" }, { key: "source", label: "มาจาก (ใบงาน/SKU/โพสต์)" },
      { key: "flag", label: "ป้าย (เกิน/ใกล้กำหนด/รอ/เสร็จ)" }, { key: "open", label: "ปุ่ม \"เปิดงาน\"" },
    ],
    defaultRowFields: ["who", "due", "waiting", "flag", "open"],
    stats: [
      { key: "done_week", label: "เสร็จใน 7 วัน" }, { key: "open", label: "ค้างทั้งหมด" }, { key: "overdue", label: "เกินกำหนด" },
      { key: "waiting", label: "รอคนอื่น" }, { key: "due_soon", label: "ใกล้กำหนด" }, { key: "stale", label: "ไม่ขยับเกิน {stale_days} วัน" },
      { key: "by_person", label: "แยกตามคน" },
    ],
    defaultStats: ["done_week", "open", "overdue", "waiting", "by_person"],
    groupBy: [{ key: "status", label: "สถานะ (เกิน/รอ/ค้าง/เสร็จ)" }, { key: "person", label: "คนรับผิดชอบ" }, { key: "priority", label: "ความด่วน" }, { key: "none", label: "ไม่จัดกลุ่ม" }],
    sortBy: [{ key: "urgent", label: "ด่วนก่อน (เกิน/ใกล้กำหนด → ความด่วน)" }, { key: "due", label: "กำหนดใกล้สุดก่อน" }, { key: "newest", label: "งานใหม่สุดก่อน" }],
    subjectTokens: [
      { key: "จำนวน", label: "งานค้าง" }, { key: "เสร็จ", label: "เสร็จใน 7 วัน" },
      { key: "เกินกำหนด", label: "เกินกำหนดกี่งาน" }, { key: "รอ", label: "รอคนอื่นกี่งาน" },
    ],
    defaultSubject: "สรุปแผนงานทีม · เสร็จ {เสร็จ} · ค้าง {จำนวน} · {วันที่}",
    filterUi: [],
    defaultDays: [5], defaultTime: "17:00",
  },
  {
    key: "platform_sales_daily", label: "ยอดขายแพลตฟอร์ม (Shopee / Lazada) — รายวัน / 7 วัน / รายเดือน",
    description: "สินค้าที่ขายได้ + ยอด เทียบช่วงก่อนหน้า (ออเดอร์จากเมลแพลตฟอร์ม/ไฟล์) — เลือกช่วงได้: เมื่อวาน / วันนี้ / 7 วัน / เดือนที่แล้ว · จัดกลุ่มตาม Parent SKU ได้ · docs/platform-email-orders.md",
    rowFields: [
      { key: "img", label: "รูป" }, { key: "code", label: "รหัส" }, { key: "name", label: "สินค้า" }, { key: "color", label: "สี" },
      { key: "shop", label: "ร้าน" }, { key: "qty", label: "จำนวน" }, { key: "amt", label: "ยอด" }, { key: "pct", label: "% ของยอด" },
      { key: "diff", label: "เทียบช่วงก่อน" }, { key: "stock", label: "สต๊อกเหลือ" },
    ],
    defaultRowFields: ["img", "code", "name", "color", "qty", "amt", "diff"],
    stats: [
      { key: "orders", label: "ออเดอร์" }, { key: "qty", label: "ชิ้น" }, { key: "amount", label: "ยอดขาย" }, { key: "mtd", label: "ยอดสะสมเดือนนี้ (+ เป้า)" },
      { key: "aov", label: "เฉลี่ยต่อออเดอร์" }, { key: "cancelled", label: "ยกเลิก" },
      { key: "lazada", label: "Lazada (ไม่มีราคา)" }, { key: "pending", label: "สินค้ารอยืนยัน SKU" },
    ],
    defaultStats: ["orders", "qty", "amount", "mtd"],
    groupBy: [
      { key: "none", label: "รวม" }, { key: "parent", label: "ตาม Parent SKU (โชว์ SKU ในกลุ่ม)" }, { key: "model", label: "รวมทุกสีเป็นรุ่น (แถวเดียว)" },
      { key: "platform", label: "แยกตามแพลตฟอร์ม" }, { key: "shop", label: "แยกตามร้าน" },
    ],
    sortBy: [{ key: "amount", label: "ยอดเงินมากสุดก่อน" }, { key: "qty", label: "จำนวนมากสุดก่อน" }, { key: "code", label: "รหัส ก→ฮ" }],
    subjectTokens: [
      { key: "วันของยอด", label: "วันที่ของยอด" }, { key: "ยอด", label: "ยอดขาย (บาท)" },
      { key: "ออเดอร์", label: "จำนวนออเดอร์" }, { key: "ชิ้น", label: "จำนวนชิ้น" },
    ],
    defaultSubject: "ยอดขายแพลตฟอร์ม {วันของยอด} · ฿{ยอด}",
    filterUi: ["day"],
    layout: "table",
    channels: ["email", "line", "discord"],
    defaultDays: [1, 2, 3, 4, 5, 6, 7], defaultTime: "09:00",
  },
];
/** ช่องทางที่แหล่งข้อมูลนี้รองรับ (เรียงตาม REPORT_CHANNELS) */
export const sourceChannels = (key: string) => {
  const allowed = sourceDef(key).channels;
  return REPORT_CHANNELS.filter((c) => !allowed || allowed.includes(c.key));
};
export const sourceLabel = (key: string) => EMAIL_REPORT_SOURCES.find((s) => s.key === key)?.label ?? key;
export const sourceDef = (key: string): EmailReportSourceDef => EMAIL_REPORT_SOURCES.find((s) => s.key === key) ?? EMAIL_REPORT_SOURCES[0];
/** คำในหัวเรื่องที่ใช้ได้ทุกแหล่ง */
export const COMMON_SUBJECT_TOKENS: ReportChoice[] = [{ key: "วันที่", label: "วันที่ส่ง" }, { key: "ชื่อรายงาน", label: "ชื่อรายงาน" }];
export const SUBJECT_MAX = 150;
export const INTRO_MAX = 500;

/** เติมค่าเริ่มต้น + ตัดค่าที่แหล่งข้อมูลไม่รู้จัก — ใช้ทั้งตอนบันทึก (ฟอร์ม/API) และตอนประกอบอีเมลจากค่าใน DB
 *  รายงานเก่าที่มีแค่ max_rows/stale_days → ได้หน้าตาเดิมทุกอย่าง */
export function normalizeReportOptions(sourceKey: string, raw: unknown): ResolvedReportOptions {
  const src = sourceDef(sourceKey);
  const o = (raw ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return v !== undefined && v !== null && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const one = (v: unknown, list: ReportChoice[]) => (typeof v === "string" && list.some((c) => c.key === v) ? v : list[0]?.key ?? "");
  const known = (v: unknown, list: ReportChoice[]) => [...new Set((v as unknown[]).filter((k): k is string => typeof k === "string" && list.some((c) => c.key === k)))];
  const statsPicked = Array.isArray(o.stats) ? known(o.stats, src.stats) : src.defaultStats;
  return {
    // แบบตาราง ส่งครบทุกรายการได้ (ถึง 500) · แบบรายการงาน ≤100
    max_rows: clamp(o.max_rows, 5, src.layout === "table" ? 500 : 100, src.layout === "table" ? 500 : 50),
    stale_days: clamp(o.stale_days, 1, 60, 7),
    due_soon_days: clamp(o.due_soon_days, 0, 30, 3),
    group_by: one(o.group_by, src.groupBy),
    sort_by: one(o.sort_by, src.sortBy),
    only_flagged: o.only_flagged === true,
    stats: src.stats.map((c) => c.key).filter((k) => statsPicked.includes(k)),   // เรียงตามรายการของแหล่งข้อมูล
    row_fields: Array.isArray(o.row_fields) ? known(o.row_fields, src.rowFields) : [...src.defaultRowFields],
    // หัวเรื่องห้ามมีขึ้นบรรทัด (กันแทรกหัวอีเมล) · ข้อความเกริ่นขึ้นบรรทัดได้
    subject_template: String(o.subject_template ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, SUBJECT_MAX),
    intro: String(o.intro ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, INTRO_MAX),
    show_total: o.show_total !== false,
    top_photos: src.layout === "table" ? (TOP_PHOTO_CHOICES.includes(Number(o.top_photos)) ? Number(o.top_photos) : 3) : 0,
    attach_excel: src.layout === "table" ? o.attach_excel !== false : false,
    short_names: src.layout === "table" ? o.short_names !== false : false,
    img_size: o.img_size === "s" || o.img_size === "l" ? o.img_size : "m",
    hide_unmatched: o.hide_unmatched === true,
    col_labels: cleanColLabels(o.col_labels, src.rowFields),
    monthly_target: clamp(o.monthly_target, 0, 1_000_000_000, 0),
    low_stock: LOW_STOCK_CHOICES.includes(Number(o.low_stock)) ? Number(o.low_stock) : 3,
  };
}

/** ชื่อหัวคอลัมน์ที่ตั้งเอง — เฉพาะคอลัมน์ที่มีจริง · ตัดอักขระควบคุม · ≤30 ตัวอักษร */
function cleanColLabels(raw: unknown, fields: ReportChoice[]): Record<string, string> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = typeof o[f.key] === "string" ? (o[f.key] as string).replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 30) : "";
    if (v && v !== f.label) out[f.key] = v;
  }
  return out;
}

// ---- วัน / เวลา ----
export const DAY_LABELS: { n: number; short: string; full: string }[] = [
  { n: 1, short: "จ", full: "จันทร์" }, { n: 2, short: "อ", full: "อังคาร" }, { n: 3, short: "พ", full: "พุธ" },
  { n: 4, short: "พฤ", full: "พฤหัสบดี" }, { n: 5, short: "ศ", full: "ศุกร์" }, { n: 6, short: "ส", full: "เสาร์" },
  { n: 7, short: "อา", full: "อาทิตย์" },
];
export const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

/** "จ–ส" / "จ, พ, ศ" / "ทุกวัน" — สรุปวันส่งเป็นภาษาคน */
export function describeDays(days: number[]): string {
  const ds = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (ds.length === 0) return "ยังไม่เลือกวัน";
  if (ds.length === 7) return "ทุกวัน";
  const short = (n: number) => DAY_LABELS[n - 1].short;
  const consecutive = ds.every((d, i) => i === 0 || d === ds[i - 1] + 1);
  if (consecutive && ds.length >= 3) return `${short(ds[0])}–${short(ds[ds.length - 1])}`;
  return ds.map(short).join(", ");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ตรวจ + ทำความสะอาดค่าจากฟอร์ม → { value } หรือ { error } (ข้อความภาษาคน) */
export function normalizeReportInput(raw: unknown): { value: EmailReportInput } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  if (!name) return { error: "ตั้งชื่อรายงานก่อน" };
  if (name.length > 120) return { error: "ชื่อรายงานยาวเกินไป (ไม่เกิน 120 ตัวอักษร)" };
  const source_key = String(r.source_key ?? "");
  if (!EMAIL_REPORT_SOURCES.some((s) => s.key === source_key)) return { error: "เลือกข้อมูลที่จะส่งก่อน" };

  const days = Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b) : [];
  if (days.length === 0) return { error: "เลือกวันส่งอย่างน้อย 1 วัน" };
  const send_time = String(r.send_time ?? "").slice(0, 5);
  if (!TIME_RE.test(send_time)) return { error: "เวลาส่งไม่ถูกต้อง (ใช้แบบ 24 ชม. เช่น 08:00)" };

  const recipients: EmailRecipient[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(r.recipients) ? r.recipients : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (o.type === "user" && typeof o.id === "string" && o.id) {
      const key = `u:${o.id}`; if (seen.has(key)) continue; seen.add(key);
      recipients.push({ type: "user", id: o.id, name: String(o.name ?? "").slice(0, 120), email: typeof o.email === "string" ? o.email : null });
    } else if (o.type === "email") {
      const email = String(o.email ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return { error: `อีเมลไม่ถูกต้อง: ${email || "(ว่าง)"}` };
      const key = `e:${email}`; if (seen.has(key)) continue; seen.add(key);
      const nm = typeof o.name === "string" ? o.name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80) : "";
      recipients.push({ type: "email", email, ...(nm ? { name: nm } : {}) });
    }
  }
  if (recipients.length > 50) return { error: "ผู้รับมากเกินไป (ไม่เกิน 50 คน)" };
  const rd = (r.discord ?? {}) as Record<string, unknown>;
  if (rd.enabled === true && !SNOWFLAKE.test(String(rd.channel_id ?? ""))) return { error: "เลือกห้อง Discord ก่อน (หรือปิด Discord)" };
  // ช่องที่แหล่งข้อมูลนี้ไม่รองรับ = ปิดเสมอ (เช่น รายงานยอดขายยังไม่ทำป๊อป)
  const allowed = new Set(sourceChannels(source_key).map((c) => c.key));
  const discord = allowed.has("discord") ? normalizeReportDiscord(rd) : normalizeReportDiscord({});
  const email_enabled = allowed.has("email") && r.email_enabled !== false;
  const popup = allowed.has("popup") ? normalizeReportPopup(r.popup) : normalizeReportPopup({});
  if (popup.enabled && !popup.roles.length && !popup.users.length && !popup.assignees) return { error: "เปิดป๊อปแล้ว เลือกด้วยว่าจะเด้งให้ใคร (ตำแหน่ง / รายคน / ผู้รับผิดชอบ)" };
  const rl = (r.line ?? {}) as Record<string, unknown>;
  if (allowed.has("line") && rl.enabled === true && !LINE_GROUP_ID.test(String(rl.group_id ?? ""))) return { error: "เลือกกลุ่ม LINE ก่อน (หรือปิด LINE)" };
  const line = allowed.has("line") ? normalizeReportLine(rl) : normalizeReportLine({});
  // เปิดใช้รายงาน = ต้องมีอย่างน้อย 1 ช่องทางที่ใช้ได้จริง
  const is_enabled = r.is_enabled === true;
  if (is_enabled && !(email_enabled && recipients.length > 0) && !discord.enabled && !popup.enabled && !line.enabled) {
    return { error: email_enabled ? "เปิดใช้รายงานไม่ได้ ยังไม่มีผู้รับอีเมล (ใส่ผู้รับ หรือเปิด LINE / Discord / ป๊อป)" : "เปิดใช้รายงานไม่ได้ ยังไม่ได้เลือกช่องทาง (Gmail / LINE / Discord / ERP ป๊อป)" };
  }

  const f = (r.filters ?? {}) as Record<string, unknown>;
  const brand_group: BrandGroupFilter = f.brand_group === "customer" || f.brand_group === "own" ? f.brand_group : "all";
  const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && !!s))].slice(0, 100) : []);
  const filters: EmailReportFilters = { brand_group, brand_ids: strList(f.brand_ids), statuses: strList(f.statuses), ...(isReportPeriod(f.day) && f.day !== "yesterday" ? { day: f.day } : {}) };

  const options: EmailReportOptions = normalizeReportOptions(source_key, r.options);

  return { value: { name, source_key, filters, options, days, send_time, recipients, email_enabled, discord, popup, line, skip_if_empty: r.skip_if_empty !== false, is_enabled } };
}

export const RUN_STATUS_LABEL: Record<EmailReportRun["status"], { label: string; cls: string }> = {
  sent:           { label: "ส่งแล้ว",            cls: "bg-emerald-50 text-emerald-700" },
  partial:        { label: "ส่งได้บางคน",        cls: "bg-amber-50 text-amber-700" },
  failed:         { label: "ไม่สำเร็จ",          cls: "bg-rose-50 text-rose-700" },
  skipped_empty:  { label: "ไม่มีงาน ไม่ส่ง",     cls: "bg-slate-100 text-slate-600" },
  not_configured: { label: "ยังไม่ตั้งระบบส่งเมล", cls: "bg-rose-50 text-rose-700" },
  channel_off:    { label: "ปิดช่องทางอยู่ ไม่ส่ง", cls: "bg-slate-100 text-slate-600" },
};
export const RUN_TRIGGER_LABEL: Record<EmailReportRun["trigger"], string> = { schedule: "ตามเวลา", test: "ส่งทดสอบ", manual: "กดส่งเอง" };

/** รายงานที่บันทึกแล้ว → ค่าทั้งชุดสำหรับ PATCH /api/admin/email-reports/:id (PATCH ต้องส่งทั้งชุด)
 *  ใช้: หน้า /admin/email-reports (แก้จากแถว/ฟอร์ม) · ป๊อปแก้แจ้งเตือนในแผนผัง (components/flow-map/notify-edit) — แก้แค่บางช่องแล้วรวมกับค่านี้ */
export function emailReportToInput(r: EmailReport): EmailReportInput {
  return {
    name: r.name, source_key: r.source_key,
    filters: { brand_group: r.filters.brand_group ?? "all", brand_ids: r.filters.brand_ids ?? [], statuses: r.filters.statuses ?? [], ...(r.filters.day === "today" ? { day: "today" as const } : {}) },
    options: normalizeReportOptions(r.source_key, r.options),   // รายงานเก่า = เติมค่าเริ่มต้น (หน้าตาเดิม)
    days: r.days, send_time: r.send_time, recipients: r.recipients, email_enabled: r.email_enabled !== false,
    discord: normalizeReportDiscord(r.discord), popup: normalizeReportPopup(r.popup), line: normalizeReportLine(r.line),
    skip_if_empty: r.skip_if_empty, is_enabled: r.is_enabled,
  };
}
