/**
 * วางแผนคอนเทนต์แบบ Mass — ตัวคิดกลาง (ใช้ทั้งป๊อปในปฏิทินและ API)
 *   1) buildMassPlanPrompt — prompt สำเร็จรูปให้ก๊อปไปถาม AI ภายนอก (AI ในระบบใช้บริบทชุดเดียวกัน: buildMassPlanContext)
 *   2) parseMassPlanText   — อ่านคำตอบที่วางกลับมา (ตาราง | ของ ChatGPT / Tab จาก Excel / CSV) → แถวดิบ
 *   3) groupMassPlan       — รวมแถว "วัน + เวลา + หัวข้อ เดียวกัน" เป็นโพสต์เดียว (แคปชั่นแยกการ์ดตามแพลตฟอร์ม) + ตรวจ
 * กติกา: ไม่ทับของเดิมเด็ดขาด — ชนกับของเดิมแค่เตือน · หัวข้อ+วันเดียวกับของเดิม = ไม่ติ๊กให้ (กันลงชุดเดิมซ้ำ)
 * วันที่ทั้งหมดเป็น "YYYY-MM-DD" ตามปฏิทิน (ไม่แปลงเขตเวลา) · เวลาเป็น "HH:MM" เวลาไทยตามนาฬิกา
 */
import { parseTableText, parseDateCell } from "@/lib/paste-table";
import { captionLimitCheck } from "@/lib/caption-template";

export type MassPlatform = { code: string; label: string; useCaption: boolean; useHashtags: boolean; note?: string | null };
export type MassPillar = { id: string; name: string };
export type SpecialDay = { date: string; label: string };

/** วิธีเขียนต่อแพลตฟอร์ม (ค่าในโค้ด) — ต่อท้ายด้วยโน้ตจาก ⚙️ ตั้งค่าแพลตฟอร์ม (สัดส่วนรูป ฯลฯ) */
export const PLATFORM_WRITING_RULES: Record<string, string> = {
  facebook: "2–5 บรรทัด เล่าเรื่อง/ชวนคุย · แฮชแท็ก 2–3 · ปิดท้ายชวนทักแชทหรือกดลิงก์",
  instagram: "ประโยคแรกต้องหยุดนิ้ว · 3–6 บรรทัด · แฮชแท็ก 8–15 · บอกในไอเดียว่าเป็นรูปเดี่ยว/Carousel/Reels",
  tiktok: "Hook 1 ประโยคที่ดึงคนดูใน 3 วินาทีแรก · ไอเดียคลิป 3 ฉาก · แคปชั่นไม่เกิน 150 ตัวอักษร · แฮชแท็ก 3–5",
  youtube: "เน้นคลิปสั้น (Shorts) · หัวข้อชวนกด · คำอธิบาย 2–3 บรรทัด · แฮชแท็ก 3",
  pinterest: "คำอธิบายพินไม่เกิน 500 ตัวอักษร ใส่คำที่คนค้นหาจริง · แฮชแท็ก 2–5",
  x: "ไม่เกิน 280 ตัวอักษรรวมแฮชแท็ก · กระชับ ชวนกดลิงก์ · แฮชแท็ก 1–2",
  line_oa: "ข้อความบรอดแคสต์ไม่เกิน 3 บรรทัด · ไม่เกิน 2 ครั้ง/สัปดาห์ (ข้อความมีโควตา) · ต้องมีเหตุผลให้กด เช่น โปร/ของใหม่ · ไม่ต้องมีแฮชแท็ก",
  line_shopping: "ไม่ต้องเขียนแคปชั่นยาว · ขอไอเดียรูป/แบนเนอร์หน้าร้าน + ข้อความบนรูปสั้น ๆ",
  shopee: "ไม่ต้องเขียนแคปชั่น · ขอไอเดียแบนเนอร์/รูปแต่งหน้าร้าน + ข้อความบนรูปสั้น ๆ",
  lazada: "ไม่ต้องเขียนแคปชั่น · ขอไอเดียแบนเนอร์/รูปแต่งหน้าร้าน + ข้อความบนรูปสั้น ๆ",
  website: "หัวข้อแบนเนอร์หรือบทความ · ไม่ต้องมีแฮชแท็ก",
};

export function platformRule(p: MassPlatform): string {
  const base = PLATFORM_WRITING_RULES[p.code] ?? "เขียนให้เหมาะกับแพลตฟอร์มนี้";
  const off = !p.useCaption && !base.includes("ไม่ต้องเขียนแคปชั่น") ? " · แพลตฟอร์มนี้ลงแค่รูป ช่องแคปชั่นเว้นว่างได้" : "";
  const note = p.note?.trim() ? ` · รูปแบบรูป/คลิป: ${p.note.trim().replace(/\s*\n\s*/g, " / ")}` : "";
  return base + off + note;
}

// ── วันที่แบบปฏิทินล้วน (ไม่ขึ้นกับเขตเวลาของเครื่อง) ──
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); };
export const addDaysKey = (key: string, n: number) => { const d = utc(key); d.setUTCDate(d.getUTCDate() + n); return keyOf(d); };
export const daysInRange = (start: string, end: string) => Math.max(0, Math.round((utc(end).getTime() - utc(start).getTime()) / 86400000) + 1);
/** วันในสัปดาห์ของ "YYYY-MM-DD" (0 = อาทิตย์ ตาม Date.getDay — ตรงกับคีย์เวลาแนะนำ) */
export const weekdayOf = (key: string) => utc(key).getUTCDay();
/** วันที่มีจริงในปฏิทินไหม (กัน 31 ก.พ. ที่ตัวอ่านวันที่ยอมผ่าน) */
export const isRealDate = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key) && keyOf(utc(key)) === key;
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-11-03" → "3 พ.ย. 2569" */
export function thaiDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${TH_MON[(m || 1) - 1]} ${y + 543}`;
}
/** ช่วงเดือน "YYYY-MM" → วันแรก/วันสุดท้าย */
export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  return { start: `${ym}-01`, end: keyOf(new Date(Date.UTC(y, m, 0))) };
}

const FIXED_DAYS: Record<string, string> = {
  "1-1": "ปีใหม่", "2-14": "วาเลนไทน์", "4-13": "สงกรานต์", "8-12": "วันแม่", "12-5": "วันพ่อ", "12-25": "คริสต์มาส", "12-31": "ส่งท้ายปีเก่า",
};
/** วันสำคัญด้านการขายในช่วง (วันเลขเบิ้ล · เงินเดือนออก 25 · Black Friday · วันหยุดวันที่ตายตัว) — วันตามจันทรคติ (ลอยกระทง/ตรุษจีน) ไม่ได้คิดให้ */
export function specialDaysBetween(start: string, end: string): SpecialDay[] {
  const out: SpecialDay[] = [];
  const total = daysInRange(start, end);
  for (let i = 0; i < total && i < 400; i++) {
    const key = addDaysKey(start, i);
    const [y, m, d] = key.split("-").map(Number);
    const labels: string[] = [];
    if (m === d) labels.push(`${m}.${m}`);
    if (FIXED_DAYS[`${m}-${d}`]) labels.push(FIXED_DAYS[`${m}-${d}`]);
    if (d === 25) labels.push("เงินเดือนออก");
    if (m === 11) {
      const firstThu = 1 + ((4 - weekdayOf(`${y}-11-01`) + 7) % 7);
      if (d === firstThu + 22) labels.push("Black Friday");
    }
    if (labels.length) out.push({ date: key, label: labels.join(" · ") });
  }
  return out;
}

// ── ความถี่ต่อแพลตฟอร์ม: n ครั้ง ต่อสัปดาห์ หรือ ต่อเดือน (ช่องที่ลงไม่บ่อย เช่น LINE OA / YouTube) ──
export type MassFreqUnit = "week" | "month";
export type MassFreq = { n: number; unit: MassFreqUnit };
export const FREQ_MAX: Record<MassFreqUnit, number> = { week: 21, month: 90 };
const WEEKS_PER_MONTH = 52 / 12;
const DAYS_PER_MONTH = 365.25 / 12;

/** ค่าตั้งต้นตอนติ๊กแพลตฟอร์ม + ช่วงที่ใช้กันทั่วไป (ค่าประมาณให้พอมีหลัก ไม่ใช่กฎ) */
export const PLATFORM_FREQ_HINT: Record<string, { def: MassFreq; text: string }> = {
  shopee: { def: { n: 2, unit: "week" }, text: "2–3/สัปดาห์" },
  lazada: { def: { n: 1, unit: "week" }, text: "1–2/สัปดาห์" },
  website: { def: { n: 1, unit: "week" }, text: "1/สัปดาห์" },
  instagram: { def: { n: 3, unit: "week" }, text: "3–5/สัปดาห์" },
  tiktok: { def: { n: 3, unit: "week" }, text: "3–7/สัปดาห์" },
  facebook: { def: { n: 3, unit: "week" }, text: "3–5/สัปดาห์" },
  line_oa: { def: { n: 2, unit: "month" }, text: "2–4/เดือน (ข้อความมีโควตา)" },
  youtube: { def: { n: 2, unit: "month" }, text: "1–4/เดือน" },
  pinterest: { def: { n: 3, unit: "week" }, text: "3–7/สัปดาห์" },
  x: { def: { n: 3, unit: "week" }, text: "3–7/สัปดาห์" },
  line_shopping: { def: { n: 1, unit: "week" }, text: "1–2/สัปดาห์" },
};
export const freqHint = (code: string) => PLATFORM_FREQ_HINT[code] ?? { def: { n: 3, unit: "week" as const }, text: "" };

/** ค่าที่ส่งมาจากหน้าเว็บ → ความถี่ที่ใช้ได้ (ผิดรูป = null) */
export function normFreq(v: unknown): MassFreq | null {
  const o = (v ?? {}) as { n?: unknown; unit?: unknown };
  const unit: MassFreqUnit = o.unit === "month" ? "month" : "week";
  const n = Math.round(Number(o.n));
  if (!Number.isFinite(n) || n < 1) return null;
  return { n: Math.min(FREQ_MAX[unit], n), unit };
}
/** จำนวนโพสต์ของแพลตฟอร์มนี้ในช่วงวันที่ (อย่างน้อย 1) */
export function countForRange(f: MassFreq, start: string, end: string): number {
  const days = daysInRange(start, end);
  return Math.max(1, Math.round(f.unit === "week" ? (f.n * days) / 7 : (f.n * days) / DAYS_PER_MONTH));
}
export const freqLabel = (f: MassFreq) => `${f.n} ครั้ง/${f.unit === "week" ? "สัปดาห์" : "เดือน"}`;
/** ความถี่ → "เป้ารายเดือน" (content_plan_targets.monthly_count) */
export const monthlyFromFreq = (f: MassFreq) => Math.min(500, Math.max(1, f.unit === "month" ? f.n : Math.round(f.n * WEEKS_PER_MONTH)));
/** "เป้ารายเดือน" → ความถี่ที่อ่านง่าย: หารสัปดาห์ลงตัว (3/สัปดาห์ = 13/เดือน) แสดงเป็นต่อสัปดาห์ · ไม่ลงตัว/น้อยกว่า 4 = ต่อเดือน */
export function freqFromMonthly(m: number): MassFreq {
  const w = Math.round(m / WEEKS_PER_MONTH);
  if (m >= 4 && w <= FREQ_MAX.week && Math.round(w * WEEKS_PER_MONTH) === m) return { n: w, unit: "week" };
  if (m <= FREQ_MAX.month) return { n: m, unit: "month" };
  return { n: Math.min(FREQ_MAX.week, w), unit: "week" };
}
/** งานรูป/คลิปที่ทีมต้องผลิตจริง — ให้ลงเรื่องเดียวกันหลายแพลตฟอร์มได้ = อย่างน้อยเท่าแพลตฟอร์มที่ลงบ่อยสุด */
export function productionRange(counts: number[], share: boolean): { min: number; max: number } {
  const sum = counts.reduce((a, b) => a + b, 0);
  return { min: share && counts.length > 1 ? Math.max(0, ...counts) : sum, max: sum };
}

export type MassPlanBrief = {
  brandName: string; start: string; end: string;
  /** ความถี่ต่อแพลตฟอร์ม (คีย์ = code) · ไม่มี = ค่าตั้งต้นของแพลตฟอร์มนั้น */
  freq: Record<string, MassFreq>;
  /** เรื่องเดียวกันลงหลายแพลตฟอร์มได้ (ประหยัดงานถ่าย) · ไม่ระบุ = ได้ */
  share?: boolean;
  platforms: MassPlatform[]; pillars: string[]; campaign: string;
  specialDays: SpecialDay[];
  /** เวลาที่ใช้ประจำต่อวัน เช่น "อา 19:00 · จ 14:00" */
  recommendedTimes?: string;
  /** แนวทางการเขียนของแบรนด์ (พรอมต์แคปชั่นที่ตั้งไว้) */
  tone?: string;
  extra?: string;
  /** บรรทัดจากการ์ดรู้จักแบรนด์ (brandProfileLines) — ว่าง = ยังไม่ได้ทำการ์ด */
  brandProfile?: string[];
  /** เทรนด์ที่ทีมคัดไว้ในบอร์ด 🔥 เทรนด์ (activeTrends) */
  trends?: MassTrend[];
  /** สั่งให้ AI ข้างนอก (ChatGPT/Gemini) ค้นเว็บหาเทรนด์ล่าสุดก่อนวางแผน — ใช้กับ prompt ที่ก๊อปไปถามเท่านั้น */
  searchTrends?: boolean;
};

// ── เทรนด์จากบอร์ด 🔥 เทรนด์ (erp_creative_trends) ──
export type MassTrend = { title: string; summary: string; heat: string; url: string | null };
export type TrendRowLike = {
  title: string; summary?: string | null; heat?: string | null; brand_id?: string | null; source_url?: string | null;
  start_date?: string | null; end_date?: string | null; is_active?: boolean | null;
};
const HEAT_TH: Record<string, string> = { hot: "มาแรงตอนนี้", rising: "กำลังมา" };
/** เทรนด์ที่ใช้กับแผนนี้ได้ = เปิดอยู่ · มาแรง/กำลังมา · ของแบรนด์นี้หรือทุกแบรนด์ · ช่วงวันทับกับแผน (ไม่มีวันหมด = ใช้ได้) */
export function activeTrends(rows: TrendRowLike[], brandId: string | null, start: string, end: string, limit = 8): MassTrend[] {
  return rows
    .filter((r) => r.is_active !== false && !!HEAT_TH[r.heat ?? ""] && (!r.brand_id || r.brand_id === brandId)
      && (!r.end_date || r.end_date >= start) && (!r.start_date || r.start_date <= end) && r.title?.trim())
    .sort((a, b) => (a.heat === b.heat ? 0 : a.heat === "hot" ? -1 : 1))
    .slice(0, limit)
    .map((r) => ({ title: r.title.trim(), summary: (r.summary ?? "").replace(/\s*\n\s*/g, " · ").trim().slice(0, 300), heat: r.heat ?? "rising", url: r.source_url?.trim() || null }));
}
export const trendLabel = (t: MassTrend) => `${t.title} (${HEAT_TH[t.heat] ?? t.heat})`;

export const MASS_PLAN_COLUMNS = ["วันที่", "เวลา", "แพลตฟอร์ม", "แนว", "หัวข้อ", "แคปชั่น", "แฮชแท็ก", "ไอเดียรูป/คลิป"] as const;
/** แคปชั่นในตารางต้องอยู่บรรทัดเดียว — ให้ AI ใช้เครื่องหมายนี้แทนการขึ้นบรรทัด แล้วระบบแปลงกลับ */
export const LINE_BREAK_MARK = "//";

/** บริบทร่วมของงานวางแผน (ใช้ทั้ง prompt ก๊อปไปถามเอง และ AI ในระบบ) */
export const briefFreq = (b: MassPlanBrief, code: string): MassFreq => b.freq[code] ?? freqHint(code).def;

export function buildMassPlanContext(b: MassPlanBrief, only?: MassPlatform[]): string[] {
  const plats = only ?? b.platforms;
  const lines = [
    `แบรนด์: ${b.brandName}`,
    `ช่วงวันที่: ${thaiDateLabel(b.start)} – ${thaiDateLabel(b.end)}`,
    "แพลตฟอร์มและจำนวนโพสต์ (กระจายทั้งช่วง ไม่กองวันเดียว):",
    ...plats.map((p) => { const f = briefFreq(b, p.code); return `- ${p.label}: ${freqLabel(f)} (≈ ${countForRange(f, b.start, b.end)} โพสต์ในช่วงนี้)`; }),
    ...(plats.length > 1
      ? [b.share === false
        ? "- แต่ละแพลตฟอร์มต้องเป็นเรื่องของตัวเอง ห้ามใช้หัวข้อหรือไอเดียรูปซ้ำข้ามแพลตฟอร์ม"
        : "- เรื่องเดียวกันลงหลายแพลตฟอร์มได้ (ทีมทำรูป/คลิปชุดเดียวใช้หลายที่) · แพลตฟอร์มที่ลงบ่อยกว่าค่อยเสริมเรื่องเฉพาะของตัวเอง"]
      : []),
    `แนวคอนเทนต์ที่ใช้ได้: ${b.pillars.length ? b.pillars.join(", ") : "เลือกเองตามความเหมาะสม"}`,
    `สินค้า/แคมเปญช่วงนี้: ${b.campaign.trim() || "ไม่ระบุ — เน้นสินค้าเด่นของแบรนด์"}`,
  ];
  if (b.specialDays.length) lines.push(`วันสำคัญในช่วงนี้ (วางโพสต์ให้รับกัน): ${b.specialDays.map((d) => `${thaiDateLabel(d.date)} ${d.label}`).join(" · ")}`);
  if (b.recommendedTimes?.trim()) lines.push(`เวลาโพสต์ที่ใช้ประจำ: ${b.recommendedTimes.trim()}`);
  if (b.brandProfile?.length) lines.push("", ...b.brandProfile);
  if (b.tone?.trim()) lines.push("", "แนวทางการเขียนของแบรนด์ (รอบนี้ไม่มีรูปแนบ ให้คิดจากสินค้า/แคมเปญ):", b.tone.trim());
  if (b.trends?.length) {
    lines.push("", "เทรนด์ที่ทีมคัดไว้ (ใช้กับโพสต์ที่เข้ากับแบรนด์เท่านั้น ไม่ต้องทุกโพสต์):",
      ...b.trends.map((t) => `- ${trendLabel(t)}${t.summary ? `: ${t.summary}` : ""}${t.url ? ` · ที่มา ${t.url}` : ""}`));
  }
  lines.push("", "วิธีเขียนของแต่ละแพลตฟอร์ม:", ...plats.map((p) => `- ${p.label}: ${platformRule(p)}`));
  if (b.extra?.trim()) lines.push("", `คำสั่งเพิ่มครั้งนี้: ${b.extra.trim()}`);
  lines.push("", "ข้อห้าม: ห้ามแต่งราคา/ส่วนลด/ขนาด/วัสดุเป็นตัวเลขเอง (พูดถึงโปรได้เฉพาะที่ให้ไว้ในแคมเปญ) · ไม่ต้องใส่ลิงก์ในแคปชั่น (ระบบเติมลิงก์/ราคา/ชื่อร้านจากแม่แบบแคปชั่นให้เอง)");
  return lines;
}

/** มีคอลัมน์ "เทรนด์ที่ใช้" ไหม (ให้ค้นเทรนด์ หรือมีเทรนด์จากบอร์ด) */
export const usesTrends = (b: MassPlanBrief) => !!b.searchTrends || !!b.trends?.length;
export function massPlanColumns(b: MassPlanBrief): string[] {
  return usesTrends(b) ? [...MASS_PLAN_COLUMNS, "เทรนด์ที่ใช้"] : [...MASS_PLAN_COLUMNS];
}

/** prompt สำเร็จรูปให้ก๊อปไปถาม ChatGPT / Claude / Gemini — ตอบเป็นตารางที่วางกลับเข้าระบบได้ */
export function buildMassPlanPrompt(b: MassPlanBrief, only?: MassPlatform[]): string {
  const plats = only ?? b.platforms;
  const search = b.searchTrends
    ? [
      `ขั้นที่ 1 — หาเทรนด์: ค้นเว็บหาเทรนด์ล่าสุดบนโซเชียลไทย (TikTok / Instagram / Facebook) ที่ยังมาแรงในช่วง ${thaiDateLabel(b.start)} – ${thaiDateLabel(b.end)} และเข้ากับแบรนด์และลูกค้ากลุ่มนี้ 3–5 เรื่อง สรุปเป็นข้อสั้น ๆ (ไม่ต้องทำเป็นตาราง) พร้อมลิงก์ที่มาจริง`,
      "- ต้องเป็นของจริงที่ค้นเจอเท่านั้น ถ้าค้นเว็บไม่ได้ให้บอกตรง ๆ แล้วใช้เฉพาะเทรนด์ที่ทีมคัดไว้ (ถ้ามี) ห้ามแต่งเทรนด์ขึ้นเอง",
      "",
      "ขั้นที่ 2 — ตารางแผน: ตามด้วยตารางเดียว ไม่ต้องอธิบายเพิ่ม มีคอลัมน์ตามลำดับนี้:",
    ]
    : ["ตอบเป็นตารางอย่างเดียว ไม่ต้องอธิบาย มีคอลัมน์ตามลำดับนี้:"];
  return [
    `คุณคือนักวางแผนคอนเทนต์โซเชียลมีเดียของแบรนด์ "${b.brandName}" ช่วยวางแผนโพสต์ตามข้อมูลนี้`,
    "",
    ...buildMassPlanContext(b, plats),
    "",
    ...search,
    massPlanColumns(b).join(" | "),
    "- 1 แถว = 1 โพสต์ ใน 1 แพลตฟอร์ม · วันที่แบบ 3/11/2569 (พ.ศ.) · เวลาแบบ 19:00",
    `- แคปชั่นเขียนในบรรทัดเดียว ถ้าต้องการขึ้นบรรทัดใหม่ให้ใช้ " ${LINE_BREAK_MARK} " คั่น`,
    "- แฮชแท็กคั่นด้วยช่องว่าง · แพลตฟอร์มที่ไม่ใช้แคปชั่นให้เว้นช่องแคปชั่น/แฮชแท็กว่าง แต่ใส่ไอเดียรูป",
    ...(plats.length > 1 && b.share !== false ? ['- เรื่องเดียวกันที่ลงหลายแพลตฟอร์มในวัน-เวลาเดียวกัน ให้ใช้ "หัวข้อ" เดียวกันเป๊ะ (ระบบจะรวมเป็นโพสต์เดียว)'] : []),
    ...(usesTrends(b) ? ["- เทรนด์ที่ใช้ = ชื่อเทรนด์ (+ ลิงก์ที่มา ถ้ามี) · ใส่เฉพาะโพสต์ที่ใช้เทรนด์จริง ที่เหลือเว้นว่าง"] : []),
  ].join("\n");
}

// ═══════════════ อ่านคำตอบที่วางกลับมา ═══════════════

export type MassRawRow = { line: number; date: string; time: string; platform: string; pillar: string; title: string; caption: string; hashtags: string; idea: string; trend?: string };
const FIELDS = ["date", "time", "platform", "pillar", "title", "caption", "hashtags", "idea", "trend"] as const;
type Field = (typeof FIELDS)[number];
const HEADER_ALIASES: Record<Field, RegExp> = {
  date: /^(วันที่|วัน|date|วันที่โพสต์)$/i,
  time: /^(เวลา|time|เวลาโพสต์)$/i,
  platform: /^(แพลตฟอร์ม|ช่องทาง|platform|channel)$/i,
  pillar: /^(แนว|แนวคอนเทนต์|pillar|content pillar)$/i,
  title: /^(หัวข้อ|ชื่อโพสต์|ชื่อคอนเทนต์|title|topic)$/i,
  caption: /^(แคปชั่น|แคปชัน|caption|ข้อความ)$/i,
  hashtags: /^(แฮชแท็ก|แฮชแท็ค|hashtags?)$/i,
  idea: /^(ไอเดียรูป\/คลิป|ไอเดียรูป|ไอเดียคลิป|ไอเดีย|รูป\/คลิป|idea|visual)$/i,
  trend: /^(เทรนด์|trend)/i,
};
const unbold = (s: string) => s.replace(/^\*\*([\s\S]*)\*\*$/, "$1").replace(/^__([\s\S]*)__$/, "$1").trim();
/** เครื่องหมายขึ้นบรรทัดที่ AI ใช้ (" // " หรือ <br>) → ขึ้นบรรทัดจริง · "https://" ไม่โดนเพราะต้องมีช่องว่างหน้า-หลัง */
const restoreBreaks = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/[ \t]+\/\/[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** ตาราง 2 มิติ → แถวดิบ · แถวแรกเป็นหัวตาราง = จับคอลัมน์ตามชื่อ (AI สลับลำดับได้) · ไม่มีหัว = ใช้ลำดับมาตรฐาน */
export function rowsFromGrid(grid: string[][]): MassRawRow[] {
  if (!grid.length) return [];
  let col: Partial<Record<Field, number>> = Object.fromEntries(FIELDS.map((f, i) => [f, i]));
  let body = grid;
  let first = 1;
  const head = grid[0].map(unbold);
  if (FIELDS.filter((f) => head.some((h) => HEADER_ALIASES[f].test(h))).length >= 3) {
    col = {};
    for (const f of FIELDS) { const i = head.findIndex((h) => HEADER_ALIASES[f].test(h)); if (i >= 0) col[f] = i; }
    body = grid.slice(1);
    first = 2;
  }
  return body
    .map((cells, i) => {
      const get = (f: Field) => (col[f] === undefined ? "" : unbold(cells[col[f] as number] ?? ""));
      return {
        line: i + first, date: get("date"), time: get("time"), platform: get("platform"), pillar: get("pillar"),
        title: restoreBreaks(get("title")).replace(/\n/g, " "), caption: restoreBreaks(get("caption")), hashtags: get("hashtags"), idea: restoreBreaks(get("idea")),
        trend: restoreBreaks(get("trend")).replace(/\n/g, " ").replace(/^[-–—]$/, ""),
      };
    })
    .filter((r) => r.date || r.title || r.platform || r.caption);
}

const headerHits = (row: string[]) => FIELDS.filter((f) => row.some((h) => HEADER_ALIASES[f].test(unbold(h)))).length;
/**
 * คำตอบที่วางกลับมา → แถวดิบ · ถ้ามีตาราง Markdown หลายก้อน (เช่น AI ทำตารางเทรนด์แยกไว้ก่อน)
 * เลือกก้อนที่หัวตารางตรงกับคอลัมน์แผน · ไม่เจอ = ก้อนที่ยาวสุด · ข้อความอธิบายนอกตารางถูกตัดทิ้ง · ไม่มีตาราง Markdown = อ่านแบบ Tab/CSV
 */
export function parseMassPlanText(text: string): MassRawRow[] {
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const l of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (l.trim().startsWith("|")) cur.push(l);
    else if (l.trim()) { if (cur.length) blocks.push(cur); cur = []; }
  }
  if (cur.length) blocks.push(cur);
  if (blocks.length) {   // มีตาราง Markdown = ใช้เฉพาะบรรทัดตาราง (ตัดข้อความอธิบาย เช่น สรุปเทรนด์ ทิ้ง)
    const grids = blocks.map((b) => parseTableText(b.join("\n"))).filter((g) => g.length);
    const best = grids.find((g) => headerHits(g[0]) >= 3) ?? [...grids].sort((a, b) => b.length - a.length)[0];
    return best ? rowsFromGrid(best) : [];
  }
  return rowsFromGrid(parseTableText(text));
}

/** "19:00" · "19.00 น." · "9:5" → "HH:MM" · อ่านไม่ออก = "" */
export function normTime(s: string): string {
  const m = String(s ?? "").trim().match(/^(\d{1,2})[:.](\d{1,2})/);
  if (!m) return "";
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : "";
}

const squash = (s: string) => String(s ?? "").toLowerCase().replace(/[\s_\-./]/g, "");
const PLATFORM_ALIASES: Record<string, string[]> = {
  facebook: ["fb", "เฟซบุ๊ก", "เฟสบุ๊ค", "เฟสบุ๊ก", "เฟซบุ๊ค", "facebookpage"],
  instagram: ["ig", "ไอจี", "insta", "igreels", "instagramreels"],
  tiktok: ["tt", "ติ๊กต็อก", "ติ๊กต๊อก", "ติ๊กตอก"],
  line_oa: ["line", "ไลน์", "lineoa", "lineofficial", "lineofficialaccount", "ไลน์โอเอ"],
  line_shopping: ["lineshopping", "ไลน์ช้อปปิ้ง"],
  youtube: ["yt", "youtubeshorts", "shorts", "ยูทูป", "ยูทูบ"],
  x: ["twitter", "ทวิตเตอร์", "xtwitter"],
  website: ["web", "เว็บ", "เว็บไซต์", "site"],
  shopee: ["ช้อปปี้"],
  lazada: ["ลาซาด้า"],
  pinterest: ["pin", "พินเทอเรส"],
};
/** ชื่อแพลตฟอร์มที่ AI/คนพิมพ์มา → code ในระบบ (ไม่รู้จัก = null) */
export function matchPlatform(raw: string, platforms: { code: string; label: string }[]): string | null {
  const k = squash(raw);
  if (!k) return null;
  const direct = platforms.find((p) => squash(p.code) === k || squash(p.label) === k);
  if (direct) return direct.code;
  return platforms.find((p) => (PLATFORM_ALIASES[p.code] ?? []).some((a) => squash(a) === k))?.code ?? null;
}

/** ชื่อแนวที่ AI ตอบ → id แนวในระบบ (ตรงตัวก่อน แล้วค่อยดูว่าคำหนึ่งอยู่ในอีกคำ) */
export function matchPillar(raw: string, pillars: MassPillar[]): string | null {
  const k = squash(raw);
  if (!k) return null;
  const exact = pillars.find((p) => squash(p.name) === k);
  if (exact) return exact.id;
  return pillars.find((p) => { const n = squash(p.name); return n.length > 1 && (k.includes(n) || n.includes(k)); })?.id ?? null;
}

/** แฮชแท็กจากช่อง → "#a #b" (เติม # ให้ · ตัดซ้ำแบบไม่สนตัวพิมพ์) */
export function normalizeHashtagText(...parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts.join(" ").split(/[\s,]+/)) {
    const v = raw.trim();
    if (!v || v === "#") continue;
    const tag = v.startsWith("#") ? v : `#${v}`;
    const key = tag.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(tag); }
  }
  return out.join(" ");
}

const normTitle = (s: string) => squash(s);

// ═══════════════ รวมเป็นโพสต์ + ตรวจ ═══════════════

export type IssueLevel = "error" | "warn" | "info";
export type MassIssue = { level: IssueLevel; text: string };
export type MassCaption = { platform: string; caption: string; hashtags: string; idea: string };
export type MassPost = {
  key: string; date: string; time: string; title: string;
  pillarId: string | null; pillarRaw: string;
  /** เทรนด์ที่ AI บอกว่าใช้ (ช่อง "เทรนด์ที่ใช้") — ว่าง = ไม่ได้ใช้ */
  trend: string;
  captions: MassCaption[];
  /** ผลตรวจทั้งหมด (ระดับโพสต์ + ระดับแถว) · rowIssues = เฉพาะที่มาจากแถว (ไม่เปลี่ยนเมื่อแก้วัน/หัวข้อ) */
  issues: MassIssue[]; rowIssues: MassIssue[];
  /** ติ๊กให้ลงไหม (ผู้ใช้เปลี่ยนได้ ยกเว้น blocked) */
  include: boolean;
  /** ลงไม่ได้เลย (วันที่ผ่านแล้ว / ไม่มีแพลตฟอร์มที่ลงได้) */
  blocked: boolean;
  lines: number[];
};
export type ExistingContent = { date: string | null; title: string; platforms: string[] };
export type GroupContext = {
  platforms: MassPlatform[]; pillars: MassPillar[]; todayKey: string;
  /** คอนเทนต์เดิมของแบรนด์เดียวกัน (ไม่รวมยกเลิก/เทมเพลต) — ใช้เตือนวันชน */
  existing: ExistingContent[];
  /** เวลาตั้งต้นเมื่อแถวไม่มีเวลา (ตามวันในสัปดาห์) */
  defaultTime?: (dateKey: string) => string | null;
};

export function groupMassPlan(rows: MassRawRow[], ctx: GroupContext): { posts: MassPost[]; errors: MassIssue[] } {
  const errors: MassIssue[] = [];
  const byKey = new Map<string, MassPost>();
  const seen = new Set<string>();
  const label = (code: string) => ctx.platforms.find((p) => p.code === code)?.label ?? code;

  for (const r of rows) {
    const date = parseDateCell(r.date);
    if (!date || !isRealDate(date)) { errors.push({ level: "error", text: `บรรทัด ${r.line}: อ่านวันที่ "${r.date || "(ว่าง)"}" ไม่ออก — ข้ามแถวนี้` }); continue; }
    const t = normTime(r.time);
    const time = t || ctx.defaultTime?.(date) || "10:00";
    const title = r.title.trim() || r.caption.split("\n")[0].slice(0, 60).trim() || "(ไม่มีหัวข้อ)";
    const key = `${date}|${time}|${normTitle(title)}`;
    let post = byKey.get(key);
    if (!post) {
      const pillarId = matchPillar(r.pillar, ctx.pillars);
      post = { key, date, time, title, pillarId, pillarRaw: r.pillar, trend: (r.trend ?? "").trim(), captions: [], issues: [], rowIssues: [], include: true, blocked: false, lines: [] };
      if (!t) post.rowIssues.push({ level: "info", text: `ไม่มีเวลา — ใช้ ${time}` });
      if (!r.title.trim()) post.rowIssues.push({ level: "info", text: "ไม่มีหัวข้อ — ใช้ต้นแคปชั่นแทน" });
      if (r.pillar.trim() && !pillarId) post.rowIssues.push({ level: "info", text: `ไม่รู้จักแนว "${r.pillar}" — ลงแบบไม่ระบุแนว` });
      byKey.set(key, post);
    }
    post.lines.push(r.line);
    if (!post.trend && r.trend?.trim()) post.trend = r.trend.trim();

    const code = matchPlatform(r.platform, ctx.platforms);
    if (!code) { post.rowIssues.push({ level: "warn", text: `ไม่มีแพลตฟอร์ม "${r.platform || "(ว่าง)"}" ในระบบ — ตัดออก` }); continue; }
    if (seen.has(`${key}|${code}`)) { post.rowIssues.push({ level: "warn", text: `${label(code)} ซ้ำในชุด — ใช้แถวแรก` }); continue; }
    seen.add(`${key}|${code}`);
    const plat = ctx.platforms.find((p) => p.code === code);
    const caption = r.caption.trim();
    const hashtags = plat?.useHashtags === false ? "" : normalizeHashtagText(r.hashtags);
    if (plat?.useCaption !== false && !caption) post.rowIssues.push({ level: "warn", text: `${label(code)} ยังไม่มีแคปชั่น — ลงเป็นร่างได้ เติมทีหลัง` });
    if (caption) {
      const lim = captionLimitCheck(code, hashtags ? `${caption}\n\n${hashtags}` : caption);
      if (lim.over > 0) post.rowIssues.push({ level: "warn", text: `${label(code)} ยาวเกิน ${lim.over} ตัวอักษร (ได้สูงสุด ${lim.max})` });
      if (lim.hashtagsOver > 0) post.rowIssues.push({ level: "warn", text: `${label(code)} แฮชแท็กเกิน ${lim.hashtagsOver} อัน` });
    }
    post.captions.push({ platform: code, caption, hashtags, idea: r.idea.trim() });
  }

  const posts = [...byKey.values()].map((p) => checkPost(p, ctx)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.title.localeCompare(b.title, "th"));
  return { posts, errors };
}

/**
 * ตรวจระดับโพสต์ (วันที่ผ่าน/วันผิด · ไม่มีแพลตฟอร์ม · ชนของเดิม) แล้วรวมกับผลตรวจของแถว
 * เรียกซ้ำได้หลังผู้ใช้แก้วัน/เวลา/หัวข้อในหน้าตรวจ — ค่า include กลับเป็นค่าตามกติกา
 */
export function checkPost(p: MassPost, ctx: Pick<GroupContext, "platforms" | "todayKey" | "existing">): MassPost {
  const label = (code: string) => ctx.platforms.find((x) => x.code === code)?.label ?? code;
  const issues: MassIssue[] = [];
  let blocked = false;
  let include = true;
  if (!p.captions.length) { blocked = true; issues.push({ level: "error", text: "ไม่มีแพลตฟอร์มที่ลงได้" }); }
  else if (!isRealDate(p.date)) { blocked = true; issues.push({ level: "error", text: "วันที่ไม่ถูกต้อง" }); }
  else if (p.date < ctx.todayKey) { blocked = true; issues.push({ level: "error", text: "วันที่ผ่านไปแล้ว — ไม่ลง" }); }
  else if (!p.title.trim()) { blocked = true; issues.push({ level: "error", text: "ต้องมีหัวข้อ" }); }
  else {
    const sameDay = ctx.existing.filter((e) => e.date === p.date);
    if (sameDay.some((e) => normTitle(e.title) === normTitle(p.title))) {
      include = false;
      issues.push({ level: "warn", text: "วันนี้มีโพสต์หัวข้อนี้อยู่แล้ว (อาจเคยลงชุดนี้) — ไม่ได้ติ๊กให้ ติ๊กเองได้ถ้าตั้งใจ" });
    } else {
      const clash = p.captions.map((c) => c.platform).filter((code) => sameDay.some((e) => e.platforms.includes(code)));
      if (clash.length) issues.push({ level: "warn", text: `วันนี้ ${clash.map(label).join(", ")} มีโพสต์เดิมแล้ว — ลงเพิ่ม ไม่ทับ` });
    }
  }
  return { ...p, issues: [...issues, ...p.rowIssues], blocked, include: blocked ? false : include };
}

/** ระดับรวมของโพสต์ (ไว้ใส่สี/ไอคอน) */
export function postLevel(p: MassPost): "error" | "warn" | "ok" {
  if (p.blocked) return "error";
  return p.issues.some((i) => i.level === "warn" || i.level === "error") ? "warn" : "ok";
}

// ═══════════════ ส่งไปบันทึก ═══════════════

export type MassCreatePost = {
  date: string; time: string; title: string; pillar_id: string | null; brief: string | null;
  platform_formats?: Record<string, string>;
  captions: { platform: string; caption: string; hashtags: string }[];
};
export const MASS_MAX_POSTS = 200;
/** AI ในระบบร่างได้ครั้งละไม่เกินกี่แถว (โพสต์ × แพลตฟอร์ม) — เกินนี้คำตอบยาวจนโดนตัด */
export const MASS_AI_MAX_ROWS = 160;

/** ไอเดียรูป/คลิปต่อแพลตฟอร์ม → บรีฟ (เหมือนกันทุกแพลตฟอร์ม = บรรทัดเดียว) */
export function briefFromCaptions(captions: MassCaption[], label: (code: string) => string): string | null {
  const ideas = captions.filter((c) => c.idea.trim());
  if (!ideas.length) return null;
  const uniq = new Set(ideas.map((c) => c.idea.trim()));
  if (uniq.size === 1) return [...uniq][0];
  return ideas.map((c) => `${label(c.platform)}: ${c.idea.trim()}`).join("\n");
}

/** บรีฟที่ลงคอนเทนต์ = เทรนด์ที่ใช้ (ถ้ามี) + ไอเดียรูป/คลิป */
export function massPostBrief(p: Pick<MassPost, "trend" | "captions">, label: (code: string) => string): string | null {
  const parts = [p.trend.trim() ? `เทรนด์: ${p.trend.trim()}` : "", briefFromCaptions(p.captions, label) ?? ""].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

/** ตรวจโพสต์ฝั่งเซิร์ฟเวอร์ (กันข้อมูลที่ข้ามหน้าตรวจมา) · ผ่าน = null */
export function validateCreatePost(p: Partial<MassCreatePost>, todayKey: string, validPlatforms: Set<string>): string | null {
  if (!p || typeof p !== "object") return "ข้อมูลไม่ถูกต้อง";
  if (!isRealDate(String(p.date ?? ""))) return "วันที่ไม่ถูกต้อง";
  if (String(p.date) < todayKey) return "วันที่ผ่านไปแล้ว";
  if (!normTime(String(p.time ?? ""))) return "เวลาไม่ถูกต้อง";
  if (!String(p.title ?? "").trim()) return "ไม่มีหัวข้อ";
  const caps = Array.isArray(p.captions) ? p.captions : [];
  if (!caps.length || !caps.every((c) => c && validPlatforms.has(String(c.platform)))) return "แพลตฟอร์มไม่ถูกต้อง";
  return null;
}
