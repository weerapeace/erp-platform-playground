/**
 * งานออกแบบจากไลน์ — ชนิดข้อมูล + ตัวช่วยที่ใช้ได้ทั้งหน้าเว็บและ server (pure ไม่แตะ DB)
 * server: lib/design-line-inbox.ts · หน้าจอ: components/design-dashboard/line-inbox.tsx
 */

export type LineInboxStatus = "pending" | "converted" | "rejected";
export type LineInboxTab = LineInboxStatus;

/** ป้ายเตือน "อาจซ้ำ" — รูปเดิม / ชื่อคล้ายใบงานหรือร่างอื่น */
export type LineInboxDup = { kind: "image" | "name"; label: string; sheet_id: string | null; inbox_id: string | null };

/** 1 ร่างในกล่อง (ที่ API ส่งให้หน้าจอ) */
export type LineInboxItem = {
  id: string;
  status: LineInboxStatus;
  source: "line" | "manual";
  text: string | null;
  images: string[];            // URL รูป (proxy /api/r2-image)
  sender_name: string | null;
  created_at: string;
  last_message_at: string;
  name: string | null;         // AI เดาชื่องาน
  brand_id: string | null;     // AI เดาแบรนด์
  brand_name: string | null;
  deadline: string | null;     // AI เดากำหนดส่ง (YYYY-MM-DD)
  ai_error: string | null;
  sheet: { id: string; code: string | null; name: string | null } | null;   // ใบงานที่เปิดแล้ว
  converted_by_name: string | null;
  converted_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  dups: LineInboxDup[];
};

export const LINE_INBOX_TAB_LABEL: Record<LineInboxTab, string> = {
  pending: "รอเปิดใบงาน",
  rejected: "ไม่ใช่งาน",
  converted: "เปิดใบงานแล้ว",
};

// ---------------------------------------------------------------- ผล AI (ตรวจ/ทำความสะอาด)

export type InboxBrand = { id: string; name: string };
export type DesignAiResult = { is_job: boolean | null; name: string | null; brand_id: string | null; deadline: string | null };

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
export const todayBangkok = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** ตรวจ/ทำความสะอาดคำตอบ AI — แบรนด์ต้องอยู่ในรายชื่อจริง · วันที่ต้องสมเหตุผล (กัน AI เดาปีผิด) */
export function sanitizeDesignAi(raw: Record<string, unknown>, brands: InboxBrand[], today = todayBangkok()): DesignAiResult {
  const s = (v: unknown) => String(v ?? "").trim();
  const name = s(raw.name).replace(/\s+/g, " ").slice(0, 80) || null;
  const b = s(raw.brand).toLowerCase();
  // ตรงตัวก่อน · ไม่ตรงค่อยเทียบบางส่วน (ต้องยาว ≥ 4 ตัว และเจอแบรนด์เดียว — กัน "IG" ไปตรงกับ "Findig")
  const partial = b.length >= 4
    ? brands.filter((x) => b.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(b))
    : [];
  const brand = b ? brands.find((x) => x.name.toLowerCase() === b) ?? (partial.length === 1 ? partial[0] : undefined) : undefined;
  let deadline: string | null = null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(raw.deadline));
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543;   // พ.ศ. → ค.ศ.
    const d = `${y}-${m[2]}-${m[3]}`;
    const t = Date.parse(`${d}T00:00:00Z`), now = Date.parse(`${today}T00:00:00Z`);
    // ย้อนหลังเกิน 60 วัน หรือไกลเกิน 2 ปี = AI เดาปีผิด → ไม่ใส่
    if (!isNaN(t) && t >= now - 60 * 86400000 && t <= now + 730 * 86400000) deadline = d;
  }
  const isJob = typeof raw.is_job === "boolean" ? raw.is_job : null;
  return { is_job: isJob, name, brand_id: brand?.id ?? null, deadline };
}

// ---------------------------------------------------------------- หลายรูป / หลายงาน

/** ขึ้นต้นข้อความด้วย "งานใหม่" (หรือ "#งานใหม่" / "new job") = เริ่มงานใหม่ทันที ไม่รวมกับงานก่อนหน้าใน 5 นาที — คืนข้อความที่ตัดคำนำออกแล้ว */
export function splitNewJobKeyword(text: string | null | undefined): { forceNew: boolean; text: string } {
  const raw = String(text ?? "");
  const m = /^\s*[#＃]?\s*(?:งานใหม่|new\s+job\b)\s*[:：\-–—.,]?\s*/i.exec(raw);
  return m ? { forceNew: true, text: raw.slice(m[0].length).trim() } : { forceNew: false, text: raw.trim() };
}

/**
 * บอทควรตอบในกลุ่มไหม — เรียกตอน "ชุดที่ส่งติดกันจบแล้ว" (เงียบไปสักพัก) เท่านั้น
 * ตอบเมื่อ: ยังไม่เคยตอบงานนี้ · มีรูปเพิ่มจากตอนตอบครั้งก่อน · ข้อความแรกมาถึงหลังตอบไปแล้ว (มีชื่อ/แบรนด์/วันใหม่ให้ดู)
 * ไม่ตอบ: ข้อความเพิ่มเติมทีหลัง (เช่น "ขอบคุณ" / แก้รายละเอียด) — AI อ่านใหม่เงียบ ๆ ในระบบ
 */
export function decideDesignReply(s: {
  replied_at: string | null; replied_images: number | null; replied_text: boolean; image_count: number; has_text: boolean;
}): { reply: boolean; first: boolean; added: number } {
  if (!s.replied_at) return { reply: true, first: true, added: s.image_count };
  const added = Math.max(0, s.image_count - (s.replied_images ?? 0));
  return { reply: added > 0 || (s.has_text && !s.replied_text), first: false, added };
}

/** ใบงานที่ให้เลือกตอนกด "รวมกับงาน…" (หน้าแม่ส่งมาจากรายการบนบอร์ด) */
export type MergeSheetOption = { id: string; code: string; name: string; brand_name: string | null; cover_url: string | null; updated_at: string };
