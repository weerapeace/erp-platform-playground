/**
 * 🔔 ทะเบียนแจ้งเตือน (แท็บ "แจ้งเตือน" ในหน้า /master/flow-map) — ระบบแจ้งเรื่องอะไร · ทางไหน (กระดิ่ง ERP / LINE / อีเมล / อื่น ๆ) · ถึงใคร
 *
 * สถานะ "ถึงคนจริงไหม" คิดสดจาก /api/flow-map/notify (NotifyLive): กลุ่ม LINE ที่ตั้งแล้ว · สวิตช์ในศูนย์ LINE · กฎกระดิ่ง ·
 *   ช่างผูก LINE · สวิตช์ร้านเว็บ · อีเมลพร้อมส่ง · สถิติกระดิ่ง 90 วัน · รายงานตามเวลา (email_reports)
 * ทุกเรื่องจด "ไฟล์ที่ส่งจริง" (files) → เทสต์ lib/__tests__/flow-map.test.ts เช็กว่ายังมีอยู่
 *   เพิ่ม / ย้าย / เลิกส่งแจ้งเตือนเมื่อไร → แก้ไฟล์นี้ด้วย (คู่กับทะเบียน LINE lib/line-registry.ts และกฎ erp_notification_rules)
 * กฎกระดิ่งที่ไม่มีเรื่องไหนในไฟล์นี้อ้าง = "กฎที่ไม่มีโค้ดยิง" (notifyGhostRules) — โชว์ให้แอดมินตามลบ/ผูกใหม่
 * ⚠️ pure — import ได้แค่ไฟล์ pure (line-registry) · ห้ามใส่ token / group id / ตัวเลขเงินจริง (ไฟล์นี้อยู่ในหน้าเว็บทุกคน)
 * สำรวจของจริง 2026-11-03 (ดู docs/flow-map.md หัวข้อ "แท็บแจ้งเตือน")
 */
import { LINE_SLOTS, type LineSlotKey } from "@/lib/line-registry";

export type NotifyChannel = "erp" | "line" | "email" | "other";
/** ok = ส่งถึงคนจริง · warn = มีโค้ดส่งแต่ยังไม่ได้ตั้งค่า → เงียบ · off = ปิดไว้ */
export type NotifyState = "ok" | "warn" | "off";
export type NotifyArea = "buy" | "make" | "qc" | "sell" | "web" | "creative" | "system" | "report";
/** กลุ่ม LINE ปลายทาง — "main" = กลุ่มหลัก (กลุ่มล่าสุดที่บอทถูกเชิญ, line_config.group_id) */
export type NotifyGroup = LineSlotKey | "main";

/** ปลายทาง 1 ทางของเรื่องแจ้งเตือน */
export type NotifyTarget =
  /** กระดิ่งในระบบ (erp_notifications) — rule = event_type ใน erp_notification_rules (ส่งผ่านกฎ) · ไม่ใส่ = โค้ดส่งตรง */
  | { kind: "bell"; to: string; rule?: string }
  /** LINE กลุ่ม — groups เรียงตามลำดับ "ใช้กลุ่มแรกที่ตั้งไว้" · event = สวิตช์เปิด/ปิดในศูนย์ LINE · manual = คนกดส่งเอง */
  | { kind: "group"; to: string; groups: NotifyGroup[]; event?: string; manual?: boolean }
  /** LINE ส่วนตัวช่าง (employees.line_user_id) */
  | { kind: "dm"; to: string }
  /** LINE OA ของร้าน → ลูกค้าเว็บ (สวิตช์ร้าน "แจ้งทาง LINE OA" + token ของร้าน) */
  | { kind: "oa"; to: string }
  /** อีเมล — shop = ต้องเปิดสวิตช์ร้าน "ส่งอีเมลแจ้งลูกค้าอัตโนมัติ" · manual = พนักงานกดส่ง */
  | { kind: "email"; to: string; shop?: boolean; manual?: boolean }
  | { kind: "popup"; to: string }
  | { kind: "discord"; to: string };

export type NotifyTopic = {
  id: string;
  area: NotifyArea;
  label: string;
  /** เกิดเมื่อไร (ภาษาคน) */
  when: string;
  /** กล่องในแผนผัง (FLOW_NODES) — โชว์กระดิ่งบนกล่อง + ปุ่ม "ดูในแผนผัง" */
  node?: string;
  /** erp_notifications.event_type ที่นับสถิติ 90 วัน */
  events?: string[];
  send: NotifyTarget[];
  /** ข้อสังเกต (ภาษาคน) */
  note?: string;
  /** หยุดส่งทั้งเรื่อง (เช่น รายงานที่ปิดไว้) → ทุกทาง = ปิด */
  paused?: boolean;
  files: string[];
};

/** สถานะสดจาก /api/flow-map/notify — boolean / ตัวนับเท่านั้น (ไม่มี token / group id) */
/** n/read = 90 วัน · n7/read7 = 7 วันล่าสุด (แผงกระดิ่งบนกล่อง) */
export type NotifyStat = { n: number; read: number; users: number; last: string | null; n7?: number; read7?: number };
export type NotifyReport = { id: string; name: string; time: string | null; days: number[]; on: boolean; email: boolean; popup: boolean; discord: boolean; line: boolean };
export type NotifyLive = {
  line: { token: boolean; main: boolean; groups: Partial<Record<string, boolean>>; off: Record<string, boolean> };
  /** กฎกระดิ่ง event_type → เปิดอยู่ไหม */
  rules: { event: string; name: string; active: boolean; to?: string }[];
  /** พนักงานที่ทำงานอยู่ / ผูก LINE แล้ว (employees.line_user_id) */
  staff: { active: number; linked: number };
  /** มือถือที่เปิดรับแจ้งเตือน (erp_push_subscriptions) */
  push: number;
  /** ระบบส่งอีเมลพร้อม (Resend / Gmail) */
  email: boolean;
  shops: { total: number; line: number; email: number; oa: number };
  /** สถิติกระดิ่ง 90 วัน ต่อ event_type */
  stats: Record<string, NotifyStat>;
  /** สวิตช์ทั้งระบบของรายงานตามเวลา (erp_report_channels) */
  channels: { email: boolean; popup: boolean; discord: boolean; line: boolean };
  reports: NotifyReport[];
  /** หมายเหตุที่แอดมินเขียนเอง ต่อเรื่อง (id → ข้อความ · "" = ซ่อนข้อสังเกตในทะเบียน) — notifyRemark() */
  remarks?: Record<string, string>;
  /** สวิตช์ "กระดิ่งที่โค้ดส่งตรง" ที่ปิดอยู่ (event_type → true) — lib/bell-switch · ไม่มี = เปิดหมด */
  bellOff?: Record<string, boolean>;
};

export const NOTIFY_DAYS = 90;
/** ช่วงสั้นที่โชว์ในแผงกระดิ่งบนกล่อง */
export const NOTIFY_RECENT_DAYS = 7;
export const NOTIFY_CHANNELS: Record<NotifyChannel, { label: string; icon: string }> = {
  erp: { label: "ERP (กระดิ่ง/ป๊อปอัป)", icon: "🔔" },
  line: { label: "LINE", icon: "💬" },
  email: { label: "อีเมล", icon: "✉️" },
  other: { label: "อื่น ๆ", icon: "📣" },
};
export const NOTIFY_STATES: Record<NotifyState, { label: string; color: string; chip: string }> = {
  ok: { label: "ส่งถึงคนจริง", color: "#16a34a", chip: "bg-green-50 text-green-800 border-green-200" },
  warn: { label: "มีโค้ดแต่ยังไม่ได้ตั้งค่า → เงียบ", color: "#d97706", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  off: { label: "ปิดไว้", color: "#94a3b8", chip: "bg-slate-50 text-slate-500 border-slate-200" },
};
/** ฝ่าย + กล่องในแผนผังที่นับเป็นของฝ่ายนั้น (กล่องที่ไม่มีเรื่องไหนอ้าง = "ยังไม่มีแจ้งเตือน") */
export const NOTIFY_AREAS: Record<NotifyArea, { label: string; nodes: string[] }> = {
  buy: { label: "ซื้อ", nodes: ["pr", "po", "line", "gr", "pv", "paypo"] },
  make: { label: "ผลิต / จ่ายงาน", nodes: ["mo", "sku", "mat", "ready", "prep", "wo", "pw"] },
  qc: { label: "QC / ส่งออก", nodes: ["sub", "qc", "ship"] },
  sell: { label: "ขาย", nodes: ["qt", "so", "bill", "dn", "bn", "rc", "cn"] },
  web: { label: "เว็บร้าน", nodes: [] },
  creative: { label: "งานครีเอทีฟ", nodes: ["ds"] },
  system: { label: "การเงิน / ระบบ", nodes: ["china", "pay"] },
  report: { label: "รายงานตามเวลา", nodes: [] },
};
export const NOTIFY_AREA_ORDER = Object.keys(NOTIFY_AREAS) as NotifyArea[];

const B = (to: string, rule?: string): NotifyTarget => ({ kind: "bell", to, rule });
const G = (to: string, groups: NotifyGroup[], event?: string, manual?: boolean): NotifyTarget => ({ kind: "group", to, groups, event, manual });

export const NOTIFY_TOPICS: NotifyTopic[] = [
  // ── ซื้อ ──
  { id: "pr_created", area: "buy", label: "มีใบขอซื้อใหม่", node: "pr", events: ["pr_created"],
    when: "มีคนสร้างใบขอซื้อ (หน้าจัดซื้อ / จาก MO / บอร์ดจ่ายงาน)",
    send: [B("ผู้อนุมัติจัดซื้อ"), G("กลุ่มขอซื้อ", ["purchase_request"], "pr_created")],
    files: ["app/api/purchasing/create-pr/route.ts"] },
  { id: "pr_rejected", area: "buy", label: "ใบขอซื้อไม่อนุมัติ", node: "pr", events: ["pr_rejected"],
    when: "ผู้อนุมัติกดไม่อนุมัติ (ใส่เหตุผล)",
    send: [B("ผู้ขอ"), G("กลุ่มขอซื้อ", ["purchase_request"], "pr_rejected")],
    files: ["app/api/purchasing/pr-approve/route.ts"] },
  { id: "po_created", area: "buy", label: "ออกใบสั่งซื้อ (PO)", node: "po",
    when: "จัดซื้อออก PO จากใบขอซื้อ",
    send: [G("กลุ่มใบสั่งซื้อ", ["purchase_order", "purchase_request"], "po_created")],
    files: ["app/api/purchasing/create-po/route.ts"] },
  { id: "goods_received", area: "buy", label: "รับของเข้า", node: "gr",
    when: "กดรับของตาม PO (ครบ / บางส่วน)",
    send: [G("กลุ่มรับของ", ["goods_receipt", "purchase_request"], "goods_received")],
    files: ["app/api/purchasing/receive/route.ts"] },

  // ── ผลิต / จ่ายงาน ──
  { id: "wo_dispatched", area: "make", label: "จ่ายงานเข้าโต๊ะ", node: "wo",
    when: "บอร์ดจ่ายงานสร้างใบจ่ายงานให้ช่าง/โต๊ะ",
    send: [G("กลุ่มผลิต", ["production"], "wo_dispatched"), { kind: "dm", to: "ช่างที่ได้งาน" }],
    files: ["app/api/mo/work-orders/route.ts"] },
  { id: "wo_due_soon", area: "make", label: "งานใกล้/เกินกำหนด (ทุกเช้า 09:00)", node: "wo", events: ["wo.due_soon"],
    when: "ตั้งเวลาทุกวัน — ใบจ่ายงาน/ใบสั่งผลิตที่เหลือ ≤3 วันหรือเลยกำหนด",
    send: [B("ผู้จัดการ + แอดมิน", "wo.due_soon"), G("กลุ่มผลิต", ["production"], "wo_due_soon")],
    note: "ถ้าตัวเลข 90 วันเป็น 0 ทั้งที่มีงานเลยกำหนด = ตัวตั้งเวลาไม่ได้รันจริง ให้ทีมพัฒนาตรวจ",
    files: ["app/api/cron/wo-due-soon/route.ts", "vercel.json"] },
  { id: "material_request", area: "make", label: "ขอเพิ่มวัตถุดิบ", node: "mat", events: ["material_request.created"],
    when: "มีคนกด “ขอเพิ่มวัตถุดิบ” (ไม่มีในทะเบียน)",
    send: [B("ผู้จัดการ + แอดมิน", "material_request.created"), G("กลุ่มผลิต", ["production"], "material_request")],
    files: ["app/api/master/material-requests/route.ts"] },
  { id: "material_request_result", area: "make", label: "ผลคำขอวัตถุดิบ", node: "mat", events: ["material_request.result"],
    when: "คนดูแลข้อมูลอนุมัติ / ไม่อนุมัติคำขอ",
    send: [B("ผู้ขอ")],
    files: ["app/api/master/material-requests/route.ts"] },
  { id: "bom_request", area: "make", label: "ขอแก้สูตร (BOM)", node: "sku", events: ["bom_request.created"],
    when: "มีคนส่งคำขอแก้สูตรสินค้า",
    send: [B("ผู้จัดการ + แอดมิน", "bom_request.created"), G("กลุ่มผลิต", ["production"], "bom_request")],
    files: ["app/api/bom/change-requests/route.ts"] },
  { id: "bom_request_result", area: "make", label: "ผลคำขอแก้สูตร", node: "sku", events: ["bom_request.result"],
    when: "คนดูแลสูตรอนุมัติ / ไม่อนุมัติ",
    send: [B("ผู้ขอ")],
    files: ["app/api/bom/change-requests/route.ts"] },
  { id: "catch_up_request", area: "make", label: "ขอยืนยันอัปเดตงานย้อนหลัง", node: "mo", events: ["catch_up_request"],
    when: "โหมดตามเก็บ — ขอให้หัวหน้ายืนยันงานที่ทำไปแล้ว",
    send: [B("หัวหน้าที่ถูกขอ")],
    files: ["app/api/mo/catch-up/requests/route.ts"] },

  // ── QC ──
  { id: "qc_pending", area: "qc", label: "ช่างส่งงาน รอ QC", node: "sub", events: ["qc.pending"],
    when: "ช่างกดส่งงานเข้าโกดัง QC",
    send: [B("ผู้จัดการ + แอดมิน", "qc.pending"), G("กลุ่ม QC", ["qc"], "qc_pending")],
    files: ["app/api/mo/submissions/route.ts"] },
  { id: "qc_defect", area: "qc", label: "QC พบของเสีย", node: "qc", events: ["qc.defect"],
    when: "QC บันทึกของเสีย",
    send: [B("ผู้จัดการ + แอดมิน", "qc.defect"), G("กลุ่ม QC", ["qc"], "qc_defect"), { kind: "dm", to: "ช่างเจ้าของงาน" }],
    files: ["app/api/qc-warehouse/items/route.ts"] },
  { id: "qc_return", area: "qc", label: "งานถูกตีกลับให้แก้", node: "qc",
    when: "QC กดคืนงานให้ช่างแก้ / ทำใหม่",
    send: [{ kind: "dm", to: "ช่างเจ้าของงาน" }],
    files: ["app/api/qc-warehouse/items/route.ts"] },

  // ── ขาย ──
  { id: "so_confirm", area: "sell", label: "ใบขายยืนยันแล้ว", node: "bill", events: ["so.confirm"],
    when: "กดยืนยันใบขาย (ระบบจองของ)",
    send: [B("ผู้จัดการ", "so.confirm")],
    files: ["supabase/migrations/202609251200_numbering_recycle_cancelled.sql"] },

  // ── เว็บร้าน ──
  { id: "webshop_order", area: "web", label: "ออเดอร์เว็บใหม่",
    when: "ลูกค้าสั่งซื้อหน้าเว็บร้าน",
    send: [G("กลุ่มเว็บร้าน", ["webshop"], "webshop_order"), { kind: "oa", to: "ลูกค้า (LINE OA ร้าน)" }, { kind: "email", to: "ลูกค้า", shop: true }],
    files: ["lib/webshop-line.ts", "lib/order-notify.ts"] },
  { id: "webshop_slip", area: "web", label: "ลูกค้าแนบสลิป รอตรวจเงิน",
    when: "ลูกค้าอัปโหลดสลิปโอนเงิน",
    send: [G("กลุ่มเว็บร้าน", ["webshop"], "webshop_slip")],
    files: ["lib/webshop-line.ts"] },
  { id: "webshop_return", area: "web", label: "ลูกค้าขอคืน / เปลี่ยนสินค้า",
    when: "ลูกค้ากดขอคืน/เปลี่ยน + ผลการพิจารณา",
    send: [G("กลุ่มเว็บร้าน", ["webshop"], "webshop_return"), { kind: "oa", to: "ลูกค้า (ผลคืน/เปลี่ยน)" }],
    files: ["lib/webshop-line.ts"] },
  { id: "order_status", area: "web", label: "ออเดอร์เปลี่ยนสถานะ",
    when: "จ่ายแล้ว · ส่งแล้ว (เลขพัสดุ) · สำเร็จ · ยกเลิก · คืนเงิน",
    send: [{ kind: "oa", to: "ลูกค้า" }, { kind: "email", to: "ลูกค้า", shop: true }],
    files: ["lib/order-notify.ts", "lib/webshop-line.ts"] },
  { id: "webshop_reminders", area: "web", label: "ตะกร้าค้าง · ของลดราคา · ของกลับมามี",
    when: "เตือนสมาชิกเว็บตามกติกาเตือนลูกค้า",
    send: [{ kind: "oa", to: "สมาชิก (LINE OA ร้าน)" }, { kind: "email", to: "สมาชิกที่ยืนยันอีเมลแล้ว" }],
    files: ["lib/webshop-reminders-db.ts"] },
  { id: "customer_otp", area: "web", label: "ลืมรหัส / OTP สมาชิก",
    when: "สมาชิกเว็บขอรหัสยืนยัน",
    send: [{ kind: "email", to: "สมาชิก" }],
    files: ["app/api/storefront-member/password/route.ts"] },
  { id: "print_design", area: "web", label: "ขอรูปใหม่ / ปฏิเสธลายรีด",
    when: "พนักงานตรวจลายที่ลูกค้าส่งมาสกรีน",
    send: [{ kind: "oa", to: "ลูกค้า" }, { kind: "email", to: "ลูกค้า", manual: true }],
    files: ["lib/website-print-notify.ts"] },
  { id: "storefront_contact", area: "web", label: "ข้อความติดต่อจากหน้าเว็บ", events: ["storefront_contact.created"],
    when: "ลูกค้ากรอกฟอร์มติดต่อ",
    send: [B("ผู้จัดการ + แอดมิน", "storefront_contact.created")],
    files: ["app/api/public/storefront/contact/route.ts"] },
  { id: "website_design_review", area: "web", label: "ขอตรวจดีไซน์หน้าเว็บ", events: ["website_design_review"],
    when: "ทีมออกแบบส่งธีม/หน้าเว็บให้ตรวจ",
    send: [B("ผู้ตรวจ")],
    files: ["app/api/website/theme/review/route.ts"] },

  // ── งานครีเอทีฟ ──
  { id: "task_due", area: "creative", label: "งานเกิน / ใกล้กำหนด (ทุกวัน)", events: ["task_overdue", "task_due_soon"],
    when: "เปิดระบบแล้วมีงานครีเอทีฟเลย/ใกล้วันส่ง",
    send: [B("ผู้รับงาน")],
    note: "เด้งวันละหลายสิบครั้ง — งานเก่าที่ค้างทำให้กลายเป็นเสียงรบกวน ควรเก็บงานค้างหรือรวมเป็นสรุปวันละครั้ง",
    files: ["lib/creative-reminders.ts", "lib/creative-tasks-server.ts"] },
  { id: "creative_new_task", area: "creative", label: "มีงานครีเอทีฟใหม่ / มอบหมายงาน", events: ["task_assigned"],
    when: "สร้างงานใหม่ หรือเปลี่ยนผู้รับงาน",
    send: [B("ผู้รับงาน"), G("กลุ่มครีเอทีฟ", ["creative", "main"], "new_task")],
    files: ["app/api/creative-tasks/route.ts", "app/api/creative-tasks/[id]/route.ts", "lib/creative-tasks-server.ts"] },
  { id: "subtask_submitted", area: "creative", label: "ส่งงานย่อยรอตรวจ", node: "ds", events: ["subtask_submitted"],
    when: "คนทำกดส่งงานย่อย",
    send: [B("ผู้ตรวจ"), G("กลุ่มครีเอทีฟ", ["creative", "main"], "subtask_submitted")],
    note: "เป็นงานย่อยครีเอทีฟทุกชนิด (รวมงานคอนเทนต์) ไม่ใช่เฉพาะใบงานออกแบบ — ใบงานออกแบบเองยังไม่มีแจ้งเตือนของตัวเอง",
    files: ["app/api/creative-tasks/[id]/subtasks/route.ts", "lib/creative-tasks-server.ts"] },
  { id: "creative_review", area: "creative", label: "รอตรวจ · อนุมัติ · ถูกพูดถึง · รับงานย่อย",
    events: ["task_need_review", "task_approve", "task_mention", "subtask_assigned", "subtask_self_join"],
    when: "เปลี่ยนสถานะงาน / @ชื่อในคอมเมนต์ / มอบงานย่อย",
    send: [B("คนที่เกี่ยวข้อง")],
    files: ["app/api/creative-tasks/[id]/route.ts", "app/api/creative-tasks/[id]/comments/route.ts", "app/api/creative-tasks/[id]/subtasks/route.ts", "lib/creative-tasks-server.ts"] },
  { id: "design_sheet_send", area: "creative", label: "ส่งสรุปใบงานออกแบบ (กดเอง)",
    when: "พนักงานกดส่งสรุปใบงานให้ลูกค้า/ทีม",
    send: [{ kind: "email", to: "ผู้รับที่เลือก", manual: true }],
    files: ["app/api/design-sheet-summaries/send/route.ts"] },

  // ── การเงิน / ระบบ ──
  { id: "china_pay", area: "system", label: "บิลจีน / โอนเงิน / เรตหยวน", node: "china",
    when: "กดส่งจากแอปโอนเงินจีน",
    send: [G("กลุ่มบิลจีน", ["bills", "main"], "china_bill", true), G("กลุ่มโอนเงิน", ["transfers", "main"], "transfer", true), G("กลุ่มโอนเงิน (เรต)", ["transfers", "main"], "rate", true)],
    files: ["app/api/china-pay/line-push/route.ts"] },
  { id: "subscription_renewal", area: "system", label: "บริการใกล้ต่ออายุ (ทุกเช้า 08:00)", events: ["subscription.renewal_soon"],
    when: "ตั้งเวลาทุกวัน — subscription ที่ใกล้ครบรอบ",
    send: [B("แอดมิน", "subscription.renewal_soon"), G("กลุ่มหลัก", ["main"], "subscription_renewal")],
    files: ["app/api/cron/subscriptions-renewals/route.ts", "lib/notify-recipients.ts"] },
  { id: "cashflow_low_cash", area: "system", label: "เงินจะต่ำกว่าเงินกันขั้นต่ำ (ทุกเช้า 08:05)", events: ["cashflow.low_cash"],
    when: "ตั้งเวลาทุกวัน — มองล่วงหน้าตามค่าตั้ง (ตั้งต้น 14 วัน) ถ้าเงินคงเหลือจะต่ำกว่าเงินกันขั้นต่ำ",
    send: [B("แอดมิน", "cashflow.low_cash")],
    note: "ไม่ส่ง LINE (ข้อมูลเงินห้ามเข้ากลุ่มพนักงาน — เพิ่มคนรับกระดิ่งเฉพาะคนที่ควรเห็นตัวเลขเงิน) · ยังไม่กรอกยอดเงินในบัญชี = ข้ามทุกวัน · ตั้งค่า/ทดสอบที่ /cashflow แท็บตั้งค่า",
    files: ["app/api/cron/cashflow-alert/route.ts", "vercel.json", "lib/notify-recipients.ts"] },
  { id: "perf_regression", area: "system", label: "ระบบช้าลงผิดปกติ (ทุกคืน 04:00)", events: ["perf.regression"],
    when: "ตั้งเวลาทุกคืน — ผู้ตรวจความเร็ววัดหน้าหลัก + คำสั่งฐานข้อมูล แล้วเจอหน้าที่ช้าลง/โค้ดหนักขึ้นเกินเกณฑ์ หรือคำสั่งฐานข้อมูลที่ช้าขึ้น",
    send: [B("แอดมิน", "perf.regression")],
    note: "ส่งวันละครั้งพอ · ไม่ช้าลง = ไม่ส่ง · ผลเต็มดูที่การ์ด \"ผู้ตรวจความเร็ว\" ในออฟฟิศทีม AI · เกณฑ์อยู่ที่ lib/perf-check.ts",
    files: ["app/api/cron/perf-watch/route.ts", "vercel.json", "lib/notify-recipients.ts", "lib/perf-check.ts"] },
  { id: "security_new_device", area: "system", label: "เข้าระบบจากเครื่องใหม่", events: ["security.new_device"],
    when: "มีคนล็อกอินจากเครื่อง/เบราว์เซอร์ที่ไม่เคยใช้",
    send: [B("เจ้าของบัญชี"), G("กลุ่มหลัก", ["main"])],
    files: ["app/api/auth/login-event/route.ts", "lib/login-security.ts"] },
  { id: "social_publish_failed", area: "system", label: "โพสต์โซเชียลไม่สำเร็จ", events: ["social_publish_failed"],
    when: "คิวโพสต์ Facebook / IG อัตโนมัติล้ม",
    send: [B("คนตั้งโพสต์")],
    files: ["lib/social-publish/queue.ts"] },
  { id: "checklist_assigned", area: "system", label: "ได้รับเช็กลิสต์ / แผนงานทีม",
    events: ["checklist.assigned", "team_plan.assigned", "team_plan.summary", "team_plan.remind", "team_plan.overdue", "team_plan.waiting", "team_plan.snooze"],
    when: "มีคนมอบหมายเช็กลิสต์ในเอกสาร หรือลงแผนงานทีม · เตือนก่อน/เลยกำหนด · สรุปเช้า",
    send: [B("ผู้ได้รับมอบหมาย")],
    files: ["lib/record-tasks-server.ts", "lib/team-plan-server.ts"] },
  { id: "gif_poke", area: "system", label: "สะกิดเพื่อน (GIF)", events: ["gif_poke"],
    when: "กดสะกิดเพื่อนร่วมงาน",
    send: [B("คนที่ถูกสะกิด")],
    files: ["app/api/gif-poke/route.ts"] },
];

/** ไฟล์ที่ส่ง "รายงานตามเวลา" (แถวที่สร้างจาก email_reports) */
export const NOTIFY_REPORT_FILES = ["lib/email-report/send.ts", "lib/email-report/popup.ts", "lib/email-report/discord.ts"];

export const notifyGroupLabel = (g: NotifyGroup): string => (g === "main" ? "กลุ่มหลัก" : LINE_SLOTS[g]?.label ?? g);
export const notifyChannelOf = (t: NotifyTarget): NotifyChannel =>
  t.kind === "bell" || t.kind === "popup" ? "erp" : t.kind === "group" || t.kind === "dm" || t.kind === "oa" ? "line" : t.kind === "email" ? "email" : "other";

/** ผลของปลายทาง 1 ทาง: สถานะ + ข้อความเต็ม + ป้ายสั้นในตาราง (ไม่ใส่ = ใช้ to) + สิ่งที่ต้องทำ (ถ้าเงียบ) */
export type NotifyCell = { state: NotifyState; text: string; short?: string; fix?: string };

export function notifyTargetCell(t: NotifyTarget, live: NotifyLive): NotifyCell {
  switch (t.kind) {
    case "bell": {
      if (!t.rule) return { state: "ok", text: t.to };
      const r = live.rules.find((x) => x.event === t.rule);
      if (!r) return { state: "warn", text: `${t.to} — ยังไม่มีกฎกระดิ่ง`, fix: `เพิ่มกฎกระดิ่ง “${t.rule}” ในหน้าตั้งกฎแจ้งเตือน` };
      const to = r.to || t.to;   // คนรับจริงตามกฎ (แก้ได้ในป๊อปแก้แจ้งเตือน) — ไม่มี = ป้ายในทะเบียน
      return r.active ? { state: "ok", text: to, short: to } : { state: "off", text: `${to} — ปิดกฎไว้`, short: to, fix: "เปิดกฎนี้ (กดแก้ไขที่แถว หรือหน้าตั้งกฎแจ้งเตือน)" };
    }
    case "group": {
      const want = notifyGroupLabel(t.groups[0]);
      if (!live.line.token) return { state: "warn", text: `${want} — ยังไม่ได้ตั้งบอท LINE`, fix: "ตั้งบอท LINE (token) ในศูนย์ LINE" };
      if (t.event && live.line.off[t.event]) return { state: "off", text: `${want} — ปิดสวิตช์ไว้`, fix: "เปิดสวิตช์เรื่องนี้ในศูนย์ LINE" };
      const i = t.groups.findIndex((g) => (g === "main" ? live.line.main : !!live.line.groups[g]));
      const how = t.manual ? " (กดส่งเอง)" : "";
      if (i === 0) return { state: "ok", text: `${t.to}${how}` };
      if (i > 0) return { state: "ok", text: `ส่งเข้า${notifyGroupLabel(t.groups[i])}${how} — แทน${want}ที่ยังไม่ตั้ง`, short: `${notifyGroupLabel(t.groups[i])} (แทน)`, fix: `ถ้าอยากแยกกลุ่ม ให้ตั้ง${want}ในศูนย์ LINE` };
      return { state: "warn", text: `${want} — ยังไม่ตั้งกลุ่ม`, fix: `เชิญบอทเข้ากลุ่ม แล้วเลือกกลุ่มให้ช่อง “${want}” ในศูนย์ LINE` };
    }
    case "dm": {
      const { linked, active } = live.staff;
      const fix = "ช่างต้องผูก LINE กับข้อมูลพนักงานก่อน ระบบถึงส่ง LINE ส่วนตัวได้";
      if (linked === 0) return { state: "warn", text: `${t.to} — ยังไม่มีใครผูก LINE (0/${active})`, fix };
      return linked * 2 < active ? { state: "warn", text: `${t.to} — ผูก LINE แล้ว ${linked}/${active} คน`, fix } : { state: "ok", text: `${t.to} (${linked}/${active} คน)` };
    }
    case "oa": {
      const s = live.shops;
      if (s.line === 0) return { state: "warn", text: `${t.to} — ร้านยังไม่เปิด`, fix: "เปิดสวิตช์ “แจ้งสถานะออเดอร์ทาง LINE OA” ในข้อมูลร้าน" };
      if (s.oa === 0) return { state: "warn", text: `${t.to} — ยังไม่มี token ร้าน`, fix: "ใส่ token LINE OA ของร้าน (ทีมพัฒนาตั้งให้)" };
      return { state: "ok", text: `${t.to} (${s.line} ร้าน)` };
    }
    case "email": {
      if (!live.email) return { state: "warn", text: `${t.to} — ยังไม่ตั้งระบบอีเมล`, fix: "ตั้งระบบส่งอีเมล (Resend หรือ Gmail) — ทีมพัฒนาตั้งให้" };
      if (t.shop && live.shops.email === 0) return { state: "warn", text: `${t.to} — ร้านยังไม่เปิด`, fix: "เปิดสวิตช์ “ส่งอีเมลแจ้งลูกค้าอัตโนมัติ” ในข้อมูลร้าน" };
      return { state: "ok", text: `${t.to}${t.manual ? " (พนักงานกดส่ง)" : ""}` };
    }
    case "popup": return live.channels.popup ? { state: "ok", text: t.to } : { state: "off", text: `${t.to} — ปิดทั้งระบบ`, fix: "เปิดช่องทางป๊อปอัปในหน้ารายงานอีเมล" };
    case "discord": return live.channels.discord ? { state: "ok", text: t.to } : { state: "off", text: `${t.to} — ปิดทั้งระบบ`, fix: "เปิดช่องทาง Discord ในหน้ารายงานอีเมล" };
  }
}

const DAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
/** วันส่งแบบย่อ เช่น [1..6] → "จ–ส" · [1,3,5] → "จ อ… " */
export function notifyDaysText(days: number[]): string {
  const d = [...new Set(days)].filter((x) => x >= 0 && x <= 6).sort((a, b) => a - b);
  if (d.length === 7) return "ทุกวัน";
  if (d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1)) return `${DAY_TH[d[0]]}–${DAY_TH[d[d.length - 1]]}`;
  return d.map((x) => DAY_TH[x]).join(" ");
}

/** แถว "รายงานตามเวลา" สร้างจาก email_reports (เพิ่มรายงานในหน้ารายงานอีเมล → ขึ้นที่นี่เอง) */
export function notifyReportTopics(live: NotifyLive): NotifyTopic[] {
  return live.reports.map((r) => ({
    id: `report:${r.id}`, area: "report" as const, label: r.name, paused: !r.on,
    when: `${r.time ? `${r.time.slice(0, 5)} น. ` : ""}${notifyDaysText(r.days)}${r.on ? "" : " · ปิดรายงานไว้"}`,
    send: [
      ...(r.popup ? [{ kind: "popup" as const, to: "ป๊อปอัปในระบบ" }] : []),
      ...(r.email ? [{ kind: "email" as const, to: "ผู้รับรายงาน" }] : []),
      ...(r.discord ? [{ kind: "discord" as const, to: "Discord" }] : []),
    ],
    note: r.email ? undefined : "อีเมลของรายงานนี้ปิดอยู่ (ส่งเฉพาะช่องทางที่เปิด)",
    files: NOTIFY_REPORT_FILES,
  }));
}

/** ทุกเรื่อง (ทะเบียน + รายงานตามเวลาจาก live) */
export const notifyAllTopics = (live: NotifyLive | null): NotifyTopic[] => (live ? [...NOTIFY_TOPICS, ...notifyReportTopics(live)] : NOTIFY_TOPICS);

// ── หมายเหตุของเรื่องแจ้งเตือน (2026-11-06) ──
// แอดมินเขียนในป๊อปแก้แจ้งเตือน → เก็บที่ china_app_settings skey NOTIFY_REMARKS_KEY (ก้อนเดียว id → ข้อความ · ไม่มีตารางใหม่)
// โชว์เป็นบรรทัด "หมายเหตุ: …" ใต้ป้ายแจ้งเตือนในแผงกล่อง + แผงรายละเอียดแท็บแจ้งเตือน · ไม่ส่งไปกับแจ้งเตือน
// ⚠️ ทุกคนที่เปิดแผนผังเห็น — ห้ามใส่ตัวเลขเงิน / รหัส / token
export const NOTIFY_REMARKS_KEY = "flow_notify_remarks";
export const NOTIFY_REMARK_MAX = 500;

/** id ที่แปะหมายเหตุได้: เรื่องในทะเบียน หรือรายงานตามเวลา (report:<uuid>) */
export const isNotifyTopicId = (id: string): boolean =>
  NOTIFY_TOPICS.some((t) => t.id === id) || /^report:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** ทำความสะอาดก้อนหมายเหตุที่อ่านจาก DB — เก็บเฉพาะ id ที่รู้จัก + ข้อความ (ตัดยาวเกิน) */
export function cleanNotifyRemarks(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && isNotifyTopicId(id)) out[id] = v.trim().slice(0, NOTIFY_REMARK_MAX);
  }
  return out;
}

/** หมายเหตุที่ใช้จริง: ที่แอดมินเขียน (ว่าง = ไม่โชว์) · ยังไม่เคยเขียน = ข้อสังเกตในทะเบียน (note) */
export function notifyRemark(topic: NotifyTopic, live: NotifyLive | null): string {
  const r = live?.remarks;
  if (r && Object.prototype.hasOwnProperty.call(r, topic.id)) return r[topic.id];
  return topic.note ?? "";
}

/** สถานะรวมของเรื่อง: ok = มีอย่างน้อย 1 ทางถึงคน · warn = เงียบทุกทาง · off = ปิดทุกทาง */
/** ผลทุกปลายทางของเรื่อง (เรียงตาม topic.send) */
export const notifyTopicCells = (topic: NotifyTopic, live: NotifyLive): NotifyCell[] =>
  topic.send.map((t) => {
    if (topic.paused) return { state: "off" as const, text: `${t.to} — ปิดไว้` };
    // กระดิ่งที่โค้ดส่งตรง + ปิดสวิตช์ครบทุก event ของเรื่อง (lib/bell-switch) = ปิด
    if (t.kind === "bell" && !t.rule && notifyBellSwitchable(topic) && topic.events!.every((e) => live.bellOff?.[e])) {
      return { state: "off" as const, text: `${t.to} — ปิดสวิตช์ไว้`, short: t.to, fix: "เปิดสวิตช์เรื่องนี้ (แผงกระดิ่งบนกล่อง หรือปุ่มแก้ไขในแท็บแจ้งเตือน)" };
    }
    return notifyTargetCell(t, live);
  });

export function notifyTopicState(topic: NotifyTopic, live: NotifyLive): { state: NotifyState; silent: number } {
  const cells = notifyTopicCells(topic, live);
  const silent = cells.filter((c) => c.state === "warn").length;
  const state: NotifyState = cells.some((c) => c.state === "ok") ? "ok" : cells.some((c) => c.state === "warn") ? "warn" : "off";
  return { state, silent };
}

/** สถิติรวม 90 วันของเรื่อง (รวมหลาย event_type) — null = เรื่องนี้ไม่ลงกระดิ่ง */
export function notifyTopicStat(topic: NotifyTopic, live: NotifyLive): NotifyStat | null {
  if (!topic.events?.length) return null;
  const out: NotifyStat = { n: 0, read: 0, users: 0, last: null };
  out.n7 = 0; out.read7 = 0;
  for (const e of topic.events) {
    const s = live.stats[e];
    if (!s) continue;
    out.n += s.n; out.read += s.read; out.users = Math.max(out.users, s.users);
    out.n7 += s.n7 ?? 0; out.read7 += s.read7 ?? 0;
    if (s.last && (!out.last || s.last > out.last)) out.last = s.last;
  }
  return out;
}

/** event_type ทุกตัวที่มีเรื่องในทะเบียนอ้าง (กฎที่ไม่อยู่ในนี้ = ไม่มีโค้ดยิง) */
export const NOTIFY_KNOWN_EVENTS: ReadonlySet<string> = new Set(NOTIFY_TOPICS.flatMap((t) => [
  ...(t.events ?? []),
  ...t.send.flatMap((s) => (s.kind === "bell" && s.rule ? [s.rule] : [])),
]));
/** กฎกระดิ่งที่เปิดอยู่แต่ไม่มีโค้ดไหนยิง (ส่วนใหญ่มาจากระบบ playground เก่า) */
export const notifyGhostRules = (live: NotifyLive) => live.rules.filter((r) => r.active && !NOTIFY_KNOWN_EVENTS.has(r.event));

/** เรื่องที่ผูกกับกล่องในแผนผัง */
export const notifyTopicsOfNode = (node: string): NotifyTopic[] => NOTIFY_TOPICS.filter((t) => t.node === node);
/** กล่องของฝ่ายที่ยังไม่มีแจ้งเตือนเลย */
export const notifyGapNodes = (area: NotifyArea): string[] => NOTIFY_AREAS[area].nodes.filter((n) => !NOTIFY_TOPICS.some((t) => t.node === n));

// ── แผงกระดิ่งบนกล่อง (2026-11-10) ──
// เจ้าของขอ "กดกระดิ่งแล้วดูได้ว่าแจ้งอะไรบ้าง จัดการได้ด้วย" → กดกระดิ่งเปิดแผงขวาของผัง (components/flow-map/node-notify.tsx) ไม่สลับแท็บ
// ตัวอย่างข้อความ = รูปแบบเดียวกับที่โค้ดส่งจริง (คำใน {} = ค่าจริงตอนส่ง) · ห้ามใส่ตัวเลขเงินจริง / ชื่อลูกค้าจริง
//   เปลี่ยนข้อความแจ้งเตือนในโค้ดเมื่อไร → แก้ตัวอย่างที่นี่ด้วย (เทสต์บังคับ: ทุกเรื่องที่ผูกกล่องต้องมีตัวอย่าง)

export type NotifySample = {
  /** กระดิ่งในระบบ [หัวข้อ, รายละเอียด] */
  bell?: [string, string];
  /** LINE (กลุ่ม / ส่วนตัว) */
  line?: string;
};

export const NOTIFY_SAMPLES: Record<string, NotifySample> = {
  pr_created: {
    bell: ["ใบขอซื้อใหม่ 2 ใบ", "{ผู้ขอ} · 24 ชิ้น · {ยอดรวม}\n• ซิป #5 สีส้ม ×12 หลา — {ใช้กับ MO}\n• ผ้าซับใน ×12 เมตร"],
    line: "ใบขอซื้อใหม่ 2 ใบ\nผู้ขอ: {ผู้ขอ}\n• ซิป #5 สีส้ม ×12 หลา\n• ผ้าซับใน ×12 เมตร\nจำนวนรวม: 24 ชิ้น\nยอดรวม: {ยอดรวม}\n→ เปิดแอปจัดซื้อเพื่ออนุมัติ",
  },
  pr_rejected: {
    bell: ["ใบขอซื้อ {เลขใบ} ไม่ได้รับอนุมัติ", "เหตุผล: {เหตุผล}"],
    line: "ใบขอซื้อไม่อนุมัติ 1 ใบ\nโดย: {ผู้อนุมัติ}\nเหตุผล: {เหตุผล}\n• {สินค้า} ×{จำนวน}\n→ เปิดแอปจัดซื้อเพื่อดูรายละเอียด",
  },
  po_created: { line: "สั่งซื้อแล้ว 2 ใบ\nโดย: {ชื่อ}\n• {เลข PO} · {ร้าน} · {ยอด} (3 รายการ)\n→ เปิดแอปจัดซื้อเพื่อติดตามของเข้า" },
  goods_received: { line: "รับของเข้าแล้ว · {เลขใบรับ}\nPO {เลข PO} · {ร้าน}\nรับ 3 รายการ · เข้าสต๊อก 3 รายการ\nสถานะใบสั่งซื้อ: {สถานะ}\nผู้รับ: {ชื่อ}" },
  wo_dispatched: { line: "จ่ายงานใหม่ · {SKU}\n{ชื่อสินค้า}\nช่าง {ชื่อ} · โต๊ะ {แผนก} · {จำนวน} ชิ้น\nกำหนด {วันที่}\n{ลิงก์}" },
  wo_due_soon: {
    bell: ["งานใกล้/เกินกำหนด 12 รายการ", "เลยกำหนดแล้ว 9 รายการ · {SKU} · {โต๊ะ} · เลยกำหนด 66 วัน | …"],
    line: "งานใกล้/เกินกำหนด · {SKU}\nโต๊ะ {แผนก} · เหลือส่ง {จำนวน} ชิ้น\n{วันที่} ({เหลือกี่วัน})\n{ลิงก์}",
  },
  material_request: {
    bell: ["ขอเพิ่มวัตถุดิบ · {ชื่อวัตถุดิบ}", "ผู้ขอ: {ชื่อ} · {หมายเหตุ}"],
    line: "ขอเพิ่มวัตถุดิบ · {ชื่อวัตถุดิบ}\nผู้ขอ: {ชื่อ}\n{หมายเหตุ}\n{ลิงก์}",
  },
  material_request_result: { bell: ["อนุมัติแล้ว · {ชื่อวัตถุดิบ}", "สร้างเป็น {รหัสใหม่} แล้ว"] },
  bom_request: {
    bell: ["ขอแก้สูตร · {SKU}", "ผู้ขอ: {ชื่อ} · เปลี่ยน 3 รายการ · {หมายเหตุ}"],
    line: "ขอแก้สูตร · {SKU}\n{ชื่อสินค้า}\nผู้ขอ: {ชื่อ} · 3 รายการ\n{หมายเหตุ}\n{ลิงก์}",
  },
  bom_request_result: { bell: ["อนุมัติแล้ว · แก้สูตร {SKU}", "เขียนลงสูตร {รหัสสูตร} แล้ว"] },
  catch_up_request: { bell: ["รอยืนยันอัปเดตงาน · {SKU}", "{ชื่อ} ส่งอัปเดต {เลข MO} — {ขั้นที่ทำ}"] },
  qc_pending: {
    bell: ["มีงานรอ QC · {SKU}", "{ช่าง} · 30 ชิ้น · {ชื่อสินค้า}"],
    line: "มีงานรอ QC · {SKU}\n{ชื่อสินค้า}\nช่าง {ชื่อ} · 30 ชิ้น\n{ลิงก์}",
  },
  qc_defect: {
    bell: ["พบของเสีย · {SKU}", "{เหตุผล} · 2 ชิ้น · ช่าง {ชื่อ}"],
    line: "พบของเสีย · {SKU}\n{ชื่อสินค้า}\n{เหตุผล} · 2 ชิ้น · ช่าง {ชื่อ}\n{ลิงก์}",
  },
  qc_return: { line: "งานถูกตีกลับให้แก้/ทำใหม่\n{SKU} · {ชื่อสินค้า}\nจำนวน 2 ชิ้น\n{ลิงก์}" },
  so_confirm: { bell: ["SO {เลขที่} ยืนยันแล้ว", "{ลูกค้า} · {ยอด} · โดย {ชื่อ}"] },
  subtask_submitted: {
    bell: ["รออนุมัติงานย่อย: {ชนิดงานย่อย}", "{เลขงาน} {ชื่องาน}"],
    line: "ส่งงานย่อยรอตรวจ · {ชนิดงานย่อย}\n{เลขงาน} {ชื่องาน}\nโดย {ชื่อ}\n[ปุ่ม เปิดดูงาน]",
  },
  china_pay: { line: "{ข้อความที่พนักงานกดส่งจากแอปโอนเงินจีน — บิล / ยอดโอน / เรตหยวน}" },
};

/** เรื่องแจ้งเตือนที่ "ควรมี" ต่อกล่อง (ยังไม่ได้ทำ) — แผงกระดิ่งโชว์ใต้รายการ + ปุ่มใส่ตะกร้าขอให้ทำ
 *  ทำแล้วเมื่อไร → ย้ายเป็นเรื่องใน NOTIFY_TOPICS แล้วลบข้อเสนอนั้นทิ้ง */
export const NOTIFY_NODE_SUGGEST: Record<string, string[]> = {
  qt: ["ลูกค้าตอบรับใบเสนอราคา → แจ้งเซลส์ให้เปิดใบสั่งขาย (ในแอป)", "ใบเสนอราคาใกล้หมดอายุแต่ลูกค้ายังไม่ตอบ → แจ้งเซลส์เจ้าของใบ"],
  so: ["ใบสั่งขายใหม่ → แจ้งหัวหน้าผลิตให้เปิดใบสั่งผลิต (ในแอป)", "ใกล้วันส่งแต่ยังไม่มีใบสั่งผลิต → แจ้งเซลส์ + หัวหน้าผลิต"],
  mo: ["มีใบสั่งผลิตใหม่ → แจ้งหัวหน้าผลิต (ในแอป · ไม่ส่ง LINE เพราะเกิดบ่อย)"],
  ds: ["ใบงานออกแบบรอตรวจ / ลูกค้าตอบกลับ → แจ้งผู้ออกแบบ"],
  pay: ["รอบเงินเดือนอนุมัติแล้วแต่ยังไม่กดจ่าย → แจ้งแอดมินในแอป (ห้ามส่งเข้า LINE กลุ่ม เพราะเป็นตัวเลขเงิน)"],
  wo: ["จ่ายงานบ่อย → ส่ง LINE เป็นสรุปวันละครั้งแทนทีละใบ (ประหยัดโควตา LINE)"],
};

/** สวิตช์เปิด/ปิดทั้งเรื่องจากแผงกระดิ่ง: กฎกระดิ่งที่มีอยู่จริง + สวิตช์ LINE ในศูนย์ LINE (ไม่นับที่คนกดส่งเอง)
 *  can = มีอะไรให้สลับ · on = อย่างน้อย 1 ทางเปิดอยู่ · ค่าเก็บที่เดิม (erp_notification_rules / line_config.disabled_events) */
export function notifyTopicSwitch(topic: NotifyTopic, live: NotifyLive): { rules: string[]; events: string[]; bells: string[]; can: boolean; on: boolean; switched: string[]; fixed: string[] } {
  const ruleOk = (s: NotifyTarget) => s.kind === "bell" && !!s.rule && live.rules.some((r) => r.event === s.rule);
  const eventOk = (s: NotifyTarget) => s.kind === "group" && !!s.event && !s.manual;
  const bellSw = notifyBellSwitchable(topic);
  const bellOk = (s: NotifyTarget) => bellSw && s.kind === "bell" && !s.rule;   // กระดิ่งที่โค้ดส่งตรง → สวิตช์ lib/bell-switch
  const rules = [...new Set(topic.send.flatMap((s) => (s.kind === "bell" && ruleOk(s) ? [s.rule!] : [])))];
  const events = [...new Set(topic.send.flatMap((s) => (s.kind === "group" && eventOk(s) ? [s.event!] : [])))];
  const bells = topic.send.some(bellOk) ? [...(topic.events ?? [])] : [];
  const on = rules.some((k) => live.rules.find((r) => r.event === k)?.active) || events.some((e) => !live.line.off[e]) || bells.some((e) => !live.bellOff?.[e]);
  // ป้ายภาษาคน: ทางที่สวิตช์นี้คุม / ทางที่ยังส่งต่อ (ไม่มีสวิตช์) — ใช้บอกในป๊อปยืนยันปิด ไม่ให้เข้าใจผิดว่าเงียบทั้งเรื่อง
  const label = (s: NotifyTarget) => (s.kind === "bell" ? "กระดิ่งในแอป" : s.kind === "group" ? `LINE ${s.to}${s.manual ? " (กดส่งเอง)" : ""}`
    : s.kind === "dm" ? "LINE ส่วนตัว" : s.kind === "oa" ? "LINE OA" : s.kind === "email" ? "อีเมล" : s.kind === "popup" ? "ป๊อปอัป" : "Discord");
  const sw = (s: NotifyTarget) => ruleOk(s) || eventOk(s) || bellOk(s);
  const switched = [...new Set(topic.send.filter(sw).map(label))];
  const fixed = [...new Set(topic.send.filter((s) => !sw(s)).map(label))];
  return { rules, events, bells, can: rules.length + events.length + bells.length > 0, on, switched, fixed };
}

/** เรื่องที่กระดิ่ง "ปิดไม่ได้" ถึงจะโค้ดส่งตรง — ความปลอดภัย · ปุ่มที่คนกดเพื่อแจ้งคนอื่นโดยเฉพาะ (ปิดแล้วปุ่มไร้ผล) */
export const NOTIFY_BELL_LOCKED: ReadonlySet<string> = new Set(["security_new_device", "website_design_review", "gif_poke"]);

/** กระดิ่งที่โค้ดส่งตรงของเรื่องนี้ปิด/เปิดได้ไหม (สวิตช์ lib/bell-switch ต่อ event_type ของเรื่อง) */
export function notifyBellSwitchable(topic: NotifyTopic): boolean {
  return !NOTIFY_BELL_LOCKED.has(topic.id) && !!topic.events?.length && topic.send.some((s) => s.kind === "bell" && !s.rule);
}

/** event_type ทั้งหมดที่ /api/admin/bell-switches ยอมให้ปิด */
export const NOTIFY_BELL_SWITCH_EVENTS: ReadonlySet<string> = new Set(NOTIFY_TOPICS.filter(notifyBellSwitchable).flatMap((t) => t.events ?? []));

/** กลุ่ม LINE ที่ใช้ทดสอบส่งของเรื่องนี้ = กลุ่มแรกที่ตั้งแล้ว (ไม่นับกลุ่มหลัก — ศูนย์ LINE ทดสอบได้เฉพาะช่องที่มีชื่อ) · null = ทดสอบ LINE ไม่ได้ */
export function notifyTestGroup(topic: NotifyTopic, live: NotifyLive): LineSlotKey | null {
  if (!live.line.token) return null;
  for (const s of topic.send) {
    if (s.kind !== "group" || (s.event && live.line.off[s.event])) continue;
    const g = s.groups.find((x) => (x === "main" ? live.line.main : !!live.line.groups[x]));
    if (g && g !== "main") return g;
  }
  return null;
}
