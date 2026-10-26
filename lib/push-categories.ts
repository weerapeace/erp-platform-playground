/**
 * 🗂 ประเภทแจ้งเตือนสำหรับ "เด้งเข้ามือถือ" (ของกลาง · ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์)
 *
 * แต่ละคนเปิด/ปิดได้รายประเภท (เก็บใน user_ui_prefs key=push_prefs → { off: [category key] })
 * event_type ใหม่ที่ไม่ตรงประเภทไหน → ตกไป "อื่น ๆ" อัตโนมัติ (เด้งตามปกติ ไม่หายเงียบ)
 * เพิ่มประเภท/ย้าย event = แก้ PUSH_CATEGORIES ที่เดียว (ลำดับมีผล: ตัวแรกที่ตรงชนะ)
 */

export type PushCategory = {
  key: string;
  label: string;
  hint: string;
  icon: string;
  /** รูปแบบ event_type — ลงท้าย * = ขึ้นต้นด้วย */
  match: string[];
};

export const PUSH_CATEGORIES: PushCategory[] = [
  { key: "task_due", icon: "⏰", label: "งานใกล้ครบกำหนด / เลยกำหนด", hint: "เตือนรายวันของงานที่ใกล้ถึงหรือเลยวันส่ง", match: ["task_due_soon", "task_overdue", "wo.due_soon"] },
  { key: "tasks", icon: "📝", label: "งาน: มอบหมาย / รอตรวจ / อนุมัติ", hint: "งานใหม่ งานย่อยส่งตรวจ อนุมัติ ส่งกลับแก้ ถูกแท็กชื่อ", match: ["task_*", "subtask_*", "checklist.*", "comment.mention"] },
  { key: "purchasing", icon: "🛒", label: "จัดซื้อ: ใบขอซื้อ / PO / คำขอ", hint: "PR ใหม่ อนุมัติ/ปฏิเสธ PO ยืนยัน/รับของ คำขอวัตถุดิบ/แก้สูตร", match: ["pr.*", "pr_*", "po.*", "material_request.*", "bom_request.*"] },
  { key: "sales", icon: "💼", label: "งานขาย: ใบสั่งขาย / ข้อความจากเว็บ", hint: "SO ยืนยัน/จัดส่ง/ปิด ข้อความลูกค้าจากเว็บร้าน", match: ["so.*", "storefront_contact.*"] },
  { key: "production", icon: "🏭", label: "ผลิต / QC / ของเสีย", hint: "งานรอ QC พบของเสีย", match: ["qc.*", "wo.*"] },
  { key: "security", icon: "🔐", label: "ความปลอดภัย: ล็อกอินเครื่องใหม่", hint: "มีคนเข้าบัญชีของคุณจากเครื่องที่ไม่เคยใช้", match: ["security.*"] },
  { key: "other", icon: "🔔", label: "อื่น ๆ", hint: "เตือนความจำ สะกิด ต่ออายุบริการ และเรื่องใหม่ที่ยังไม่จัดประเภท", match: [] },
];

/** event ที่เด้งเสมอ ปิดไม่ได้ (เช่น ปุ่มส่งทดสอบ) */
const ALWAYS_ON = new Set(["push.test"]);

function matches(pattern: string, eventType: string): boolean {
  return pattern.endsWith("*") ? eventType.startsWith(pattern.slice(0, -1)) : pattern === eventType;
}

export function pushCategoryOf(eventType: string): string {
  for (const c of PUSH_CATEGORIES) if (c.match.some((p) => matches(p, eventType))) return c.key;
  return "other";
}

export type PushPrefs = { off: string[] };

export function normalizePushPrefs(v: unknown): PushPrefs {
  const off = (v && typeof v === "object" && Array.isArray((v as { off?: unknown }).off) ? (v as { off: unknown[] }).off : [])
    .filter((k): k is string => typeof k === "string" && PUSH_CATEGORIES.some((c) => c.key === k));
  return { off: Array.from(new Set(off)) };
}

export function pushEnabledFor(prefs: PushPrefs, eventType: string): boolean {
  if (ALWAYS_ON.has(eventType)) return true;
  return !prefs.off.includes(pushCategoryOf(eventType));
}

export const PUSH_PREFS_KEY = "push_prefs";

/** ไอคอนประจำประเภท (ใช้ในรายการแจ้งเตือน) */
export function pushCategoryIcon(eventType: string): string {
  if (eventType === "push.test") return "🧪";
  const key = pushCategoryOf(eventType);
  return PUSH_CATEGORIES.find((c) => c.key === key)?.icon ?? "🔔";
}
