// ============================================================
// ของกลาง — แผนงานส่วนตัว (Personal Planner)
//
// ใช้ทำอะไร: เก็บ "ฉันตั้งใจทำงานนี้วันไหน" ของแต่ละคน (วันนี้/พรุ่งนี้/สัปดาห์นี้/รอไว้ก่อน)
// ใช้เมื่อไหร่: มุมมอง "แผนงาน" บน /dashboard + ปุ่ม "ใส่แผนงานฉัน" ที่โมดูลอื่นจะเรียกใช้
// ห้ามใช้เมื่อ: ต้องการมอบหมายงานให้คนอื่น (นั่นคือ Task Manager) — ตารางนี้ส่วนตัวล้วน RLS เจ้าของคนเดียว
//
// ไฟล์นี้เป็น logic ล้วน (ไม่มี "use client") → import ได้ทั้ง API route และ component
// ส่วนที่ยิง API อยู่ที่ lib/planner-client.ts
// ============================================================

export type PlanBucket     = "today" | "tomorrow" | "week" | "later";
export type PlanSourceType = "manual" | "notification" | "task" | "subtask" | "calendar";

export type PlanItem = {
  id:          string;
  user_id:     string;
  bucket:      PlanBucket;
  plan_date:   string | null;      // YYYY-MM-DD ตามเวลาไทย · null = สัปดาห์นี้/รอไว้ก่อน
  sort_order:  number;
  title:       string;
  note:        string | null;
  source_type: PlanSourceType;
  source_id:   string | null;      // id ของงานต้นทาง (null = พิมพ์เอง)
  link:        string | null;      // กดแล้วไปหน้างานต้นทาง
  module:      string | null;      // ระบบต้นทาง (ใช้เลือกสี/ป้าย)
  due_at:      string | null;
  done_at:     string | null;
  archived_at: string | null;      // เก็บออกจากบอร์ดแล้ว (กดปิดวัน)
  created_at:  string;
  updated_at:  string;
};

export type PlanDraft = {
  title:        string;
  bucket?:      PlanBucket;
  source_type?: PlanSourceType;
  source_id?:   string | null;
  link?:        string | null;
  module?:      string | null;
  due_at?:      string | null;
  note?:        string | null;
};

/** key เดียวกันทั้งมุมมองแผนงานและ widget "แผนวันนี้" (useSWRLite dedupe ให้ ไม่ยิงซ้ำ) */
export const PLAN_CACHE_KEY = "plan:mine";

export const PLAN_BUCKETS: { key: PlanBucket; label: string; icon: string; hint: string }[] = [
  { key: "today",    label: "วันนี้",       icon: "☀️", hint: "ตั้งใจทำวันนี้" },
  { key: "tomorrow", label: "พรุ่งนี้",      icon: "🌤️", hint: "ยกไปทำพรุ่งนี้" },
  { key: "week",     label: "สัปดาห์นี้",    icon: "🗓️", hint: "ทำภายในสัปดาห์นี้" },
  { key: "later",    label: "รอไว้ก่อน",    icon: "📦", hint: "ยังไม่กำหนดวัน" },
];

export const bucketLabel = (b: PlanBucket) => PLAN_BUCKETS.find((x) => x.key === b)?.label ?? b;

// ---- วันที่แบบเวลาไทย ----
// ห้ามใช้ new Date().toISOString().slice(0,10) — เครื่อง/เซิร์ฟเวอร์เป็น UTC จะร่นไป 1 วัน
export function bangkokDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** ลงช่องไหน → เก็บวันที่อะไร (สัปดาห์นี้/รอไว้ก่อน = ไม่ผูกวัน) */
export function planDateFor(bucket: PlanBucket): string | null {
  if (bucket === "today")    return bangkokDate(0);
  if (bucket === "tomorrow") return bangkokDate(1);
  return null;
}

/**
 * ช่องที่ควรแสดงจริงวันนี้ — คิดจาก plan_date ไม่ใช่ bucket ที่บันทึกไว้
 * ผลคือ งานที่วางไว้เมื่อวานแล้วยังไม่เสร็จ จะตกมาช่อง "วันนี้" เองโดยไม่ต้องกดอะไร
 * และงานที่วางไว้ "พรุ่งนี้" พอถึงวันจริงก็เลื่อนมาเป็น "วันนี้" อัตโนมัติ
 */
export function displayBucket(item: Pick<PlanItem, "bucket" | "plan_date">, today = bangkokDate(0), tomorrow = bangkokDate(1)): PlanBucket {
  if (item.plan_date) {
    if (item.plan_date <= today)    return "today";
    if (item.plan_date === tomorrow) return "tomorrow";
    return "week";
  }
  return item.bucket === "today" || item.bucket === "tomorrow" ? "later" : item.bucket;
}

/** จัดกลุ่มตามช่องที่แสดงจริง + เรียงลำดับที่ผู้ใช้ลากไว้ (งานเสร็จแล้วไปท้ายช่อง) */
export function groupPlan(items: PlanItem[]): Record<PlanBucket, PlanItem[]> {
  const today = bangkokDate(0), tomorrow = bangkokDate(1);
  const out: Record<PlanBucket, PlanItem[]> = { today: [], tomorrow: [], week: [], later: [] };
  for (const it of items) {
    if (it.archived_at) continue;
    out[displayBucket(it, today, tomorrow)].push(it);
  }
  for (const k of Object.keys(out) as PlanBucket[]) {
    out[k].sort((a, b) =>
      (a.done_at ? 1 : 0) - (b.done_at ? 1 : 0)
      || a.sort_order - b.sort_order
      || a.created_at.localeCompare(b.created_at));
  }
  return out;
}

/** กุญแจกันลากงานเดิมซ้ำ (ตรงกับ unique index ในตาราง) */
export const planSourceKey = (sourceType: string, sourceId: string | null | undefined) =>
  sourceId ? `${sourceType}:${sourceId}` : "";

/** งานต้นทางไหนถูกวางแผนไปแล้วบ้าง — ใช้กรองกล่องงานเข้า */
export function plannedKeys(items: PlanItem[]): Set<string> {
  const s = new Set<string>();
  for (const it of items) {
    const k = planSourceKey(it.source_type, it.source_id);
    if (k) s.add(k);
  }
  return s;
}

export const isDone = (it: PlanItem) => !!it.done_at;

/** สรุปความคืบหน้าของวันนี้ (ใช้ทั้งบนบอร์ดและ widget "แผนวันนี้") */
export function todayProgress(items: PlanItem[]): { done: number; total: number; percent: number } {
  const list = groupPlan(items).today;
  const done = list.filter(isDone).length;
  return { done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
}
