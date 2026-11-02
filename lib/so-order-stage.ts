/**
 * ขั้นของรายการในใบสั่งขาย (มุมมอง "ตามชุด" หน้า /sales/orders) — คิดจากข้อเท็จจริง ไม่มีสถานะชุดที่ตั้งเอง
 *   0 รอเปิดผลิต   = ยังไม่มีใบสั่งผลิต
 *   1 เปิดผลิตแล้ว = มีใบสั่งผลิต ยังไม่จ่ายงาน
 *   2 กำลังผลิต    = จ่ายงานแล้ว (บอร์ดจ่ายงาน)
 *   3 ทำเสร็จ      = ช่างส่งงานครบ / เข้า QC / ปิดใบแล้ว
 *   4 ส่งลูกค้าแล้ว = ใบสั่งขายกด "ส่งแล้ว"
 * "จ่ายงานแล้ว / ส่งครบ" ต้องถามผ่าน lib/mo-dispatch (→ lib/mo-status moProgress) เท่านั้น — ห้ามเทียบ received >= qty เอง
 * ชุดทั้งชุดอยู่ขั้นไหน = ขั้นของรายการที่ช้าที่สุด
 */
export const SO_LINE_STAGES = [
  { key: 0, label: "รอเปิดผลิต",   short: "รอเปิดผลิต" },
  { key: 1, label: "เปิดผลิตแล้ว", short: "เปิดผลิต" },
  { key: 2, label: "กำลังผลิต",    short: "กำลังผลิต" },
  { key: 3, label: "ทำเสร็จ รอส่ง", short: "ทำเสร็จ" },
  { key: 4, label: "ส่งลูกค้าแล้ว", short: "ส่งแล้ว" },
] as const;
export type SoLineStage = 0 | 1 | 2 | 3 | 4;

export function soLineStage(f: {
  orderShipped: boolean;
  hasMo: boolean;
  moStatus?: string | null;
  dispatched?: boolean;
  submitted?: boolean;
}): SoLineStage {
  if (f.orderShipped) return 4;
  if (!f.hasMo || f.moStatus === "cancelled") return 0;
  if (f.submitted || f.moStatus === "done" || f.moStatus === "closed") return 3;
  if (f.dispatched) return 2;
  return 1;
}
