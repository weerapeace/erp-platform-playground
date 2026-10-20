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
};

export type EmailReport = {
  id: string;
  name: string;
  source_key: string;
  filters: EmailReportFilters;
  options: EmailReportOptions;
  days: number[];            // 1=จันทร์ … 7=อาทิตย์
  send_time: string;         // "HH:MM" เวลาไทย
  recipients: EmailRecipient[];
  skip_if_empty: boolean;
  is_enabled: boolean;
  last_sent_on: string | null;
  created_at: string;
  updated_at: string;
};

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
export type EmailReportInput = Pick<EmailReport, "name" | "source_key" | "filters" | "options" | "days" | "send_time" | "recipients" | "skip_if_empty" | "is_enabled">;

// ---- แหล่งข้อมูล (เพิ่มรายงานแบบใหม่ = เพิ่มที่นี่ + ตัวดึงข้อมูลใน lib/email-report/sources.ts) ----
export const EMAIL_REPORT_SOURCES: { key: string; label: string; description: string }[] = [
  { key: "design_sheets_pending", label: "ใบงานออกแบบที่ค้าง", description: "ใบงานที่ยังไม่ถึงสถานะปิดงาน แยกตามสถานะ พร้อมรูปปก" },
];
export const sourceLabel = (key: string) => EMAIL_REPORT_SOURCES.find((s) => s.key === key)?.label ?? key;

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
  const is_enabled = r.is_enabled === true;
  if (is_enabled && recipients.length === 0) return { error: "เปิดส่งอัตโนมัติไม่ได้ ยังไม่มีผู้รับ" };

  const f = (r.filters ?? {}) as Record<string, unknown>;
  const brand_group: BrandGroupFilter = f.brand_group === "customer" || f.brand_group === "own" ? f.brand_group : "all";
  const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && !!s))].slice(0, 100) : []);
  const filters: EmailReportFilters = { brand_group, brand_ids: strList(f.brand_ids), statuses: strList(f.statuses) };

  const o = (r.options ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const options: EmailReportOptions = { max_rows: clamp(o.max_rows, 5, 100, 50), stale_days: clamp(o.stale_days, 1, 60, 7) };

  return { value: { name, source_key, filters, options, days, send_time, recipients, skip_if_empty: r.skip_if_empty !== false, is_enabled } };
}

export const RUN_STATUS_LABEL: Record<EmailReportRun["status"], { label: string; cls: string }> = {
  sent:           { label: "ส่งแล้ว",            cls: "bg-emerald-50 text-emerald-700" },
  partial:        { label: "ส่งได้บางคน",        cls: "bg-amber-50 text-amber-700" },
  failed:         { label: "ไม่สำเร็จ",          cls: "bg-rose-50 text-rose-700" },
  skipped_empty:  { label: "ไม่มีงาน ไม่ส่ง",     cls: "bg-slate-100 text-slate-600" },
  not_configured: { label: "ยังไม่ตั้งระบบส่งเมล", cls: "bg-rose-50 text-rose-700" },
};
export const RUN_TRIGGER_LABEL: Record<EmailReportRun["trigger"], string> = { schedule: "ตามเวลา", test: "ส่งทดสอบ", manual: "กดส่งเอง" };
