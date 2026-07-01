// ============================================================
// Mock data สำหรับ Goals App (เฟส 1 — ยังไม่ต่อฐานข้อมูลจริง)
// โครงตรงกับ docs/goals-module-spec.md (erp_goals / erp_goal_steps / erp_goal_checkins)
// เฟส 2 จะเปลี่ยนมาดึงจาก Supabase ผ่าน service กลางแทน
// ============================================================

import type { RoadmapStep, StepStatus } from "@/components/goal-roadmap";

export type { StepStatus };

export type GoalStatus = "draft" | "active" | "paused" | "achieved" | "missed" | "cancelled";
export type GoalHealth = "on_track" | "at_risk" | "off_track";
export type MeasureType = "percent" | "number" | "currency" | "boolean";
export type GoalLevel = "team" | "personal";

export type GoalStep = RoadmapStep & {
  weight?: number;
};

export type GoalCheckin = {
  id: string;
  author: string;
  checkin_date: string;      // ISO
  progress_percent?: number;
  current_value?: number;
  health: GoalHealth;
  note: string;
};

export type Goal = {
  id: string;
  goal_no: string;
  title: string;
  why?: string;
  description?: string;
  category: string;          // sales | ops | production | finance | product | personal ...
  level: GoalLevel;
  owner: string;
  department?: string;
  collaborators?: string[];
  status: GoalStatus;
  health: GoalHealth;
  priority?: number;
  start_date?: string;
  target_date?: string;
  progress_mode: "auto" | "manual";
  progress_percent: number;  // ใช้เมื่อ manual (auto จะคำนวณจากขั้นบันได/ตัววัด)
  measure_type: MeasureType;
  measure_unit?: string;
  start_value?: number;
  target_value?: number;
  current_value?: number;
  steps: GoalStep[];
  checkins: GoalCheckin[];
};

// ---- ป้าย/ชื่อภาษาไทย (เฟส 2 ย้ายเข้า lib/status-config กลาง) ----

export const CATEGORY_LABEL: Record<string, string> = {
  sales: "ยอดขาย",
  ops: "ปฏิบัติการ",
  production: "การผลิต",
  finance: "การเงิน",
  product: "สินค้า",
  hr: "บุคคล",
  personal: "ส่วนตัว",
};

export const STATUS_META: Record<GoalStatus, { label: string; cls: string }> = {
  draft:     { label: "ร่าง",        cls: "bg-slate-100 text-slate-600 border-slate-200" },
  active:    { label: "กำลังทำ",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  paused:    { label: "พักไว้",      cls: "bg-amber-50 text-amber-700 border-amber-200" },
  achieved:  { label: "สำเร็จ",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  missed:    { label: "ไม่สำเร็จ",   cls: "bg-red-50 text-red-600 border-red-200" },
  cancelled: { label: "ยกเลิก",      cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const HEALTH_META: Record<GoalHealth, { label: string; cls: string; dot: string }> = {
  on_track:  { label: "ตามแผน",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  at_risk:   { label: "เริ่มเสี่ยง", cls: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  off_track: { label: "หลุดเป้า",    cls: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500" },
};

// ---- คำนวณความคืบหน้า (เฟส 2 ย้ายไป service กลาง) ----

export function goalProgress(g: Goal): number {
  // เป้าแบบตัวเลข/เงิน → คำนวณจากค่า (เริ่ม → ปัจจุบัน → เป้า)
  if ((g.measure_type === "currency" || g.measure_type === "number") &&
      g.start_value != null && g.target_value != null && g.current_value != null &&
      g.target_value !== g.start_value) {
    const p = ((g.current_value - g.start_value) / (g.target_value - g.start_value)) * 100;
    return Math.max(0, Math.min(100, Math.round(p)));
  }
  // manual → ใช้ค่าที่กรอกเอง
  if (g.progress_mode === "manual") return Math.round(g.progress_percent);
  // auto → ถ่วงน้ำหนักจากขั้นบันได (ไม่นับขั้นที่ข้าม)
  const active = g.steps.filter((s) => s.status !== "skipped");
  const total = active.reduce((s, st) => s + (st.weight ?? 1), 0);
  if (!total) return Math.round(g.progress_percent || 0);
  const done = active.reduce((s, st) => {
    const w = st.weight ?? 1;
    const p = st.status === "done" ? 1 : (st.progress_percent ?? 0) / 100;
    return s + w * p;
  }, 0);
  return Math.round((done / total) * 100);
}

/** จำนวนวันที่เหลือถึงเส้นตาย (อิงวันนี้ = 2026-07-01 ในโหมด mock) */
export const TODAY_ISO = "2026-07-01";
export function daysLeft(targetIso?: string): number | null {
  if (!targetIso) return null;
  const a = new Date(TODAY_ISO + "T00:00:00");
  const b = new Date(targetIso + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ---- รายชื่อคน (mock) สำหรับ picker เจ้าของ — เฟส 2 ใช้ EmployeePicker กลาง ----
export const MOCK_PEOPLE = [
  { value: "eva", label: "อีวา (เจ้าของ)" },
  { value: "somchai", label: "สมชาย · ฝ่ายปฏิบัติการ" },
  { value: "napa", label: "นภา · ฝ่ายผลิต" },
  { value: "ploy", label: "พลอย · การตลาด" },
  { value: "arm", label: "อาร์ม · ไอที" },
];
export const MOCK_DEPARTMENTS = [
  { value: "sales", label: "ฝ่ายขาย" },
  { value: "ops", label: "ฝ่ายปฏิบัติการ" },
  { value: "production", label: "ฝ่ายผลิต" },
  { value: "marketing", label: "ฝ่ายการตลาด" },
  { value: "it", label: "ฝ่ายไอที" },
];

// ---- ข้อมูลตัวอย่าง ----

export const MOCK_GOALS: Goal[] = [
  {
    id: "g1",
    goal_no: "GOAL-2026-0001",
    title: "ยอดขายออนไลน์โต 30% ภายในสิ้นปี 2026",
    why: "ลดการพึ่งพาหน้าร้านเดียว กระจายความเสี่ยง และสร้างฐานลูกค้าซื้อซ้ำระยะยาว",
    category: "sales",
    level: "team",
    owner: "อีวา",
    department: "ฝ่ายขาย",
    collaborators: ["พลอย"],
    status: "active",
    health: "at_risk",
    priority: 1,
    start_date: "2026-01-01",
    target_date: "2026-12-31",
    progress_mode: "auto",
    progress_percent: 0,
    measure_type: "currency",
    measure_unit: "บาท",
    start_value: 8_000_000,
    target_value: 10_400_000,
    current_value: 9_200_000,
    steps: [
      { id: "g1s1", title: "เปิดช่องทางขายใหม่ (TikTok Shop)", status: "done", target_date: "2026-05-12", weight: 1 },
      { id: "g1s2", title: "เพิ่มสินค้าขายดี 20 SKU", status: "in_progress", progress_percent: 60, target_date: "2026-07-31", weight: 1, linked_task_count: 3, linked_task_done: 1 },
      { id: "g1s3", title: "ทำโฆษณา + คอนเทนต์สม่ำเสมอ", status: "pending", target_date: "2026-09-30", weight: 1 },
      { id: "g1s4", title: "ระบบสมาชิก / ซื้อซ้ำ", status: "pending", target_date: "2026-12-15", weight: 1 },
    ],
    checkins: [
      { id: "g1c1", author: "อีวา", checkin_date: "2026-06-28", health: "at_risk", current_value: 9_200_000, note: "ซัพพลายเออร์ส่งของช้า ขั้นที่ 2 อาจเลื่อน 1 สัปดาห์ ต้องเร่งขั้นที่ 3 คู่กัน" },
      { id: "g1c2", author: "พลอย", checkin_date: "2026-06-14", health: "on_track", current_value: 8_900_000, note: "ยอด TikTok Shop เริ่มมา คอนเทนต์ตอบรับดี" },
    ],
  },
  {
    id: "g2",
    goal_no: "GOAL-2026-0002",
    title: "เปิดหน้าร้านสาขา 2",
    why: "ขยายพื้นที่ให้บริการลูกค้าโซนเหนือของเมือง เพิ่มการมองเห็นแบรนด์",
    category: "ops",
    level: "team",
    owner: "สมชาย",
    department: "ฝ่ายปฏิบัติการ",
    status: "active",
    health: "on_track",
    priority: 2,
    start_date: "2026-03-01",
    target_date: "2026-10-31",
    progress_mode: "auto",
    progress_percent: 0,
    measure_type: "boolean",
    steps: [
      { id: "g2s1", title: "หาทำเล + สำรวจพื้นที่", status: "done", target_date: "2026-04-15", weight: 1 },
      { id: "g2s2", title: "เซ็นสัญญาเช่า", status: "done", target_date: "2026-05-30", weight: 1 },
      { id: "g2s3", title: "ตกแต่งร้าน", status: "in_progress", progress_percent: 40, target_date: "2026-08-31", weight: 2, linked_task_count: 5, linked_task_done: 2 },
      { id: "g2s4", title: "จ้าง + อบรมพนักงาน", status: "pending", target_date: "2026-09-30", weight: 1 },
      { id: "g2s5", title: "เปิดร้าน (Grand Opening)", status: "pending", target_date: "2026-10-31", weight: 1 },
    ],
    checkins: [
      { id: "g2c1", author: "สมชาย", checkin_date: "2026-06-25", health: "on_track", note: "งานตกแต่งเดินตามแผน ผู้รับเหมาส่งงานทัน" },
    ],
  },
  {
    id: "g3",
    goal_no: "GOAL-2026-0003",
    title: "ลดของเสียในไลน์ผลิตเหลือ 2%",
    why: "ของเสียสูงทำให้ต้นทุนบานปลาย ลดได้ = กำไรเพิ่มทันทีโดยไม่ต้องเพิ่มยอดขาย",
    category: "production",
    level: "team",
    owner: "นภา",
    department: "ฝ่ายผลิต",
    status: "active",
    health: "off_track",
    priority: 1,
    start_date: "2026-04-01",
    target_date: "2026-08-31",
    progress_mode: "auto",
    progress_percent: 0,
    measure_type: "percent",
    measure_unit: "%",
    start_value: 5,
    target_value: 2,
    current_value: 4.2,
    steps: [
      { id: "g3s1", title: "เก็บข้อมูลหาสาเหตุหลักของเสีย", status: "done", target_date: "2026-05-15", weight: 1 },
      { id: "g3s2", title: "ปรับ SOP จุดที่เสียบ่อย", status: "in_progress", progress_percent: 30, target_date: "2026-07-15", weight: 1, linked_task_count: 2, linked_task_done: 0 },
      { id: "g3s3", title: "อบรมช่างประจำไลน์", status: "pending", target_date: "2026-08-01", weight: 1 },
      { id: "g3s4", title: "ติดตามผล 2 เดือน", status: "pending", target_date: "2026-08-31", weight: 1 },
    ],
    checkins: [
      { id: "g3c1", author: "นภา", checkin_date: "2026-06-20", health: "off_track", current_value: 4.2, note: "ของเสียยังลงช้า จุดปัญหาอยู่ที่เครื่องเก่า อาจต้องของบซ่อม" },
    ],
  },
  {
    id: "g4",
    goal_no: "GOAL-2026-0004",
    title: "ออกกำลังกายสม่ำเสมอ 100 ครั้งในปีนี้",
    why: "สุขภาพดีขึ้น มีแรงทำงานได้เต็มที่ ลดความเครียด",
    category: "personal",
    level: "personal",
    owner: "อีวา",
    status: "active",
    health: "on_track",
    priority: 3,
    start_date: "2026-01-01",
    target_date: "2026-12-31",
    progress_mode: "auto",
    progress_percent: 0,
    measure_type: "number",
    measure_unit: "ครั้ง",
    start_value: 0,
    target_value: 100,
    current_value: 52,
    steps: [
      { id: "g4s1", title: "เลือกกิจกรรมที่ชอบ (วิ่ง/โยคะ)", status: "done", target_date: "2026-01-10", weight: 1 },
      { id: "g4s2", title: "จัดตารางประจำสัปดาห์", status: "done", target_date: "2026-01-20", weight: 1 },
      { id: "g4s3", title: "ทำต่อเนื่อง 3 วัน/สัปดาห์", status: "in_progress", progress_percent: 52, target_date: "2026-12-31", weight: 2 },
    ],
    checkins: [
      { id: "g4c1", author: "อีวา", checkin_date: "2026-06-30", health: "on_track", current_value: 52, note: "ครึ่งปีทำได้ 52 ครั้ง มาถูกทาง" },
    ],
  },
  {
    id: "g5",
    goal_no: "GOAL-2026-0005",
    title: "วางระบบ ERP กลาง เฟส 1 ให้ใช้งานได้",
    why: "ลดปัญหาการแก้ table/popup/form แยกทุกแอป มีมาตรฐานกลางก่อนสร้างโมดูลธุรกิจ",
    category: "product",
    level: "team",
    owner: "อาร์ม",
    department: "ฝ่ายไอที",
    status: "achieved",
    health: "on_track",
    priority: 1,
    start_date: "2026-01-01",
    target_date: "2026-06-30",
    progress_mode: "auto",
    progress_percent: 100,
    measure_type: "percent",
    measure_unit: "%",
    start_value: 0,
    target_value: 100,
    current_value: 100,
    steps: [
      { id: "g5s1", title: "Design System + ของกลาง (Table/Form/Modal)", status: "done", target_date: "2026-03-01", weight: 1 },
      { id: "g5s2", title: "โมดูลนำร่อง (สินค้า/จัดซื้อ)", status: "done", target_date: "2026-05-01", weight: 1 },
      { id: "g5s3", title: "ต่อ Supabase + Field Registry", status: "done", target_date: "2026-06-30", weight: 1 },
    ],
    checkins: [
      { id: "g5c1", author: "อาร์ม", checkin_date: "2026-06-30", health: "on_track", current_value: 100, note: "ปิดเฟส 1 ครบ ทีมเริ่มใช้ของกลางร่วมกันแล้ว 🎉" },
    ],
  },
];

export function findGoal(id: string): Goal | undefined {
  return MOCK_GOALS.find((g) => g.id === id);
}
