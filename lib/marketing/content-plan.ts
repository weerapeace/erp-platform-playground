/**
 * วางแผนคอนเทนต์ (หน้า /marketing/content-plan) — ค่าคงที่ + ตัวช่วยที่ใช้ร่วม (pure, ห้ามใส่ "use client")
 *
 * ใช้ข้อมูลชุดเดียวกับปฏิทินคอนเทนต์เดิม (erp_creative_content) — ไม่มีสถานะใหม่:
 *   💡 ไอเดีย      = status draft + ยังไม่ผูกงาน
 *   🎬 กำลังทำ     = status draft + ผูกงาน (ส่งให้ทีม Creative แล้ว)
 *   ✅ พร้อมโพสต์  = ready · 🗓️ ตั้งเวลาแล้ว = scheduled · 📤 โพสต์แล้ว = published
 *   (cancelled ไม่แสดงในแผน)
 */

export type PlanStage = "idea" | "making" | "ready" | "scheduled" | "published";

export const PLAN_STAGES: { key: PlanStage; label: string; icon: string; cls: string; dot: string }[] = [
  { key: "idea", label: "ไอเดีย", icon: "💡", cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-400" },
  { key: "making", label: "กำลังทำ", icon: "🎬", cls: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  { key: "ready", label: "พร้อมโพสต์", icon: "✅", cls: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  { key: "scheduled", label: "ตั้งเวลาแล้ว", icon: "🗓️", cls: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  { key: "published", label: "โพสต์แล้ว", icon: "📤", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
];
export const STAGE_META = Object.fromEntries(PLAN_STAGES.map((s) => [s.key, s])) as Record<PlanStage, (typeof PLAN_STAGES)[number]>;

/** ขั้นของคอนเทนต์ในแผน · null = ไม่แสดง (ยกเลิก) */
export function stageOf(c: { status?: string | null; task_id?: string | null }): PlanStage | null {
  switch (c.status) {
    case "ready": return "ready";
    case "scheduled": return "scheduled";
    case "published": return "published";
    case "cancelled": return null;
    default: return c.task_id ? "making" : "idea";
  }
}

/** ย้ายขั้นได้ไหมด้วยการลากบนบอร์ด: "กำลังทำ" ต้องผ่านปุ่ม "ส่งเป็นงาน" (ต้องสร้างงานจริง) · ออกจากกำลังทำ = ไม่ถอดงาน */
export function statusForStage(stage: PlanStage): "draft" | "ready" | "scheduled" | "published" | null {
  if (stage === "idea") return "draft";
  if (stage === "making") return null;
  return stage;
}

export const CONTENT_GOALS: { key: string; label: string; icon: string }[] = [
  { key: "awareness", label: "ให้รู้จัก", icon: "📣" },
  { key: "sales", label: "ขายของ", icon: "💰" },
  { key: "education", label: "ให้ความรู้", icon: "📚" },
  { key: "engagement", label: "ชวนคุย", icon: "💬" },
];
export const GOAL_META = Object.fromEntries(CONTENT_GOALS.map((g) => [g.key, g])) as Record<string, (typeof CONTENT_GOALS)[number]>;

// ── วันที่: คิดเป็น "วันตามเวลาเครื่อง (ไทย)" เสมอ — ห้ามใช้ toISOString() ตัดวัน (UTC ร่นไป 1 วัน) ──
const pad = (n: number) => String(n).padStart(2, "0");
/** Date → "YYYY-MM-DD" ตามเวลาเครื่อง */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// ── scheduled_at (วัน-เวลาโพสต์คอนเทนต์) — ข้อตกลงทั้งระบบ: เก็บ "เวลาไทยตามนาฬิกา" ตรง ๆ (ไม่แปลงเขตเวลา) ──
//    ป๊อปคอนเทนต์/ปฏิทิน/สร้างคอนเทนต์/Story/แคมเปญ บันทึก "YYYY-MM-DDTHH:MM" และอ่านด้วยการตัดข้อความมาตลอด
//    → โมดูลวางแผนต้องใช้ข้อตกลงเดียวกัน (เดิมแปลงเป็นเวลาสากล → โพสต์ช่วงเย็นไปโผล่วันถัดไป / ที่สร้างจากแผนเพี้ยน 7 ชม.)
const SCHED_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/;
/** scheduled_at → "YYYY-MM-DD" (เวลาไทยตามนาฬิกา) · ว่าง/ผิด = null */
export function dateKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = SCHED_RE.exec(iso);
  return m ? m[1] : null;
}
/** "YYYY-MM-DD" → Date เที่ยงคืนเวลาเครื่อง */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}
/** วันจันทร์ของสัปดาห์ที่มีวันนี้ */
export function weekStart(key: string): string {
  const d = parseDateKey(key);
  const dow = (d.getDay() + 6) % 7;   // จันทร์ = 0
  d.setDate(d.getDate() - dow);
  return localDateKey(d);
}
/** วัน + เวลาไทย (HH:MM) → ค่าที่บันทึกใน scheduled_at (รูปเดียวกับป๊อปคอนเทนต์ "YYYY-MM-DDTHH:MM:00") */
export function toScheduledIso(dateKey: string, time = "10:00"): string {
  const [hh, mm] = time.split(":").map(Number);
  return `${dateKey}T${pad(hh || 0)}:${pad(mm || 0)}:00`;
}
/** เวลา HH:MM ของ scheduled_at (เวลาไทยตามนาฬิกา — เพื่อคงเวลาเดิมตอนลากเปลี่ยนวัน) */
export function timeOf(iso: string | null | undefined, fallback = "10:00"): string {
  if (!iso) return fallback;
  const m = SCHED_RE.exec(iso);
  return m ? m[2] : fallback;
}

const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
export function dowLabel(key: string): string { return TH_DOW[parseDateKey(key).getDay()]; }
export function shortThaiDate(key: string): string {
  return parseDateKey(key).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

// ═══════════════ ก้อน 2: เป้ารายเดือน + สล็อตประจำสัปดาห์ ═══════════════

export const WEEKDAYS_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];   // index 0 = จันทร์ (ตรงกับ content_plan_slots.weekday)

/** placement_type = ประเภทการลง (เช่น shop_decor) · null = ทุกประเภท — นับเฉพาะคอนเทนต์ที่ติ๊ก "ลงที่ไหน" ตรงประเภท + ช่องทาง */
export type PlanTarget = { id: string; brand_id: string; placement_type?: string | null; platform: string; post_type: string | null; monthly_count: number; sort_order?: number };
export type PlanSlot = {
  id: string; brand_id: string; weekday: number; post_time: string; platform: string; post_type: string | null;
  pillar_id: string | null; title: string; is_active: boolean; sort_order?: number;
};
export type SlotDraft = { slot_id: string; date: string; time: string; title: string; platform: string; post_type: string | null; pillar_id: string | null };

// ── เวลาไทย ฝั่งเซิร์ฟเวอร์ (เครื่องเป็น UTC) — คิดด้วย offset +07:00 ตรง ๆ ไม่พึ่ง timezone ของเครื่อง ──
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
/** ISO (UTC) → "YYYY-MM-DD" ตามเวลาไทย (ใช้ได้ทั้ง client/server) */
export function bangkokDateKey(iso: string | Date): string {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime() + BKK_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}
/** วัน + เวลาไทย → ISO (UTC) */
export function bangkokIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}
/** ทุกวันที่ในเดือน "YYYY-MM" ที่ตรงกับ weekday (0 = จันทร์) — คำนวณแบบปฏิทินล้วน ไม่ขึ้นกับ timezone */
export function datesForWeekday(month: string, weekday: number): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    if (dow === weekday) out.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

/**
 * แผนที่จะสร้างจากสล็อตในเดือนนี้
 *   ข้ามวันที่ผ่านไปแล้ว (ก่อน todayKey) · ข้ามที่เคยสร้างจากสล็อตเดียวกันวันเดียวกันแล้ว (existing = "slotId|YYYY-MM-DD")
 */
export function planSlotsForMonth(slots: PlanSlot[], month: string, existing: Set<string>, todayKey: string): { create: SlotDraft[]; skippedPast: number; skippedExisting: number } {
  const create: SlotDraft[] = [];
  let skippedPast = 0, skippedExisting = 0;
  for (const s of slots) {
    if (!s.is_active) continue;
    for (const date of datesForWeekday(month, s.weekday)) {
      if (date < todayKey) { skippedPast++; continue; }
      if (existing.has(`${s.id}|${date}`)) { skippedExisting++; continue; }
      create.push({ slot_id: s.id, date, time: s.post_time, title: s.title, platform: s.platform, post_type: s.post_type, pillar_id: s.pillar_id });
    }
  }
  create.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { create, skippedPast, skippedExisting };
}

type ProgressItem = { brand_id?: string | null; platforms?: string[] | null; placements?: string[] | null; post_type?: string | null; scheduled_at?: string | null; status?: string | null; task_id?: string | null };
/** ความคืบหน้าเป้าในเดือน: วางแผนแล้ว (มีวันในเดือน ไม่ยกเลิก) / โพสต์แล้ว · ระบุประเภทการลง = นับเฉพาะที่ติ๊กประเภทนั้นบนช่องทางนั้น */
export function targetProgress(t: PlanTarget, items: ProgressItem[], month: string): { planned: number; published: number } {
  let planned = 0, published = 0;
  for (const c of items) {
    if (c.brand_id !== t.brand_id || c.status === "cancelled" || !c.scheduled_at) continue;
    if (t.placement_type ? !(c.placements ?? []).includes(placementId(t.placement_type, t.platform)) : !(c.platforms ?? []).includes(t.platform)) continue;
    if (t.post_type && !String(c.post_type ?? "").split(",").map((x) => x.trim()).includes(t.post_type)) continue;
    if ((dateKeyOf(c.scheduled_at) ?? "").slice(0, 7) !== month) continue;   // วันโพสต์ = เวลาไทยตามนาฬิกา (ข้อตกลง scheduled_at)
    planned++;
    if (c.status === "published") published++;
  }
  return { planned, published };
}

// ═══════════════ "ลงที่ไหน" แบบแบ่งประเภทการลง ═══════════════
/** ประเภทการลง เช่น แต่งร้าน (Shopee/Lazada/TikTok) · Story (Facebook/IG) — ตั้งค่าใน ui_config marketing_content_plan.placements */
export type PlacementType = { key: string; label: string; icon: string | null; platforms: string[] };

/** ค่าเริ่มต้นเมื่อยังไม่ได้ตั้ง (เจ้าของยกตัวอย่าง 2026-10-12 + โพสต์ฟีด) — แก้/ลบ/เพิ่มได้ที่ ⚙️ ตั้งค่า → ช่องทาง */
export const DEFAULT_PLACEMENTS: PlacementType[] = [
  { key: "shop_decor", label: "แต่งร้าน", icon: "🏪", platforms: ["shopee", "lazada", "tiktok"] },
  { key: "product", label: "ในสินค้า", icon: "🛍️", platforms: ["shopee", "lazada", "tiktok"] },
  { key: "story", label: "Story", icon: "📱", platforms: ["facebook", "instagram"] },
  { key: "feed", label: "โพสต์ฟีด", icon: "📰", platforms: ["facebook", "instagram", "tiktok"] },
];

export const placementId = (typeKey: string, platform: string) => `${typeKey}:${platform}`;
export function parsePlacement(id: string): { type: string; platform: string } | null {
  const i = id.indexOf(":");
  return i > 0 && i < id.length - 1 ? { type: id.slice(0, i), platform: id.slice(i + 1) } : null;
}
/** ช่องทางรวม (เก็บลง platforms เดิม) = ช่องทางจากประเภทการลง ∪ ช่องทางที่เลือกแบบไม่ระบุประเภท (ของเดิม) */
export function platformsFromPlacements(placements: string[], loosePlatforms: string[] = []): string[] {
  const out: string[] = [];
  for (const p of placements) { const x = parsePlacement(p); if (x && !out.includes(x.platform)) out.push(x.platform); }
  for (const p of loosePlatforms) if (!out.includes(p)) out.push(p);
  return out;
}
/** ป้ายประเภทการลงของคอนเทนต์บนช่องทางหนึ่ง เช่น ["แต่งร้าน","ในสินค้า"] (ใช้โชว์บนการ์ดในแถวช่องทางนั้น) */
export function placementLabelsFor(placements: string[] | null | undefined, platform: string | null, types: PlacementType[]): string[] {
  const byKey = new Map(types.map((t) => [t.key, t]));
  const out: string[] = [];
  for (const id of placements ?? []) {
    const x = parsePlacement(id);
    if (!x || (platform && x.platform !== platform)) continue;
    const t = byKey.get(x.type);
    const lbl = t ? `${t.icon ? `${t.icon} ` : ""}${t.label}` : x.type;
    if (!out.includes(lbl)) out.push(lbl);
  }
  return out;
}

// ═══════════════ 🔔 รอบเปลี่ยน — "อะไรต้องเปลี่ยนทุกกี่วัน" (content_refresh_rules) ═══════════════
/** กฎ: แบรนด์ × ประเภทการลง (ว่าง = ทุกประเภท) × ช่องทาง ต้องมีของใหม่ทุก every_days วัน · เตือนก่อน lead_days วัน */
export type RefreshRule = {
  id: string; brand_id: string; placement_type: string | null; platform: string;
  every_days: number; lead_days: number; title: string | null; is_active: boolean; sort_order?: number;
};
/**
 * สถานะของกฎ (เรียงจากด่วนสุด):
 *   overdue   = เลยรอบแล้ว ยังไม่มีของใหม่ลงวันไว้
 *   never     = ยังไม่เคยทำเลย และยังไม่ได้ลงวันไว้
 *   due_soon  = ใกล้ถึงรอบ (ภายใน lead_days) ยังไม่ได้ลงวันไว้
 *   late_plan = ลงวันไว้แล้ว แต่ช้ากว่าวันครบรอบ
 *   waiting   = ยังไม่ถึงรอบ (ยังไม่ต้องทำอะไร)
 *   prepared  = ลงวันไว้แล้วทันรอบ
 */
export type RefreshState = "overdue" | "never" | "due_soon" | "late_plan" | "waiting" | "prepared";
export const REFRESH_STATE_META: Record<RefreshState, { label: string; icon: string; cls: string; rank: number }> = {
  overdue: { label: "เลยรอบแล้ว", icon: "🔴", cls: "border-red-200 bg-red-50 text-red-700", rank: 0 },
  never: { label: "ยังไม่เคยทำ", icon: "⚪", cls: "border-slate-200 bg-slate-50 text-slate-600", rank: 1 },
  due_soon: { label: "ใกล้ถึงรอบ", icon: "⚠️", cls: "border-amber-200 bg-amber-50 text-amber-800", rank: 2 },
  late_plan: { label: "ลงไว้ช้ากว่ารอบ", icon: "🟠", cls: "border-orange-200 bg-orange-50 text-orange-700", rank: 3 },
  waiting: { label: "ยังไม่ถึงรอบ", icon: "⏳", cls: "border-slate-200 bg-white text-slate-500", rank: 4 },
  prepared: { label: "เตรียมแล้ว", icon: "✅", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", rank: 5 },
};
/** สถานะที่ต้องลงมือ (นับเป็นตัวเลขเตือนบนแท็บ) */
export const REFRESH_ALERT_STATES: RefreshState[] = ["overdue", "never", "due_soon"];

type RefreshItem = { id: string; title?: string | null; brand_id?: string | null; platforms?: string[] | null; placements?: string[] | null; scheduled_at?: string | null; status?: string | null };
export type RefreshStatus = {
  rule: RefreshRule; state: RefreshState;
  /** วันที่ทำรอบล่าสุด (ของที่ลงไปแล้ว) */
  lastDone: string | null;
  /** วันครบรอบถัดไป = lastDone + every_days · ยังไม่เคยทำ = null */
  nextDue: string | null;
  /** อีกกี่วันถึงรอบ (ติดลบ = เลยมาแล้ว) */
  daysLeft: number | null;
  /** ของที่ลงวันไว้สำหรับรอบถัดไป (ชิ้นที่เร็วที่สุด) */
  prepared: { id: string; title: string; date: string } | null;
  /** วันที่แนะนำให้ลงของใหม่ (= วันครบรอบ ถ้ายังไม่ผ่าน ไม่งั้น = วันนี้) */
  suggestDate: string;
};

/** สถานะที่ถือว่า "ลงไปแล้ว" เมื่อถึงวัน (แต่งร้านมักลงเองที่หลังร้าน ไม่ได้กดโพสต์ผ่านระบบ → พร้อมโพสต์/ตั้งเวลาแล้ว ก็นับ) */
const DONE_STATUSES = new Set(["published", "scheduled", "ready"]);

export function refreshRuleMatches(rule: Pick<RefreshRule, "brand_id" | "placement_type" | "platform">, c: RefreshItem): boolean {
  if (c.brand_id !== rule.brand_id || c.status === "cancelled" || !c.scheduled_at) return false;
  if (rule.placement_type) return (c.placements ?? []).includes(placementId(rule.placement_type, rule.platform));
  return (c.platforms ?? []).includes(rule.platform);
}

const dayDiff = (a: string, b: string) => Math.round((parseDateKey(a).getTime() - parseDateKey(b).getTime()) / 86400000);

/** คิดสถานะรอบเปลี่ยนของกฎหนึ่ง · todayKey = "YYYY-MM-DD" (เวลาไทย) · วันของคอนเทนต์คิดเป็นเวลาไทยเสมอ */
export function refreshStatus(rule: RefreshRule, items: RefreshItem[], todayKey: string): RefreshStatus {
  let lastDone: string | null = null;
  const upcoming: { id: string; title: string; date: string }[] = [];
  const matched = items.filter((c) => refreshRuleMatches(rule, c)).map((c) => ({ c, date: dateKeyOf(c.scheduled_at) ?? "" })).filter((x) => x.date);
  for (const { c, date } of matched) {
    if (date <= todayKey && DONE_STATUSES.has(String(c.status))) { if (!lastDone || date > lastDone) lastDone = date; }
  }
  for (const { c, date } of matched) {
    if (date >= todayKey && (!lastDone || date > lastDone)) upcoming.push({ id: c.id, title: c.title ?? "", date });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  const prepared = upcoming[0] ?? null;
  const nextDue = lastDone ? addDays(lastDone, rule.every_days) : null;
  const daysLeft = nextDue ? dayDiff(nextDue, todayKey) : null;
  let state: RefreshState;
  if (prepared) state = nextDue && prepared.date > nextDue ? "late_plan" : "prepared";
  else if (!nextDue) state = "never";
  else if (daysLeft! < 0) state = "overdue";
  else if (daysLeft! <= rule.lead_days) state = "due_soon";
  else state = "waiting";
  const suggestDate = nextDue && nextDue >= todayKey ? nextDue : todayKey;
  return { rule, state, lastDone, nextDue, daysLeft, prepared, suggestDate };
}

/** สถานะทุกกฎที่เปิดอยู่ เรียงด่วนสุดก่อน (เลยรอบ → ยังไม่เคยทำ → ใกล้ถึง → …) แล้วตามวันครบรอบ */
export function refreshStatuses(rules: RefreshRule[], items: RefreshItem[], todayKey: string): RefreshStatus[] {
  return rules.filter((r) => r.is_active).map((r) => refreshStatus(r, items, todayKey))
    .sort((a, b) => REFRESH_STATE_META[a.state].rank - REFRESH_STATE_META[b.state].rank
      || (a.daysLeft ?? -9999) - (b.daysLeft ?? -9999) || (a.rule.sort_order ?? 0) - (b.rule.sort_order ?? 0));
}
