/**
 * ขั้นของรายการในใบสั่งขาย (มุมมอง "ตามชุด" หน้า /sales/orders) — คิดจากข้อเท็จจริง ไม่มีสถานะชุดที่ตั้งเอง
 *   0 รอเปิดผลิต   = ยังไม่มีใบสั่งผลิต
 *   1 เปิดผลิตแล้ว = มีใบสั่งผลิต ยังไม่จ่ายงาน
 *   2 กำลังผลิต    = จ่ายงานแล้ว (บอร์ดจ่ายงาน)
 *   3 ทำเสร็จ      = ช่างส่งงานครบ / เข้า QC / ปิดใบแล้ว
 *   4 ส่งลูกค้าแล้ว = ใบสั่งขายกด "ส่งแล้ว" หรือ ใบขาย(บิล)ที่ผูกกับใบสั่งผลิตของรายการ ครบจำนวนแล้ว (delivered)
 * "จ่ายงานแล้ว / ส่งครบ" ต้องถามผ่าน lib/mo-dispatch (→ lib/mo-status moProgress) เท่านั้น — ห้ามเทียบ received >= qty เอง
 * ชุดทั้งชุดอยู่ขั้นไหน = ขั้นของรายการที่ช้าที่สุด
 * "ส่งแล้วกี่ชิ้น" ของรายการ = ผลรวมใบขายที่ผูกกับใบสั่งผลิต (mo_sales_links — ผูกที่บอร์ดจ่ายงาน › อัปเดตเป็นชุด) → soShipState
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
  /** ใบขายที่ผูกกับใบสั่งผลิต ครบจำนวนของรายการแล้ว */
  delivered?: boolean;
}): SoLineStage {
  if (f.orderShipped || f.delivered) return 4;
  if (!f.hasMo || f.moStatus === "cancelled") return 0;
  if (f.submitted || f.moStatus === "done" || f.moStatus === "closed") return 3;
  if (f.dispatched) return 2;
  return 1;
}

/**
 * ขั้นของรายการที่มีใบสั่งผลิตได้หลายใบ (แตกใบ / ลดจำนวน / เปิดเพิ่ม — หน้าสถานะใบสั่งขาย)
 * กติกาเดียวกับ soLineStage: จ่ายงานใบไหนก็ได้ = กำลังผลิต · ทำเสร็จ = ทุกใบส่งงานครบ/ปิดแล้ว · ส่งครบจำนวนที่สั่ง = ส่งลูกค้าแล้ว
 */
export function soLineStageMulti(f: {
  orderShipped: boolean; ordered: number; shipped: number;
  mos: { status?: string | null; dispatched?: boolean; submitted?: boolean }[];
}): SoLineStage {
  const live = f.mos.filter((m) => m.status !== "cancelled");
  const done = (m: { status?: string | null; submitted?: boolean }) => !!m.submitted || m.status === "done" || m.status === "closed";
  return soLineStage({
    orderShipped: f.orderShipped, hasMo: live.length > 0,
    dispatched: live.some((m) => m.dispatched), submitted: live.length > 0 && live.every(done),
    delivered: soShipState(f.ordered, f.shipped) === "full",
  });
}

/** ส่งลูกค้าแล้ว: ครบ / บางส่วน / ยังไม่ส่ง — เทียบจำนวนในรายการกับจำนวนในใบขายที่ผูกไว้ */
export type SoShipState = "full" | "part" | "none";
export const SO_SHIP_LABEL: Record<SoShipState, string> = { full: "ส่งครบ", part: "ส่งบางส่วน", none: "ยังไม่ส่ง" };
export function soShipState(qty: number, shipped: number): SoShipState {
  if (qty > 0 && shipped >= qty) return "full";
  return shipped > 0 ? "part" : "none";
}
