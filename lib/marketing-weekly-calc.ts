/**
 * สรุปการตลาดรายสัปดาห์ — สูตรล้วน (ไม่แตะฐานข้อมูล · เทสต์ได้) · แผนการตลาด รอบ 8 (เจ้าของเลือก 2026-11-27 แบบ A + ข้อ 1-4)
 * --------------------------------------------------------------------------
 * - สัปดาห์ = จันทร์–อาทิตย์ เวลาไทย (weekStartOf)
 * - WeeklyData = ตัวเลขที่เก็บลง marketing_weekly_reports.data (ไม่คิดใหม่ย้อนหลัง → พิมพ์ซ้ำได้เหมือนเดิม)
 * - weeklyPrompt = ข้อความที่ส่งให้ AI (ตัวเลขล้วน ไม่มีชื่อลูกค้า) · parseWeeklyAi = แกะคำตอบ AI ให้อยู่ในรูปที่ปลอดภัย
 * - pushWeeklyHistory = เก็บเวอร์ชันก่อนแก้ (ย้อนกลับได้ · เก็บล่าสุด 20 เวอร์ชัน)
 * ฝั่งโหลดข้อมูล/เรียก AI = lib/marketing-weekly-server.ts
 */
import { shiftYmd } from "@/lib/platform-dashboard-calc";
import { campaignDaysBetween } from "@/lib/marketing-overview-calc";

/** วันแคมเปญ (เลขเบิ้ล/15/25) ในช่วง — ให้ AI รู้ว่ายอดขึ้น/ลงเพราะแคมเปญ ไม่ใช่ผิดปกติ */
export const campaignLabels = (r: { from: string; to: string }): string[] => campaignDaysBetween(r.from, r.to).map((c) => c.label).reverse();

/** วันจันทร์ของสัปดาห์ที่มีวันนี้ (YYYY-MM-DD) */
export function weekStartOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;   // จันทร์ = 0
  return shiftYmd(ymd, -dow);
}
/** สัปดาห์ที่แล้ว (จบแล้วทั้งสัปดาห์) ของวันนี้ */
export const lastFullWeek = (todayYmd: string): string => shiftYmd(weekStartOf(todayYmd), -7);
export const weekEndOf = (weekStart: string): string => shiftYmd(weekStart, 6);

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "17–23 พ.ย. 2569" / "28 ต.ค. – 3 พ.ย. 2569" */
export function weekLabel(weekStart: string): string {
  const end = weekEndOf(weekStart);
  const [y1, m1, d1] = weekStart.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  const be = (y: number) => y + 543;
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${TH_MONTH[m2 - 1]} ${be(y2)}`;
  if (y1 === y2) return `${d1} ${TH_MONTH[m1 - 1]} – ${d2} ${TH_MONTH[m2 - 1]} ${be(y2)}`;
  return `${d1} ${TH_MONTH[m1 - 1]} ${be(y1)} – ${d2} ${TH_MONTH[m2 - 1]} ${be(y2)}`;
}

export type Money2 = { cur: number; prev: number };
export type WeeklyData = {
  v: 1;
  week: { from: string; to: string }; prev: { from: string; to: string };
  brand: { id: string | null; name: string };
  sales: { cur: number; prev: number; orders: number; prevOrders: number; aov: number | null; prevAov: number | null; target: { month: string; target: number | null; mtd: number; pct: number | null } | null };
  channels: { code: string; name: string; cur: number; prev: number; orders: number }[];
  daily: { date: string; sales: number; orders: number }[];
  topProducts: { key: string; name: string; sales: number; qty: number; prev: number }[];
  rising: { name: string; cur: number; prev: number }[];
  falling: { name: string; cur: number; prev: number }[];
  cancels: { count: number; prev: number; storeFault: number };
  ads: { spend: number; sales: number; roas: number | null; prevSpend: number; prevSales: number; prevRoas: number | null; losing: { name: string; spend: number; roas: number | null }[] } | null;
  reviews: { count: number; avg: number | null; low: number; lowOpen: number; replyRate: number; windowDays: number; samples: { rating: number; text: string }[] };
  posts: { platform: string; posts: number; engagement: number; avg: number }[];
  topPosts: { platform: string; text: string; engagement: number; link: string | null }[];
  alerts: { level: string; title: string; body: string }[];
  notes: string[];
};

export const pctChange = (cur: number, prev: number): number | null => (prev > 0 ? (cur - prev) / prev : null);

/** สินค้าที่ขึ้น/ลงแรง (เทียบสัปดาห์ก่อน) — ตัดของเล็ก ๆ ทิ้ง (ฐานไม่ถึง minBase) */
export function movers(rows: readonly { name: string; cur: number; prev: number }[], opts: { minBase?: number; n?: number } = {}) {
  const minBase = opts.minBase ?? 1000, n = opts.n ?? 5;
  const ok = rows.filter((r) => Math.max(r.cur, r.prev) >= minBase);
  const rising = ok.filter((r) => r.cur > r.prev * 1.3).sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev)).slice(0, n);
  const falling = ok.filter((r) => r.cur < r.prev * 0.7).sort((a, b) => (a.cur - a.prev) - (b.cur - b.prev)).slice(0, n);
  return { rising, falling };
}

/** เลือกตัวอย่างรีวิวที่มีข้อความ ให้ AI อ่าน: ดาวต่ำก่อน แล้วค่อยดาวสูง (ตัดยาว · ไม่มีชื่อผู้รีวิว) */
export function reviewSamples(rows: readonly { rating: number | null; comment: string | null }[], max = 40): { rating: number; text: string }[] {
  const withText = rows.filter((r) => r.rating != null && (r.comment ?? "").trim().length >= 4)
    .map((r) => ({ rating: r.rating as number, text: (r.comment as string).replace(/\s+/g, " ").trim().slice(0, 200) }));
  const low = withText.filter((r) => r.rating <= 3);
  const high = withText.filter((r) => r.rating > 3);
  const lowN = Math.min(low.length, Math.ceil(max / 2));
  return [...low.slice(0, lowN), ...high.slice(0, max - lowN)];
}

const baht = (n: number) => `฿${Math.round(n).toLocaleString("en-US")}`;
const pctTxt = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "+" : ""}${(p * 100).toFixed(0)}%`);

/** ข้อความที่ส่งให้ AI — ตัวเลขสรุปล้วน */
export function weeklyPrompt(d: WeeklyData): string {
  const L: string[] = [];
  L.push(`สัปดาห์ ${d.week.from} ถึง ${d.week.to} · แบรนด์: ${d.brand.name}`);
  L.push(`ยอดขาย ${baht(d.sales.cur)} (สัปดาห์ก่อน ${baht(d.sales.prev)} · ${pctTxt(pctChange(d.sales.cur, d.sales.prev))}) · ออเดอร์ ${d.sales.orders} (ก่อน ${d.sales.prevOrders}) · ต่อบิล ${d.sales.aov ? baht(d.sales.aov) : "—"}`);
  if (d.sales.target?.target) L.push(`เป้าเดือน ${d.sales.target.month}: ${baht(d.sales.target.target)} · ทำได้แล้ว ${baht(d.sales.target.mtd)} (${d.sales.target.pct == null ? "—" : `${Math.round(d.sales.target.pct * 100)}% ของเป้า`})`);
  const cc = campaignLabels(d.week), cp = campaignLabels(d.prev);
  if (cc.length || cp.length) L.push(`วันแคมเปญ: สัปดาห์นี้ ${cc.join(", ") || "ไม่มี"} · สัปดาห์ก่อน ${cp.join(", ") || "ไม่มี"} (ยอดช่วงวันแคมเปญสูงกว่าปกติมาก — เทียบอย่างระวัง)`);
  if (d.channels.length) L.push("ช่องทาง: " + d.channels.map((c) => `${c.name} ${baht(c.cur)} (${pctTxt(pctChange(c.cur, c.prev))})`).join(" · "));
  if (d.topProducts.length) L.push("ขายดี: " + d.topProducts.slice(0, 8).map((p) => `${p.name} ${baht(p.sales)}`).join(" · "));
  if (d.rising.length) L.push("ขึ้นแรง: " + d.rising.map((p) => `${p.name} ${baht(p.prev)}→${baht(p.cur)}`).join(" · "));
  if (d.falling.length) L.push("ตกแรง: " + d.falling.map((p) => `${p.name} ${baht(p.prev)}→${baht(p.cur)}`).join(" · "));
  L.push(`ยกเลิก ${d.cancels.count} ใบ (ก่อน ${d.cancels.prev}) · เพราะฝั่งร้าน ${d.cancels.storeFault}`);
  if (d.ads) {
    L.push(`โฆษณา: ใช้ ${baht(d.ads.spend)} ได้ยอด ${baht(d.ads.sales)} ROAS ${d.ads.roas?.toFixed(1) ?? "—"} (ก่อน ${baht(d.ads.prevSpend)} / ROAS ${d.ads.prevRoas?.toFixed(1) ?? "—"})`);
    if (d.ads.losing.length) L.push("แคมเปญขาดทุน: " + d.ads.losing.map((c) => `${c.name} ใช้ ${baht(c.spend)} ROAS ${c.roas?.toFixed(1) ?? "—"}`).join(" · "));
  }
  L.push(`รีวิว ${d.reviews.count} (ดาวเฉลี่ย ${d.reviews.avg?.toFixed(2) ?? "—"} · 1-3 ดาว ${d.reviews.low} · ยังไม่ตอบ ${d.reviews.lowOpen})`);
  if (d.posts.length) L.push("โพสต์: " + d.posts.map((p) => `${p.platform} ${p.posts} โพสต์ เฉลี่ย ${Math.round(p.avg)} interaction`).join(" · "));
  if (d.alerts.length) L.push("เรื่องที่ระบบเตือน: " + d.alerts.map((a) => a.title).join(" · "));
  if (d.reviews.samples.length) {
    L.push("", `ตัวอย่างรีวิวลูกค้า (${d.reviews.windowDays} วันล่าสุด · ดาว: ข้อความ):`);
    for (const s of d.reviews.samples) L.push(`- ${s.rating}★ ${s.text}`);
  }
  return L.join("\n");
}

export const WEEKLY_SYSTEM = "คุณคือที่ปรึกษาการตลาดออนไลน์ของร้านค้าไทยบน Shopee/Lazada/TikTok/LINE ตอบเป็นภาษาไทยที่เจ้าของร้าน (ไม่ใช่นักการตลาด) อ่านเข้าใจทันที ใช้เฉพาะตัวเลขที่ให้มา ห้ามแต่งตัวเลขหรือข้อเท็จจริงเอง ตอบเป็น JSON ตามรูปแบบที่ขอเท่านั้น";
export const WEEKLY_ASK = [
  "จากข้อมูลข้างบน เขียนสรุปสำหรับประชุมทีมการตลาดสัปดาห์นี้ ตอบ JSON:",
  `{"summary": "บทสรุป 3-5 ประโยค: ภาพรวมดีขึ้น/แย่ลงเพราะอะไร เรื่องเด่น เรื่องที่น่าห่วง",`,
  ` "actions": [{"text": "สิ่งที่ควรทำสัปดาห์หน้า (สั่งงานได้จริง ระบุสินค้า/ช่องทาง/แคมเปญ)", "why": "เหตุผลสั้น ๆ อ้างตัวเลข"}] 3-5 ข้อ เรียงสำคัญสุดก่อน,`,
  ` "praise": ["สิ่งที่ลูกค้าชมบ่อย (สรุปจากรีวิว)"] ไม่เกิน 5 ข้อ,`,
  ` "complaints": ["สิ่งที่ลูกค้าบ่นบ่อย + ควรแก้อะไร"] ไม่เกิน 5 ข้อ}`,
  "- ไม่มีรีวิวให้อ่าน = praise/complaints เป็น [] · ห้ามใส่ชื่อลูกค้า",
].join("\n");

export type WeeklyAction = { text: string; why?: string; done?: boolean };
export type WeeklyReview = { praise: string[]; complaints: string[] };
const strs = (v: unknown, max: number, len = 300): string[] =>
  (Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x.trim().slice(0, len) : "")).filter(Boolean).slice(0, max);

/** แกะคำตอบ AI → รูปที่ปลอดภัย (ช่องหาย/ผิดชนิด = ค่าว่าง) */
export function parseWeeklyAi(raw: Record<string, unknown> | null | undefined): { summary: string; actions: WeeklyAction[]; review: WeeklyReview } {
  const r = raw ?? {};
  const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 3000) : "";
  const actions = (Array.isArray(r.actions) ? r.actions : []).map((a) => {
    if (typeof a === "string") return { text: a.trim().slice(0, 400) };
    const o = (a ?? {}) as Record<string, unknown>;
    return { text: typeof o.text === "string" ? o.text.trim().slice(0, 400) : "", why: typeof o.why === "string" ? o.why.trim().slice(0, 400) : undefined };
  }).filter((a) => a.text).slice(0, 8).map((a) => ({ ...a, done: false }));
  return { summary, actions, review: { praise: strs(r.praise, 8), complaints: strs(r.complaints, 8) } };
}

/** ทำความสะอาดข้อความที่คนแก้ (จากหน้าเว็บ) */
export function cleanWeeklyEdit(b: { summary?: unknown; actions?: unknown; review?: unknown }): { summary?: string; actions?: WeeklyAction[]; review?: WeeklyReview } {
  const out: { summary?: string; actions?: WeeklyAction[]; review?: WeeklyReview } = {};
  if ("summary" in b) out.summary = typeof b.summary === "string" ? b.summary.slice(0, 5000) : "";
  if ("actions" in b) out.actions = (Array.isArray(b.actions) ? b.actions : []).map((a) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return { text: typeof o.text === "string" ? o.text.trim().slice(0, 600) : "", why: typeof o.why === "string" && o.why.trim() ? o.why.trim().slice(0, 600) : undefined, done: o.done === true };
  }).filter((a) => a.text).slice(0, 20);
  if ("review" in b) { const r = (b.review ?? {}) as Record<string, unknown>; out.review = { praise: strs(r.praise, 20, 600), complaints: strs(r.complaints, 20, 600) }; }
  return out;
}

export type WeeklyVersion = { at: string; by: string | null; summary: string | null; actions: unknown; review: unknown; reason: string };
/** เก็บเวอร์ชันก่อนแก้ไว้หน้าสุด (ล่าสุดก่อน) · เก็บ 20 เวอร์ชัน */
export function pushWeeklyHistory(history: unknown, v: WeeklyVersion, keep = 20): WeeklyVersion[] {
  const arr = Array.isArray(history) ? (history as WeeklyVersion[]) : [];
  return [v, ...arr].slice(0, keep);
}
