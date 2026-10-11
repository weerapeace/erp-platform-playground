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
/** scheduled_at (ISO) → "YYYY-MM-DD" ตามเวลาเครื่อง · ว่าง/ผิด = null */
export function dateKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : localDateKey(d);
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
/** วัน + เวลา (HH:MM) ตามเวลาเครื่อง → ISO (UTC) สำหรับบันทึก scheduled_at */
export function toScheduledIso(dateKey: string, time = "10:00"): string {
  const [hh, mm] = time.split(":").map(Number);
  const d = parseDateKey(dateKey);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d.toISOString();
}
/** เวลา HH:MM ของ scheduled_at ตามเวลาเครื่อง (เพื่อคงเวลาเดิมตอนลากเปลี่ยนวัน) */
export function timeOf(iso: string | null | undefined, fallback = "10:00"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
export function dowLabel(key: string): string { return TH_DOW[parseDateKey(key).getDay()]; }
export function shortThaiDate(key: string): string {
  return parseDateKey(key).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
