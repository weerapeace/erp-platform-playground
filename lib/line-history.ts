/**
 * ประวัติเรื่อง LINE รวมที่เดียว (แท็บ "ประวัติ" หน้า /admin/line) — กติกาล้วน: เลือกแถวไหน + แปลเป็นภาษาคน
 * ข้อมูลจริงอยู่ใน audit_logs (ของกลาง) · ไม่สร้างตารางประวัติใหม่ · ตัวดึง /api/admin/line-overview
 * ไม่รวมการ "เปิดดู" (line_self_view / line_customer_view / line_session / employee_line_me) — เยอะและไม่ใช่การเปลี่ยนแปลง
 */

/** ประเภทข้อมูลที่เป็นเรื่อง LINE ทั้งหมด */
export const LINE_HISTORY_ENTITY_TYPES = ["line_config", "line_customer_links", "line_memberships"] as const;
/** action เรื่อง LINE ที่อยู่ในประเภทข้อมูลอื่น */
export const LINE_HISTORY_ACTIONS = [
  "payroll_line_payslip_open", "payroll_line_payslip_close",
  "line:link_user", "line:unlink_user",
  "line_register_success", "line_register_failed", "line_invite_issued",
] as const;
/** action ที่เป็นแค่การเปิดดู — ไม่โชว์ในประวัติ */
const VIEW_ONLY = new Set(["line_self_view", "line_customer_view", "line_session", "line_session_blocked", "line_session_not_registered", "employee_line_me"]);

export type LineHistoryRow = { id: string; action: string; entity_type: string; created_at: string; actor: string | null; metadata: Record<string, unknown> };
export type LineHistoryItem = { id: string; at: string; who: string; text: string; tone: "normal" | "warn" | "danger" };

export const isLineHistoryRow = (action: string, entityType: string): boolean =>
  !VIEW_ONLY.has(action) && ((LINE_HISTORY_ENTITY_TYPES as readonly string[]).includes(entityType) || (LINE_HISTORY_ACTIONS as readonly string[]).includes(action));

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

const QR_NAME: Record<string, string> = { staff: "QR พนักงาน", customer: "QR ลูกค้า", admin: "QR แอดมิน", shop: "QR รายร้าน (ทุกร้าน)" };
const LAYOUT_OP: Record<string, string> = { save: "บันทึกปุ่มเมนูไลน์บริษัท", revert: "ย้อนปุ่มเมนูไลน์บริษัทเป็นชุดก่อน", reset: "รีเซ็ตปุ่มเมนูไลน์บริษัทเป็นค่าตั้งต้น" };
const MEMBER_ACT: Record<string, string> = { block: "ระงับไลน์พนักงาน", unblock: "คืนสิทธิ์ไลน์พนักงาน", unlink: "ปลดผูกไลน์พนักงาน", confirm: "HR ยืนยันตัวตนพนักงาน", unconfirm: "ยกเลิกยืนยันตัวตนพนักงาน" };
const CUSTOMER_ACT: Record<string, string> = {
  unlink_line_customer: "ถอนผูกไลน์ลูกค้า", relink_line_customer: "ย้อนการถอนผูกไลน์ลูกค้า", block_line_customer: "ระงับไลน์ลูกค้า", unblock_line_customer: "คืนสิทธิ์ไลน์ลูกค้า",
  link_line_customer: "ลูกค้าสแกน QR ร้านแล้วผูกไลน์", request_line_customer: "ลูกค้าขอผูกไลน์กับร้าน",
  approve_line_customer_request: "ยืนยันร้านให้ลูกค้า", reject_line_customer_request: "ปฏิเสธคำขอผูกร้าน", undo_line_customer_request: "ย้อนการยืนยัน/ปฏิเสธร้าน",
};

/** แปลแถวประวัติ 1 แถวเป็นข้อความภาษาคน */
export function describeLineHistory(r: LineHistoryRow): LineHistoryItem {
  const m = r.metadata ?? {};
  const who = s(r.actor) || s(m.actor) || "ระบบ";
  const base = { id: r.id, at: r.created_at, who };
  const a = r.action;
  if (a === "rotate_line_company_qr" || (a === "update" && m.field === "company_qr")) return { ...base, text: `เปลี่ยน${QR_NAME[s(m.kind)] ?? "QR"} (ใบเก่าใช้ไม่ได้แล้ว)`, tone: "warn" };
  if (a === "update" && m.field === "company_layout") return { ...base, text: LAYOUT_OP[s(m.op)] ?? "แก้ปุ่มเมนูไลน์บริษัท", tone: "normal" };
  if (a === "update" && m.field === "company_bot") return { ...base, text: "เปลี่ยนบอทที่ใช้เป็นไลน์บริษัท", tone: "warn" };
  if (a === "update" && m.field === "company_menus") return { ...base, text: "สร้างเมนูในไลน์ใหม่", tone: "normal" };
  if (a === "update" && r.entity_type === "line_config") {
    const f = s(m.field);
    return { ...base, text: f === "groups" ? `ตั้งกลุ่มแจ้งเตือน${m.slot ? ` (${s(m.slot)})` : ""}` : f === "token" ? "เปลี่ยนโทเคนบอท" : f ? `แก้ค่าตั้ง LINE (${f})` : "แก้ค่าตั้ง LINE", tone: "normal" };
  }
  if (a === "update" && r.entity_type === "line_customer_links") return { ...base, text: "เปลี่ยนชื่อเรียกลูกค้าในไลน์", tone: "normal" };
  if (a.endsWith("_line_member")) {
    const act = a.replace(/_line_member$/, "");
    return { ...base, text: MEMBER_ACT[act] ?? "แก้สถานะไลน์พนักงาน", tone: act === "block" || act === "unlink" ? "danger" : "normal" };
  }
  if (CUSTOMER_ACT[a]) return { ...base, text: CUSTOMER_ACT[a], tone: a.startsWith("block") || a.startsWith("reject") ? "danger" : "normal" };
  if (a === "unlink_line_on_resign") return { ...base, text: "ปลดผูกไลน์อัตโนมัติ (พนักงานลาออก)", tone: "warn" };
  if (a === "payroll_line_payslip_open") return { ...base, text: `เปิดให้ดูสลิปในไลน์${m.period_name ? ` งวด ${s(m.period_name)}` : ""}`, tone: "normal" };
  if (a === "payroll_line_payslip_close") return { ...base, text: `ปิดสลิปในไลน์${m.period_name ? ` งวด ${s(m.period_name)}` : ""}`, tone: "warn" };
  if (a === "line:link_user") return { ...base, text: "แอดมินผูกไลน์กับบัญชี ERP", tone: "normal" };
  if (a === "line:unlink_user") return { ...base, text: "แอดมินถอนผูกไลน์จากบัญชี ERP", tone: "warn" };
  if (a === "line_register_success") return { ...base, text: "พนักงานผูกไลน์สำเร็จ", tone: "normal" };
  if (a === "line_register_failed") return { ...base, text: "มีคนกรอกรหัสพนักงาน/เบอร์ไม่ตรง (ผูกไลน์ไม่สำเร็จ)", tone: "danger" };
  if (a === "line_invite_issued") return { ...base, text: "พิมพ์บัตร QR ผูกไลน์ให้พนักงาน", tone: "normal" };
  return { ...base, text: `${a} (${r.entity_type})`, tone: "normal" };
}

// ---------------------------------------------------------------- เช็กลิสต์ตั้งค่าครั้งแรก

export type LineSetupInput = { hasToken: boolean; companyBot: boolean; companyReady: boolean; companyQrUsed: boolean; menusPublished: boolean };
export type LineSetupStep = { key: string; label: string; done: boolean; hint: string };

/** 4 ขั้นตั้งค่าไลน์บริษัทครั้งแรก — ขั้นที่ 3 ตรวจอัตโนมัติไม่ได้ ดูจาก "มีคนสแกน QR ผ่านหน้าเล็กแล้ว" */
export function lineSetupSteps(i: LineSetupInput): LineSetupStep[] {
  return [
    { key: "token", label: "ใส่โทเคนบอท", done: i.hasToken, hint: "แท็บ บอทและกลุ่มแจ้งเตือน" },
    { key: "bot", label: "เลือกบอทเป็น \"ไลน์บริษัท\"", done: i.companyBot && i.companyReady, hint: "แท็บ ไลน์บริษัท → บอทไลน์บริษัท" },
    { key: "developers", label: "ตั้งค่า LINE Developers (ผูก LINE Login กับบัญชีไลน์บริษัท + Add friend: Aggressive)", done: i.companyQrUsed, hint: "คู่มือ docs/line-company-oa.md · ติ๊กเองเมื่อมีคนสแกน QR สำเร็จครั้งแรก" },
    { key: "menus", label: "กด \"สร้างเมนูในไลน์\" แล้วพิมพ์ QR ไปติด", done: i.menusPublished, hint: "แท็บ ไลน์บริษัท" },
  ];
}
