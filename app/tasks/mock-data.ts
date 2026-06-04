// ============================================================
// Task Manager — Mock Data (ขั้น A: ให้เจ้าของโปรเจกต์ดูหน้าตาก่อนต่อ Supabase)
// ของจริงในขั้น B จะมาจากตาราง public.tasks ผ่าน /api/master-v2/tasks
// ============================================================

export type TaskStatus = "new" | "in_progress" | "review" | "done" | "cancelled";
export type TaskPriority = "critical" | "high" | "normal" | "low";
export type SubtaskStatus = "todo" | "in_progress" | "done";

export type Subtask = {
  id: string;
  name: string;
  assignee_name: string;
  status: SubtaskStatus;
  due_date: string | null;
};

export type ChecklistItem = { id: string; name: string; done: boolean };
export type Comment = { id: string; author_name: string; text: string; created_at: string };

export type Task = {
  // ระบุชนิด index signature ให้เข้ากับ DataTable<Record<string, unknown>>
  [key: string]: unknown;
  id: string;
  task_no: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_name: string;       // ผู้รับผิดชอบ (ขั้น B → EmployeePicker กลาง)
  assignee_id: string | null;
  creator_name: string;        // ผู้สร้าง
  due_date: string | null;     // กำหนดส่ง
  project: string;             // โปรเจกต์/หมวด
  tags: string[];
  product_sku: string | null;  // ผูกสินค้า SKU (ขั้น B → ProductPicker กลาง)
  product_name: string | null;
  subtasks: Subtask[];
  checklist: ChecklistItem[];
  comments: Comment[];
  created_at: string;
};

/** ผู้ใช้ปัจจุบัน (จำลอง) — ใช้กรอง view "งานของฉัน" / "มอบหมายให้ฉัน" */
export const MOCK_ME = "สมหญิง ใจดี";

/** วันอ้างอิงของ mock (ตรงกับ today ในระบบ) */
export const MOCK_TODAY = "2026-06-04";

/** งานเกินกำหนด (ยังไม่เสร็จ/ไม่ยกเลิก และเลยกำหนดส่ง) */
export function isOverdue(t: Task): boolean {
  return !!t.due_date && t.due_date < MOCK_TODAY && t.status !== "done" && t.status !== "cancelled";
}

/** งานที่ครบกำหนดภายใน 7 วันนับจากวันนี้ */
export function withinThisWeek(t: Task): boolean {
  if (!t.due_date) return false;
  const diff = (new Date(t.due_date).getTime() - new Date(MOCK_TODAY).getTime()) / 86400000;
  return diff >= 0 && diff <= 7 && t.status !== "done" && t.status !== "cancelled";
}

// ---- ป้ายสถานะ (module config — ไม่ใช่ของกลางตาราง) ----
export const STATUS_META: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  new:         { label: "ใหม่",      cls: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  in_progress: { label: "กำลังทำ",   cls: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
  review:      { label: "รอตรวจ",    cls: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500" },
  done:        { label: "เสร็จ",      cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  cancelled:   { label: "ยกเลิก",    cls: "bg-slate-100 text-slate-500 border-slate-200",   dot: "bg-slate-400" },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; cls: string }> = {
  critical: { label: "ด่วนมาก", cls: "bg-red-50 text-red-700 border-red-200" },
  high:     { label: "สูง",     cls: "bg-orange-50 text-orange-700 border-orange-200" },
  normal:   { label: "ปกติ",    cls: "bg-slate-50 text-slate-600 border-slate-200" },
  low:      { label: "ต่ำ",     cls: "bg-slate-50 text-slate-400 border-slate-200" },
};

// ---- เส้นทางสถานะ (workflow) — ขั้น B จะย้ายไป erp_workflow_states/transitions กลาง ----
export const TASK_TRANSITIONS: Record<TaskStatus, { action: string; label: string; to: TaskStatus; variant: "primary" | "default" | "danger" }[]> = {
  new:         [{ action: "start",   label: "▶ เริ่มทำ",   to: "in_progress", variant: "primary" }],
  in_progress: [{ action: "submit",  label: "📤 ส่งตรวจ",  to: "review",      variant: "primary" }],
  review:      [
    { action: "approve", label: "✓ ผ่าน (เสร็จ)", to: "done",        variant: "primary" },
    { action: "revise",  label: "↩ ตีกลับแก้",    to: "in_progress", variant: "default" },
  ],
  done:        [],
  cancelled:   [],
};

// ============================================================
// ข้อมูลงานจำลอง
// ============================================================

export const MOCK_TASKS: Task[] = [
  {
    id: "t-001",
    task_no: "TASK-2026-00012",
    title: "ถ่ายรูปสินค้าคอลเลกชันใหม่ Summer",
    description: "ถ่ายรูปกระเป๋ารุ่นใหม่ 8 สี สำหรับลงเว็บและมาร์เก็ตเพลส",
    status: "in_progress",
    priority: "high",
    assignee_name: MOCK_ME,
    assignee_id: "emp-1",
    creator_name: "ฝ่ายการตลาด",
    due_date: "2026-06-06",
    project: "การตลาด / Content",
    tags: ["ถ่ายรูป", "summer"],
    product_sku: "BAG-SUM-001",
    product_name: "กระเป๋า Summer Tote",
    subtasks: [
      { id: "s1", name: "เตรียมพร็อพ + สถานที่", assignee_name: MOCK_ME, status: "done", due_date: "2026-06-04" },
      { id: "s2", name: "ถ่ายจริง 8 สี",        assignee_name: MOCK_ME, status: "in_progress", due_date: "2026-06-05" },
      { id: "s3", name: "รีทัช + ส่งไฟล์",       assignee_name: "เอก ตัดต่อ", status: "todo", due_date: "2026-06-06" },
    ],
    checklist: [
      { id: "c1", name: "เช็คลิสต์อุปกรณ์ครบ", done: true },
      { id: "c2", name: "อนุมัติมู้ดบอร์ด",     done: true },
      { id: "c3", name: "ส่งไฟล์เข้าโฟลเดอร์กลาง", done: false },
    ],
    comments: [
      { id: "cm1", author_name: "ฝ่ายการตลาด", text: "ขอเน้นสีพาสเทลเป็นหลักนะคะ", created_at: "2026-06-03T09:20:00" },
      { id: "cm2", author_name: MOCK_ME, text: "รับทราบค่ะ เริ่มถ่ายพรุ่งนี้", created_at: "2026-06-03T10:05:00" },
    ],
    created_at: "2026-06-02T08:00:00",
  },
  {
    id: "t-002",
    task_no: "TASK-2026-00011",
    title: "สรุปยอดสต๊อกสิ้นเดือน พ.ค.",
    description: "ตรวจนับและสรุปยอดคงเหลือคลังหลัก ส่งบัญชี",
    status: "review",
    priority: "critical",
    assignee_name: "นภา คลังสินค้า",
    assignee_id: "emp-2",
    creator_name: MOCK_ME,
    due_date: "2026-06-03",
    project: "คลังสินค้า",
    tags: ["สต๊อก", "สิ้นเดือน"],
    product_sku: null,
    product_name: null,
    subtasks: [
      { id: "s4", name: "นับคลัง A", assignee_name: "นภา คลังสินค้า", status: "done", due_date: "2026-06-02" },
      { id: "s5", name: "นับคลัง B", assignee_name: "นภา คลังสินค้า", status: "done", due_date: "2026-06-02" },
    ],
    checklist: [
      { id: "c4", name: "กระทบยอดกับระบบ", done: true },
      { id: "c5", name: "แนบไฟล์ Excel", done: true },
    ],
    comments: [
      { id: "cm3", author_name: "นภา คลังสินค้า", text: "ส่งตรวจแล้วค่ะ มีผลต่าง 2 รายการ หมายเหตุไว้ในไฟล์", created_at: "2026-06-03T17:40:00" },
    ],
    created_at: "2026-05-30T08:00:00",
  },
  {
    id: "t-003",
    task_no: "TASK-2026-00010",
    title: "แก้แบบป้ายราคาหน้าร้านสาขาลาดพร้าว",
    description: "อัปเดตป้ายราคาตามโปรโมชั่นเดือนมิถุนายน",
    status: "new",
    priority: "normal",
    assignee_name: MOCK_ME,
    assignee_id: "emp-1",
    creator_name: "ผู้จัดการสาขา",
    due_date: "2026-06-10",
    project: "หน้าร้าน",
    tags: ["ป้ายราคา"],
    product_sku: null,
    product_name: null,
    subtasks: [],
    checklist: [
      { id: "c6", name: "รับไฟล์โปรโมชั่นจากการตลาด", done: false },
    ],
    comments: [],
    created_at: "2026-06-03T14:00:00",
  },
  {
    id: "t-004",
    task_no: "TASK-2026-00009",
    title: "ตามใบเสนอราคาผ้าซัพพลายเออร์จีน",
    description: "ติดตามใบเสนอราคาผ้าล็อตใหม่ 3 เจ้า เปรียบเทียบราคา",
    status: "in_progress",
    priority: "high",
    assignee_name: "วีระ จัดซื้อ",
    assignee_id: "emp-3",
    creator_name: MOCK_ME,
    due_date: "2026-05-30",
    project: "จัดซื้อ",
    tags: ["ซัพพลายเออร์", "ผ้า"],
    product_sku: "FAB-CTN-220",
    product_name: "ผ้าคอตตอน 220 แกรม",
    subtasks: [
      { id: "s6", name: "ขอใบเสนอราคาเจ้า A", assignee_name: "วีระ จัดซื้อ", status: "done", due_date: "2026-05-28" },
      { id: "s7", name: "ขอใบเสนอราคาเจ้า B", assignee_name: "วีระ จัดซื้อ", status: "in_progress", due_date: "2026-05-30" },
      { id: "s8", name: "ขอใบเสนอราคาเจ้า C", assignee_name: "วีระ จัดซื้อ", status: "todo", due_date: "2026-06-01" },
    ],
    checklist: [],
    comments: [
      { id: "cm4", author_name: MOCK_ME, text: "เจ้า A กับ B ราคาใกล้กัน รอเจ้า C อีกเจ้า", created_at: "2026-06-01T11:00:00" },
    ],
    created_at: "2026-05-26T08:00:00",
  },
  {
    id: "t-005",
    task_no: "TASK-2026-00008",
    title: "เขียนแคปชันโปรโมชั่น 6.6",
    description: "เขียนแคปชันลงเพจ Facebook + IG สำหรับแคมเปญ 6.6",
    status: "done",
    priority: "normal",
    assignee_name: MOCK_ME,
    assignee_id: "emp-1",
    creator_name: "ฝ่ายการตลาด",
    due_date: "2026-06-01",
    project: "การตลาด / Content",
    tags: ["แคปชัน", "6.6"],
    product_sku: null,
    product_name: null,
    subtasks: [],
    checklist: [
      { id: "c7", name: "ตรวจคำผิด", done: true },
      { id: "c8", name: "อนุมัติโดยหัวหน้า", done: true },
    ],
    comments: [],
    created_at: "2026-05-28T08:00:00",
  },
  {
    id: "t-006",
    task_no: "TASK-2026-00007",
    title: "จัดอบรมพนักงานใหม่ฝ่ายผลิต",
    description: "เตรียมสไลด์และจัดอบรมความปลอดภัยพนักงานเข้าใหม่ 5 คน",
    status: "review",
    priority: "normal",
    assignee_name: "ฝ่ายบุคคล",
    assignee_id: "emp-4",
    creator_name: MOCK_ME,
    due_date: "2026-06-09",
    project: "HR",
    tags: ["อบรม"],
    product_sku: null,
    product_name: null,
    subtasks: [
      { id: "s9", name: "ทำสไลด์", assignee_name: "ฝ่ายบุคคล", status: "done", due_date: "2026-06-05" },
    ],
    checklist: [],
    comments: [],
    created_at: "2026-05-29T08:00:00",
  },
  {
    id: "t-007",
    task_no: "TASK-2026-00006",
    title: "ออกแบบกล่องแพ็กเกจจิ้งรุ่นพิเศษ",
    description: "ออกแบบกล่องของขวัญสำหรับลูกค้า VIP",
    status: "cancelled",
    priority: "low",
    assignee_name: "ดีไซน์ทีม",
    assignee_id: "emp-5",
    creator_name: "ฝ่ายการตลาด",
    due_date: "2026-05-25",
    project: "ดีไซน์",
    tags: ["แพ็กเกจจิ้ง"],
    product_sku: null,
    product_name: null,
    subtasks: [],
    checklist: [],
    comments: [
      { id: "cm5", author_name: "ฝ่ายการตลาด", text: "ยกเลิกก่อน รอสรุปงบประมาณใหม่", created_at: "2026-05-24T13:00:00" },
    ],
    created_at: "2026-05-20T08:00:00",
  },
  {
    id: "t-008",
    task_no: "TASK-2026-00005",
    title: "ตรวจเช็คเครื่องจักรไลน์ตัดผ้า",
    description: "ตรวจเช็คและบำรุงรักษาเครื่องตัดผ้าประจำเดือน",
    status: "new",
    priority: "critical",
    assignee_name: "ช่างซ่อมบำรุง",
    assignee_id: "emp-6",
    creator_name: MOCK_ME,
    due_date: "2026-06-05",
    project: "ผลิต",
    tags: ["ซ่อมบำรุง", "เครื่องจักร"],
    product_sku: null,
    product_name: null,
    subtasks: [],
    checklist: [
      { id: "c9", name: "เตรียมอะไหล่สำรอง", done: false },
      { id: "c10", name: "แจ้งหยุดไลน์ผลิต", done: false },
    ],
    comments: [],
    created_at: "2026-06-03T08:00:00",
  },
];
