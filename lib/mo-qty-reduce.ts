/**
 * 📉 ลดจำนวนใบสั่งผลิต — กติกากลาง (ไม่มี React · ใช้ทั้ง API /api/mo/[id]/reduce-qty และหน้าจอโหมดอัปเดตงาน)
 *
 * ใช้ตอน "รู้ตอนเตรียมของว่าของไม่พอ ทำได้แค่บางส่วน" หรือช่างส่งคืนไม่ครบแล้วจะปิดใบ (ปิดยอดขาด)
 *   ที่เหลือ: split = แยกเป็นใบใหม่ (รอของ) · drop = ไม่ทำแล้ว · (ค้างไว้ในใบนี้ = ไม่ลด ไม่ผ่านไฟล์นี้)
 * ลดได้ต่ำสุด = ยอดที่ช่างส่งคืนแล้ว · จ่ายไปเกินจำนวนใหม่ → ลดยอดค้างของใบจ่าย (ใบล่าสุดก่อน)
 * เจ้าของอนุมัติแบบ 2026-10-31 · ดู docs/work-board-catch-up.md
 */
export type ReduceMode = "split" | "drop";
export const REDUCE_MODE_LABEL: Record<ReduceMode, string> = { split: "แยกเป็นใบใหม่ รอของ", drop: "ไม่ทำแล้ว" };
/** เหตุผลให้เลือก (ตัวสุดท้าย = พิมพ์เอง) */
export const REDUCE_REASONS = ["ของไม่พอ", "ของเสียตอนตัด/ผลิต", "ช่างส่งคืนไม่ครบ", "ลูกค้าลดจำนวน", "อื่น ๆ"] as const;

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString("th-TH");

export type ShrinkWoIn = { id: string; wo_no?: string | null; qty: number; received_qty: number; status: string; labor_cost?: number | null; created_at?: string | null };
/** ใบจ่าย 1 ใบที่ต้องลดยอด · labor_to = ค่าแรงรวมใหม่ตามราคาต่อชิ้นเดิม (null = ใบยังไม่มีค่าแรง) · ข้อมูล *_from ไว้ย้อนกลับ */
export type WoShrink = {
  id: string; wo_no: string; from: number; to: number;
  status_from: string; status_to: string; cancel: boolean; labor_from: number; labor_to: number | null;
};

/** สถานะใบจ่ายตามยอดรับคืน (กติกาเดียวกับ PATCH /api/mo/work-orders/[id]) */
export function woStatusFor(qty: number, received: number): string {
  if (qty <= EPS) return "cancelled";
  if (received >= qty - EPS) return "done";
  return received > EPS ? "partial_return" : "dispatched";
}

/** ใบจ่ายที่ต้องลดยอดค้าง เมื่อจ่ายไปเกินจำนวนใหม่ — ตัดจากใบล่าสุดก่อน ลดได้แค่ส่วนที่ช่างยังไม่ส่งคืน */
export function shrinkWos(wos: ShrinkWoIn[], newQty: number): WoShrink[] {
  const active = wos.filter((w) => w.status !== "cancelled");
  let over = r2(active.reduce((a, w) => a + w.qty, 0) - newQty);
  if (over <= EPS) return [];
  const out: WoShrink[] = [];
  const newestFirst = [...active].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  for (const w of newestFirst) {
    if (over <= EPS) break;
    const outstanding = r2(w.qty - w.received_qty);
    if (outstanding <= EPS) continue;
    const cut = r2(Math.min(outstanding, over));
    const to = r2(w.qty - cut);
    const lf = Number(w.labor_cost) || 0;
    out.push({
      id: w.id, wo_no: String(w.wo_no ?? ""), from: w.qty, to,
      status_from: w.status, status_to: woStatusFor(to, w.received_qty), cancel: to <= EPS,
      labor_from: lf, labor_to: lf > 0 && w.qty > 0 ? r2((lf / w.qty) * to) : null,
    });
    over = r2(over - cut);
  }
  return out;
}

/** ลดเป็นจำนวนนี้ได้ไหม (null = ได้) */
export function reduceQtyIssue(p: { qty: number; newQty: number; received: number; sized?: boolean; status?: string | null }): string | null {
  if (p.status === "done" || p.status === "cancelled") return "ใบนี้ปิดงาน/ยกเลิกไปแล้ว";
  if (p.sized) return "ใบนี้แบ่งจำนวนตามไซส์ — ลดรายไซส์ที่หน้าใบสั่งผลิต";
  if (!(p.newQty > 0)) return "ใส่จำนวนที่ทำได้จริง (อย่างน้อย 1 ชิ้น)";
  if (p.newQty >= p.qty - EPS) return `ใส่น้อยกว่า ${fmt(p.qty)} (ถ้าทำได้ครบไม่ต้องลด)`;
  if (p.newQty < p.received - EPS) return `ช่างส่งคืนแล้ว ${fmt(p.received)} ชิ้น — ลดต่ำกว่านั้นไม่ได้`;
  return null;
}

/** ข้อความสรุปการลด (โชว์ก่อนบันทึก / ในประวัติ) */
export function reduceSummary(p: { from: number; to: number; mode: ReduceMode; reason: string; shrink?: WoShrink[] }): string[] {
  const rest = r2(p.from - p.to);
  const out = [`ใบนี้ ${fmt(p.from)} → ${fmt(p.to)} ชิ้น (เพราะ ${p.reason || "—"})`];
  out.push(p.mode === "split" ? `แยกที่เหลือ ${fmt(rest)} ชิ้น เป็นใบสั่งผลิตใหม่ (สินค้า/สูตร/กำหนดส่งเดิม)` : `ไม่ทำแล้ว ${fmt(rest)} ชิ้น`);
  for (const s of p.shrink ?? []) out.push(s.cancel ? `ยกเลิกใบจ่าย ${s.wo_no || ""} (ยังไม่ได้ส่งคืนเลย)` : `ลดใบจ่าย ${s.wo_no || ""} ${fmt(s.from)} → ${fmt(s.to)} ชิ้น`);
  out.push("วัตถุดิบที่ต้องใช้คิดใหม่ตามจำนวนใหม่ (ติ๊กเตรียมเดิมยังอยู่ · ยอดขอซื้อไม่เกินที่ต้องใช้)");
  return out;
}
