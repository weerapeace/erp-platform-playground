/**
 * กฎของแท็บ "ผลิต" ใน Parent SKU (components/parent-production-tab · API /api/parent-skus/[id]/production)
 * pure + เทสต์ lib/__tests__/parent-production.test.ts
 *
 * เจ้าของขอ 2026-11-11: แท็บ "ปัญหา" → "ผลิต" · โชว์ BOM เวอร์ชันล่าสุด (หลายเวอร์ชัน = แท็บ) · รายละเอียดแบบ BOM
 *   · รายการปัญหา · ประวัติการผลิต (วันไหน เท่าไหร่ ใครทำ)
 * ข้อเท็จจริง: สูตร (bom_headers) ผูกกับ SKU ลูก (product_sku = รหัส SKU) ไม่ใช่ Parent → ต้องเลือก SKU ก่อน
 */

export type BomHeaderLite = { bom_code: string; product_sku: string | null; version: string | null; updated_at?: string | null; is_default?: boolean | null };

/** เลขเวอร์ชันจาก "v12" / "V2" / "3" → 12 / 2 / 3 · อ่านไม่ได้ = 0 */
export function versionNumber(v: string | null | undefined): number {
  const m = String(v ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** เรียงเวอร์ชัน ล่าสุดก่อน (เลขมากก่อน · เลขเท่ากัน = แก้ล่าสุดก่อน) */
export function sortBomVersions<T extends BomHeaderLite>(boms: T[]): T[] {
  return [...boms].sort((a, b) =>
    versionNumber(b.version) - versionNumber(a.version)
    || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
}

/** SKU ที่เปิดให้ดูก่อน = ตัวที่สูตรถูกแก้ล่าสุด · ไม่มีสูตรเลย = SKU ตัวแรก */
export function pickDefaultSku(skuCodes: string[], boms: BomHeaderLite[]): string | null {
  const withBom = boms.filter((b) => b.product_sku && skuCodes.includes(b.product_sku));
  if (withBom.length === 0) return skuCodes[0] ?? null;
  const latest = [...withBom].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0];
  return latest.product_sku;
}

export type WorkOrderLite = {
  status: string | null; qty: number | string | null; received_qty: number | string | null;
  assignee_name?: string | null; department_name?: string | null;
  assignees?: unknown;
};

/** รวมใบจ่ายงานของใบสั่งผลิต 1 ใบ → จ่ายแล้ว/รับคืนแล้ว + ใครทำ (ไม่นับใบที่ยกเลิก) */
export function summarizeWorkOrders(wos: WorkOrderLite[]): { dispatched: number; received: number; people: string[]; departments: string[] } {
  let dispatched = 0; let received = 0;
  const people = new Set<string>(); const departments = new Set<string>();
  for (const w of wos) {
    if (w.status === "cancelled") continue;
    dispatched += Number(w.qty) || 0;
    received += Number(w.received_qty) || 0;
    const list = Array.isArray(w.assignees) ? (w.assignees as { name?: unknown }[]).map((a) => String(a?.name ?? "").trim()).filter(Boolean) : [];
    if (list.length) list.forEach((n) => people.add(n));
    else if (w.assignee_name?.trim()) people.add(w.assignee_name.trim());
    if (w.department_name?.trim()) departments.add(w.department_name.trim());
  }
  return { dispatched, received, people: [...people], departments: [...departments] };
}

export type HistoryTone = "gray" | "indigo" | "amber" | "green" | "rose";

/** สถานะย่อในตารางประวัติการผลิต (สีตาม MO_STATUS_TONE_CLASS ของกลาง lib/mo-status) */
export function productionHistoryStatus(i: { status: string | null; qty: number; dispatched: number; received: number }): { label: string; tone: HistoryTone } {
  if (i.status === "cancelled") return { label: "ยกเลิก", tone: "rose" };
  if (i.qty > 0 && i.received >= i.qty - 0.0001) return { label: "ส่งครบ", tone: "green" };
  if (i.status === "done") return { label: "ปิดใบแล้ว", tone: "green" };
  if (i.received > 0) return { label: `ส่งแล้ว ${fmtQty(i.received)}/${fmtQty(i.qty)}`, tone: "amber" };
  if (i.dispatched > 0) return { label: "กำลังผลิต", tone: "indigo" };
  return { label: "ยังไม่เริ่ม", tone: "gray" };
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
