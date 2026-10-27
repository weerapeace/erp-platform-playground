/**
 * ของกลางแอป Subscription — ใช้ร่วมทั้งหน้า UI และ API
 *
 * ⚠️ ใช้ตาราง `subscriptions` + `subscription_invoices` + Storage bucket `invoices`
 *    ที่แอปเดิม (software-subscriptions.pages.dev) ใช้อยู่ — ข้อมูลชุดเดียวกัน ไม่สร้างซ้ำ
 * ⚠️ คอลัมน์ข้อความหลายช่อง (chrome_profile/invoice_url/notes/account_email/card_last4)
 *    เป็น NOT NULL default '' → ตอนเขียน DB ต้องใช้ `?? ''` ห้ามเป็น null (ดู toSubRow)
 */

export type BillingCycle = "monthly" | "yearly" | "one-time";
export type Currency = "THB" | "USD" | "EUR";
export type SubType = "work" | "personal";

/** รูปแบบ row ตรงกับ DB (snake_case) — หน้า UI บริโภคตรง ๆ ไม่ต้อง map */
export type Subscription = {
  id: string;
  name: string;
  category: string;
  billing_cycle: BillingCycle;
  cost: number;
  currency: Currency;
  billing_date: string | null;
  chrome_profile: string;
  chrome_profile_url: string;
  chrome_profile_dir: string; // โฟลเดอร์โปรไฟล์ Chrome จริง เช่น "Profile 3" / "Default" (สำหรับสร้างไฟล์เปิด Chrome)
  invoice_url: string;
  notes: string;
  active: boolean;
  type: SubType;
  account_email: string;
  card_last4: string;
  card_statement_name: string; // ชื่อที่ขึ้นในบิลบัตรเครดิต (ไว้เทียบกับสเตทเมนต์)
  pending_cancel: boolean;
  want_to_buy: boolean;
  owner_id: string | null; // เจ้าของรายการ "ส่วนตัว" (null = งาน/ของบริษัท เห็นทั้งองค์กร)
  streaming: string[];      // id ของบริการ streaming ที่รายการนี้แถม (เฉพาะรายการส่วนตัว)
  group_name: string;       // ชื่อกลุ่ม (พิมพ์เอง) — รายการที่ชื่อกลุ่มเหมือนกันจะรวมเป็นการ์ดเดียวบนบอร์ด ("" = ไม่อยู่กลุ่ม)
  members: SubMember[];     // ผู้ใช้หลายคนในแพ็กเดียว (บิลเดียว) — [] = ผู้ใช้คนเดียว ใช้ช่อง account_email/chrome_* บนแถว
  price_mode: PriceMode;    // วิธีคิดราคาเมื่อมีหลายผู้ใช้
  created_at?: string;
  updated_at?: string;
};

/**
 * ผู้ใช้ 1 คนในแพ็ก (เช่น Google Drive 2 users) — เก็บเป็น jsonb `subscriptions.members`
 * ⚠️ คนแรกถูก mirror ลงช่องบนแถว (account_email/chrome_*) ตอนบันทึก → ปุ่ม .bat / หาในเมล / บิลขาด ใช้คนแรก
 */
export type SubMember = {
  id: string;
  name: string;               // ชื่อเรียก เช่น "Gogo", "Louis Team"
  account_email: string;
  chrome_profile: string;
  chrome_profile_dir: string;
  chrome_profile_url: string;
  active: boolean;
  price: number;              // ใช้เมื่อ price_mode = per_member (สกุลเงินเดียวกับรายการ)
};

/** total = ราคารวมทั้งแพ็ก (ช่อง cost) · per_member = แยกราคารายคน (cost = ผลรวมคนที่ใช้งานอยู่) */
export type PriceMode = "total" | "per_member";

export const PRICE_MODE_LABEL: Record<PriceMode, string> = {
  total: "ราคารวมทั้งแพ็ก",
  per_member: "แยกราคารายคน",
};

const MAX_MEMBERS = 50;

export function newMemberId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** ผู้ใช้คนเดียวจากช่องบนแถว (รายการเดิมที่ยังไม่มี members) */
export function memberFromSub(s: Pick<Subscription, "account_email" | "chrome_profile" | "chrome_profile_dir" | "chrome_profile_url" | "cost">): SubMember {
  return {
    id: newMemberId(), name: "", account_email: s.account_email ?? "", chrome_profile: s.chrome_profile ?? "",
    chrome_profile_dir: s.chrome_profile_dir ?? "", chrome_profile_url: s.chrome_profile_url ?? "",
    active: true, price: Number(s.cost) || 0,
  };
}

/** ทำความสะอาด members ที่มาจาก DB/ฟอร์ม (กันค่าแปลก ๆ + ช่องข้อความเป็น '' เสมอ) */
export function normalizeMembers(raw: unknown): SubMember[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_MEMBERS).filter((m) => m && typeof m === "object").map((m) => {
    const o = m as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return {
      id: str(o.id) || newMemberId(),
      name: str(o.name),
      account_email: str(o.account_email),
      chrome_profile: str(o.chrome_profile),
      chrome_profile_dir: str(o.chrome_profile_dir),
      chrome_profile_url: str(o.chrome_profile_url),
      active: o.active !== false,
      price: Math.max(0, Number(o.price) || 0),
    };
  });
}

/** จำนวนผู้ใช้ในแพ็ก (ไม่มี members = 1 คน) */
export function memberCount(s: Pick<Subscription, "members">): number {
  return Math.max(1, s.members?.length ?? 0);
}

/** ผลรวมราคาของคนที่ใช้งานอยู่ (โหมดแยกราคารายคน) */
export function membersTotal(members: SubMember[]): number {
  return members.filter((m) => m.active).reduce((sum, m) => sum + (Number(m.price) || 0), 0);
}

/** ป้ายผู้ใช้ 1 คน (ชื่อเรียก ไม่มีก็ใช้อีเมล) */
export function memberLabel(m: Pick<SubMember, "name" | "account_email">): string {
  return m.name || m.account_email || "ผู้ใช้";
}

/** บริการ streaming ในคลังของผู้ใช้ (เช่น iQIYI, WeTV, Netflix) */
export type StreamingService = {
  id: string;
  name: string;
  sort_order?: number;
};

/** ค่าที่รับจากฟอร์ม (ยังไม่มี id ตอนสร้าง) */
export type SubInput = Omit<Subscription, "id" | "created_at" | "updated_at">;

export type SubSettings = {
  exchange_rate: number; // THB ต่อ 1 USD
  eur_rate: number;      // THB ต่อ 1 EUR
  display_currency: Currency;
};

export type SubInvoice = {
  id: string;
  subscription_id: string;
  month: string;      // "YYYY-MM"
  file_name: string;
  file_path: string;
  uploaded_at: string;
  url?: string | null; // signed url (เติมจาก API)
  // อ่านจากใน PDF (parse-invoice)
  amount?: number | null;
  currency?: string | null;
  invoice_date?: string | null; // วันที่ในบิล (วันที่ตัด)
  parsed_at?: string | null;    // null = ยังไม่เคยอ่าน
};

/** ค่า accept ของช่องเลือกไฟล์ใบเสร็จ (ของกลาง — ใช้ทั้งป๊อปอัปใบเสร็จและปุ่มแนบบิลในพาเนลบิลขาด) */
export const INVOICE_ACCEPT_ATTR = "application/pdf,.pdf,image/*";
const INVOICE_IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

/**
 * ชนิดไฟล์ใบเสร็จที่รับได้ — "pdf" | "image" (สกรีนช็อต/ถ่ายรูปบิล) | null = ไม่รับ
 * ใช้ทั้งฝั่ง client (กันเลือกไฟล์ผิด) และ server (ตรวจก่อนอัปโหลด)
 */
export function invoiceFileKind(name: string, type?: string | null): "pdf" | "image" | null {
  const n = (name || "").toLowerCase();
  const t = (type || "").toLowerCase();
  if (t.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (t.startsWith("image/") || INVOICE_IMAGE_EXT.test(n)) return "image";
  return null;
}

/** ไอคอนหน้าชื่อไฟล์ใบเสร็จ (รูป vs เอกสาร) */
export function invoiceFileIcon(fileName: string): string {
  return invoiceFileKind(fileName) === "image" ? "🖼" : "📄";
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "รายเดือน",
  yearly: "รายปี",
  "one-time": "จ่ายครั้งเดียว",
};

export const TYPE_LABEL: Record<SubType, string> = {
  work: "งาน",
  personal: "ส่วนตัว",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  THB: "฿",
  USD: "$",
  EUR: "€",
};

/** แปลงเป็นบาทตามสกุลเงินของรายการ */
export function toTHB(cost: number, currency: Currency, s: Pick<SubSettings, "exchange_rate" | "eur_rate">): number {
  if (currency === "USD") return cost * (s.exchange_rate || 0);
  if (currency === "EUR") return cost * (s.eur_rate || 0);
  return cost;
}

/** ค่าใช้จ่าย "ต่อเดือน" ในหน่วยบาท (yearly หาร 12, one-time ไม่นับเป็นค่าประจำ) */
export function monthlyTHB(sub: Subscription, s: SubSettings): number {
  const base = toTHB(Number(sub.cost) || 0, sub.currency, s);
  if (sub.billing_cycle === "monthly") return base;
  if (sub.billing_cycle === "yearly") return base / 12;
  return 0;
}

/** ค่าใช้จ่าย "ต่อปี" ในหน่วยบาท */
export function yearlyTHB(sub: Subscription, s: SubSettings): number {
  const base = toTHB(Number(sub.cost) || 0, sub.currency, s);
  if (sub.billing_cycle === "monthly") return base * 12;
  if (sub.billing_cycle === "yearly") return base;
  return 0;
}

/** parse "YYYY-MM-DD" เป็น Date แบบ local (กัน timezone เลื่อนวัน) */
function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function startOfToday(): Date { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** จำนวนวันจากวันนี้ถึงวันที่ (บวก=อีกกี่วัน, ลบ=เลยมาแล้ว, null=ไม่มีวันที่) */
export function daysUntil(dateStr: string | null | undefined): number | null {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday().getTime()) / 86400000);
}

/**
 * "รอบต่ออายุถัดไป" (ISO วันที่) — เลื่อนวันตามรอบบิลให้เป็นวันในอนาคตที่ใกล้ที่สุด
 * - monthly: วันเดิมของทุกเดือน (วันไม่พอในเดือนสั้น → ปัดเป็นวันสุดท้าย)
 * - yearly:  เดือน/วันเดิมของทุกปี
 * - one-time: คงวันที่เดิม (จ่ายครั้งเดียว)
 * ใช้ทั้งการ์ดสรุป, ตาราง, ปฏิทิน และการแจ้งเตือน (ให้ตรงกันหมด)
 */
export function nextRenewal(sub: Pick<Subscription, "billing_date" | "billing_cycle">): string | null {
  const base = parseLocalDate(sub.billing_date);
  if (!base) return null;
  if (sub.billing_cycle === "one-time") return isoLocal(base);
  const today = startOfToday();
  const anchorDay = base.getDate();

  const clampDay = (y: number, mIndex: number, day: number) => {
    const dim = new Date(y, mIndex + 1, 0).getDate(); // จำนวนวันในเดือน
    const d = new Date(y, mIndex, Math.min(day, dim)); d.setHours(0, 0, 0, 0); return d;
  };

  if (sub.billing_cycle === "monthly") {
    for (let add = 0; add < 13; add++) {
      const cand = clampDay(today.getFullYear(), today.getMonth() + add, anchorDay);
      if (cand.getTime() >= today.getTime()) return isoLocal(cand);
    }
  } else { // yearly
    const anchorMonth = base.getMonth();
    for (let add = 0; add < 2; add++) {
      const cand = clampDay(today.getFullYear() + add, anchorMonth, anchorDay);
      if (cand.getTime() >= today.getTime()) return isoLocal(cand);
    }
  }
  return isoLocal(base);
}

/** เกณฑ์วันสำหรับแจ้งเตือน (cron วิ่งวันละครั้ง → แต่ละเกณฑ์เด้งครั้งเดียว ไม่ต้อง dedupe) */
export const RENEWAL_THRESHOLDS = [7, 3, 1, 0, -1];

/** ป้ายสถานะแบบข้อความ (ใช้ filter/group/แสดง) — รวม active/pending_cancel/want_to_buy เป็นค่าเดียว */
export function subStatusLabel(s: Pick<Subscription, "active" | "pending_cancel" | "want_to_buy">): string {
  if (s.want_to_buy) return "อยากซื้อ";
  if (!s.active && s.pending_cancel) return "ยกเลิกแล้ว";
  if (!s.active) return "ปิด";
  if (s.pending_cancel) return "กำลังยกเลิก";
  return "ใช้งาน";
}

/** ฟอร์แมตราคาตามสกุลเงินของรายการ เช่น "$20.00" / "฿571.38" */
export function fmtCost(cost: number, currency: Currency): string {
  return `${CURRENCY_SYMBOL[currency] ?? ""}${Number(cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ฟอร์แมตบาท (ปัดเศษ) เช่น "฿1,700" */
export function fmtBaht(v: number, digits = 0): string {
  return `฿${Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** map ค่าจาก input → row สำหรับเขียน DB — บังคับ ?? '' กันชน NOT NULL */
export function toSubRow(input: Partial<SubInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = String(input.name).trim();
  if (input.category !== undefined) row.category = input.category || "Other";
  if (input.billing_cycle !== undefined) row.billing_cycle = input.billing_cycle;
  if (input.cost !== undefined) row.cost = Number(input.cost) || 0;
  if (input.currency !== undefined) row.currency = input.currency;
  if (input.billing_date !== undefined) row.billing_date = input.billing_date || null; // date คงเป็น null ได้
  if (input.chrome_profile !== undefined) row.chrome_profile = input.chrome_profile ?? "";
  if (input.chrome_profile_url !== undefined) row.chrome_profile_url = input.chrome_profile_url ?? "";
  if (input.chrome_profile_dir !== undefined) row.chrome_profile_dir = input.chrome_profile_dir ?? "";
  if (input.invoice_url !== undefined) row.invoice_url = input.invoice_url ?? "";
  if (input.notes !== undefined) row.notes = input.notes ?? "";
  if (input.active !== undefined) row.active = !!input.active;
  if (input.type !== undefined) row.type = input.type;
  if (input.account_email !== undefined) row.account_email = input.account_email ?? "";
  if (input.card_last4 !== undefined) row.card_last4 = input.card_last4 ?? "";
  if (input.card_statement_name !== undefined) row.card_statement_name = input.card_statement_name ?? "";
  if (input.pending_cancel !== undefined) row.pending_cancel = !!input.pending_cancel;
  if (input.want_to_buy !== undefined) row.want_to_buy = !!input.want_to_buy;
  if (input.owner_id !== undefined) row.owner_id = input.owner_id || null;
  if (input.streaming !== undefined) row.streaming = Array.isArray(input.streaming) ? input.streaming.filter(Boolean) : [];
  if (input.group_name !== undefined) row.group_name = (input.group_name ?? "").trim();
  if (input.price_mode !== undefined) row.price_mode = input.price_mode === "per_member" ? "per_member" : "total";
  if (input.members !== undefined) {
    const members = normalizeMembers(input.members);
    if (members.length >= 2) {
      // หลายผู้ใช้ → คนแรก mirror ลงช่องบนแถว (ปุ่ม .bat / หาในเมล / ค้นหา ยังใช้ได้)
      const first = members[0];
      row.members = members;
      row.account_email = first.account_email;
      row.chrome_profile = first.chrome_profile;
      row.chrome_profile_dir = first.chrome_profile_dir;
      row.chrome_profile_url = first.chrome_profile_url;
      if (input.price_mode === "per_member") row.cost = membersTotal(members);
    } else {
      // เหลือคนเดียว → กลับเป็นรายการธรรมดา (ใช้ช่องบนแถว)
      row.members = [];
      if (input.price_mode !== undefined) row.price_mode = "total";
    }
  }
  return row;
}

const CYCLES: BillingCycle[] = ["monthly", "yearly", "one-time"];
const CURRENCIES: Currency[] = ["THB", "USD", "EUR"];
const TYPES: SubType[] = ["work", "personal"];

/** ตรวจ input ก่อนบันทึก — คืน error string หรือ null ถ้าผ่าน */
export function validateSubInput(input: Partial<SubInput>, isCreate: boolean): string | null {
  if (isCreate || input.name !== undefined) {
    if (!input.name || !String(input.name).trim()) return "กรุณาใส่ชื่อรายการ";
  }
  if (input.cost !== undefined && (isNaN(Number(input.cost)) || Number(input.cost) < 0)) return "ราคาต้องเป็นตัวเลขไม่ติดลบ";
  if (input.billing_cycle !== undefined && !CYCLES.includes(input.billing_cycle)) return "รอบบิลไม่ถูกต้อง";
  if (input.currency !== undefined && !CURRENCIES.includes(input.currency)) return "สกุลเงินไม่ถูกต้อง";
  if (input.type !== undefined && !TYPES.includes(input.type)) return "ประเภทไม่ถูกต้อง";
  if (input.price_mode !== undefined && input.price_mode !== "total" && input.price_mode !== "per_member") return "วิธีคิดราคาไม่ถูกต้อง";
  if (input.members !== undefined) {
    if (!Array.isArray(input.members)) return "รายชื่อผู้ใช้ไม่ถูกต้อง";
    if (input.members.length > MAX_MEMBERS) return `ผู้ใช้ในแพ็กได้สูงสุด ${MAX_MEMBERS} คน`;
    if (input.members.some((m) => isNaN(Number(m?.price)) || Number(m?.price) < 0)) return "ราคารายคนต้องเป็นตัวเลขไม่ติดลบ";
  }
  return null;
}
