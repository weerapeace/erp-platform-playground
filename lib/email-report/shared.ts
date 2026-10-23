/**
 * 📧 ส่งอีเมลรายงาน — ส่วนที่ใช้ร่วมกันทั้งหน้าจอและ API (ห้าม import ของฝั่งเซิร์ฟเวอร์ในไฟล์นี้)
 * ชนิดข้อมูล · ชื่อวัน · รายชื่อแหล่งข้อมูล · ตรวจค่าที่ส่งมาก่อนบันทึก (กฎเดียว ใช้ทั้ง 2 ฝั่ง)
 * doc: docs/email-reports.md
 */

export type EmailRecipient =
  | { type: "user"; id: string; name: string; email: string | null }
  | { type: "email"; email: string };

export type BrandGroupFilter = "all" | "customer" | "own";

export type EmailReportFilters = {
  /** design_sheets_pending: กลุ่มแบรนด์ (ทุกแบรนด์ / งานลูกค้า / แบรนด์เรา) */
  brand_group?: BrandGroupFilter;
  /** เฉพาะแบรนด์ที่เลือก (ว่าง = ทุกแบรนด์ในกลุ่ม) */
  brand_ids?: string[];
  /** เฉพาะสถานะที่เลือก (ว่าง = ทุกสถานะที่ยังไม่ปิด) */
  statuses?: string[];
};

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
};
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
  /** 💬 ส่งเข้า Discord ด้วย (normalizeReportDiscord) */
  discord: EmailReportDiscord;
  skip_if_empty: boolean;
  is_enabled: boolean;
  last_sent_on: string | null;
  created_at: string;
  updated_at: string;
};

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
};
export const DISCORD_MENTION_LABEL: Record<EmailReportDiscord["mention"], string> = { overdue: "เมื่อมีงานเกินกำหนด", always: "ทุกครั้ง", never: "ไม่แท็ก" };
const SNOWFLAKE = /^\d{15,25}$/;
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
  };
}

export type EmailReportRun = {
  id: string;
  report_id: string;
  report_name?: string | null;
  ran_at: string;
  trigger: "schedule" | "test" | "manual";
  status: "sent" | "partial" | "failed" | "skipped_empty" | "not_configured";
  item_count: number | null;
  recipient_count: number | null;
  sent_count: number | null;
  error: string | null;
  actor_name: string | null;
};

/** ค่าที่ฟอร์มส่งมา (ยังไม่มี id/เวลา) */
export type EmailReportInput = Pick<EmailReport, "name" | "source_key" | "filters" | "options" | "days" | "send_time" | "recipients" | "discord" | "skip_if_empty" | "is_enabled">;

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
  },
];
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
    max_rows: clamp(o.max_rows, 5, 100, 50),
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
  };
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
      recipients.push({ type: "email", email });
    }
  }
  if (recipients.length > 50) return { error: "ผู้รับมากเกินไป (ไม่เกิน 50 คน)" };
  const rd = (r.discord ?? {}) as Record<string, unknown>;
  if (rd.enabled === true && !SNOWFLAKE.test(String(rd.channel_id ?? ""))) return { error: "เลือกห้อง Discord ก่อน (หรือปิด Discord)" };
  const discord = normalizeReportDiscord(rd);
  const is_enabled = r.is_enabled === true;
  if (is_enabled && recipients.length === 0 && !discord.enabled) return { error: "เปิดส่งอัตโนมัติไม่ได้ ยังไม่มีผู้รับ (ใส่อีเมล หรือเปิดส่งเข้า Discord)" };

  const f = (r.filters ?? {}) as Record<string, unknown>;
  const brand_group: BrandGroupFilter = f.brand_group === "customer" || f.brand_group === "own" ? f.brand_group : "all";
  const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && !!s))].slice(0, 100) : []);
  const filters: EmailReportFilters = { brand_group, brand_ids: strList(f.brand_ids), statuses: strList(f.statuses) };

  const options: EmailReportOptions = normalizeReportOptions(source_key, r.options);

  return { value: { name, source_key, filters, options, days, send_time, recipients, discord, skip_if_empty: r.skip_if_empty !== false, is_enabled } };
}

export const RUN_STATUS_LABEL: Record<EmailReportRun["status"], { label: string; cls: string }> = {
  sent:           { label: "ส่งแล้ว",            cls: "bg-emerald-50 text-emerald-700" },
  partial:        { label: "ส่งได้บางคน",        cls: "bg-amber-50 text-amber-700" },
  failed:         { label: "ไม่สำเร็จ",          cls: "bg-rose-50 text-rose-700" },
  skipped_empty:  { label: "ไม่มีงาน ไม่ส่ง",     cls: "bg-slate-100 text-slate-600" },
  not_configured: { label: "ยังไม่ตั้งระบบส่งเมล", cls: "bg-rose-50 text-rose-700" },
};
export const RUN_TRIGGER_LABEL: Record<EmailReportRun["trigger"], string> = { schedule: "ตามเวลา", test: "ส่งทดสอบ", manual: "กดส่งเอง" };
