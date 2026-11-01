/**
 * 🔀 ผูกใบขายผิด · ย้าย — ส่วนที่ฝั่งเซิร์ฟเวอร์ใช้ได้ (ไม่มี React · ไม่ import ไฟล์ "use client")
 *   ประวัติส่งออกจากชั้น QC ที่ยังย้อนได้ (audit qc.ship − qc.unship) + ข้อมูลใบเดิมของหน้าต่างย้าย
 *   กติกาเลือกทาง/ตัวบันทึก = app/master/work-board/sales-move-plan.ts · API = /api/mo/sales-move
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** ส่งออกจากชั้น QC 1 ครั้ง (audit qc.ship) · left = ยังย้อนได้อีกกี่ชิ้น (หักที่ย้อนไปแล้ว — audit qc.unship) */
export type ShipRec = { id: string; qty: number; left: number; mode: string | null; date: string | null; at: string; shelf_id: string | null };
/** ข้อมูลใบเดิม — GET /api/mo/sales-move?mo_no= */
export type MoveInfo = {
  mo: { id: string; mo_no: string; qty: number; status: string; product_sku: string | null };
  links: { id: string; sale_line_id: string; so_number: string | null; sale_date: string | null; qty: number }[];
  ships: ShipRec[];
  shelves: { id: string; name: string; kind: string }[];
};

/** audit qc.ship + qc.unship ของใบนี้ → รายการส่งออกที่ยังย้อนได้ (ใหม่ก่อน) */
export function shipRecs(audits: { id: string; action: string; created_at: string; metadata: Record<string, unknown> | null }[]): ShipRec[] {
  const back = new Map<string, number>();
  for (const a of audits) if (a.action === "qc.unship") {
    const sid = String(a.metadata?.ship_audit_id ?? "");
    back.set(sid, r2((back.get(sid) ?? 0) + (Number(a.metadata?.qty) || 0)));
  }
  return audits.filter((a) => a.action === "qc.ship").map((a) => {
    const md = a.metadata ?? {};
    const qty = Number(md.qty) || 0;
    return { id: a.id, qty, left: r2(Math.max(0, qty - (back.get(a.id) ?? 0))), mode: (md.mode as string | null) ?? null,
      date: typeof md.date === "string" ? md.date : null, at: a.created_at, shelf_id: (md.shelf_id as string | null) ?? null };
  }).sort((a, b) => b.at.localeCompare(a.at));
}
export const shipLeft = (ships: ShipRec[]) => r2(ships.reduce((a, s) => a + s.left, 0));
