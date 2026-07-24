/**
 * ทะเบียนกลาง LINE แจ้งเตือน (ของกลาง) — ใช้ร่วมกันทั้ง API (/api/admin/line-console)
 * และ UI (components/line-console). รวม "ทุกช่องทาง" ที่ ERP ส่ง LINE จริง ๆ ไว้ที่เดียว
 *
 * โครงสร้างข้อมูลจริงเก็บใน china_app_settings.line_config = {
 *   token, group_id (กลุ่มล่าสุดที่ webhook จับได้), group_captured_at,
 *   groups:  { [slotKey]: groupId },      // กลุ่มปลายทางต่อระบบ
 *   templates: { [eventKey]: text },      // แม่แบบข้อความ (บอร์ด/QC)
 *   disabled_events: { [eventKey]: true } // เปิด-ปิดแจ้งเตือนต่อเหตุการณ์ (ของใหม่ Group C)
 * }
 */

export type LineSlotKey =
  | "production" | "qc"
  | "purchase_request" | "purchase_order" | "goods_receipt"
  | "creative" | "bills" | "transfers";

export type LineSlotDef = { key: LineSlotKey; label: string; icon: string };

/** เหตุการณ์แจ้งเตือนอัตโนมัติ — auto=true จะมีสวิตช์เปิด/ปิด (ผูกกับตัวส่งจริง) */
export type LineEventDef = { key: string; label: string; slot: LineSlotKey; icon: string };

export type LineSystemDef = {
  key: string; label: string; icon: string;
  slots: LineSlotKey[];
  events: LineEventDef[];
};

/** ป้ายกลุ่มปลายทาง (8 ช่อง) */
export const LINE_SLOTS: Record<LineSlotKey, LineSlotDef> = {
  production:       { key: "production",       label: "กลุ่มผลิต (บอร์ดจ่ายงาน)", icon: "🏭" },
  qc:               { key: "qc",               label: "กลุ่ม QC (โกดัง)",         icon: "🔍" },
  purchase_request: { key: "purchase_request", label: "กลุ่มขอซื้อ",              icon: "🛒" },
  purchase_order:   { key: "purchase_order",   label: "กลุ่มใบสั่งซื้อ",          icon: "📦" },
  goods_receipt:    { key: "goods_receipt",    label: "กลุ่มรับของ",              icon: "📥" },
  creative:         { key: "creative",         label: "กลุ่มครีเอทีฟ",            icon: "🎨" },
  bills:            { key: "bills",            label: "กลุ่มบิลจีน",              icon: "🧾" },
  transfers:        { key: "transfers",        label: "กลุ่มโอนเงิน/เรต",         icon: "💱" },
};

/** ระบบ → กลุ่ม + เหตุการณ์ (เรียงตามที่ผู้บริหารเข้าใจง่าย) */
export const LINE_SYSTEMS: LineSystemDef[] = [
  {
    key: "production", label: "ผลิต", icon: "🏭", slots: ["production"],
    events: [
      { key: "wo_dispatched", label: "จ่ายงานเข้าโต๊ะ",        slot: "production", icon: "📤" },
      { key: "wo_due_soon",   label: "งานใกล้/เกินกำหนด",       slot: "production", icon: "⏰" },
    ],
  },
  {
    key: "qc", label: "QC", icon: "🔍", slots: ["qc"],
    events: [
      { key: "qc_pending", label: "มีงานรอ QC", slot: "qc", icon: "📥" },
      { key: "qc_defect",  label: "พบของเสีย",   slot: "qc", icon: "⚠️" },
    ],
  },
  {
    key: "purchasing", label: "จัดซื้อ", icon: "🛒",
    slots: ["purchase_request", "purchase_order", "goods_receipt"],
    events: [
      { key: "pr_created",     label: "มีใบขอซื้อใหม่",   slot: "purchase_request", icon: "🛒" },
      { key: "pr_rejected",    label: "ใบขอซื้อไม่อนุมัติ", slot: "purchase_request", icon: "❌" },
      { key: "po_created",     label: "ออกใบสั่งซื้อ",     slot: "purchase_order",   icon: "📦" },
      { key: "goods_received", label: "รับของเข้า",       slot: "goods_receipt",    icon: "📥" },
    ],
  },
  {
    key: "creative", label: "ครีเอทีฟ", icon: "🎨", slots: ["creative"],
    events: [],   // ส่งรูปจากกระดานเป็น "กดส่งเอง" ไม่ใช่แจ้งเตือนอัตโนมัติ → จัดการแค่กลุ่ม
  },
  {
    key: "china", label: "จีน (จ่ายเงิน)", icon: "🇨🇳", slots: ["bills", "transfers"],
    events: [
      { key: "china_bill",     label: "แจ้งบิลจีน",      slot: "bills",     icon: "🧾" },
      { key: "transfer",       label: "แจ้งโอนเงิน",     slot: "transfers", icon: "💸" },
      { key: "rate",           label: "แจ้งเรตเงินหยวน", slot: "transfers", icon: "💱" },
    ],
  },
];

/** slot ทั้งหมดเรียงตามระบบ (ไม่ซ้ำ) */
export const LINE_ALL_SLOTS: LineSlotKey[] = Array.from(
  new Set(LINE_SYSTEMS.flatMap((s) => s.slots)),
) as LineSlotKey[];

/** eventKey ทั้งหมดที่มีสวิตช์เปิด/ปิด */
export const LINE_ALL_EVENTS: string[] = LINE_SYSTEMS.flatMap((s) => s.events.map((e) => e.key));

/** เหตุการณ์นี้ "เปิดส่ง" อยู่ไหม (ค่าเริ่มต้น = เปิด · ปิดเมื่อ disabled_events[key] === true) */
export function lineEventEnabled(disabled: Record<string, boolean> | undefined | null, eventKey: string): boolean {
  return !disabled || disabled[eventKey] !== true;
}
