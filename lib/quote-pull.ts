/**
 * กติกา "ดึงใบเสนอราคาเข้าใบสั่งขาย" ส่วนที่ไม่แตะฐานข้อมูล (pure — ใช้ได้ทั้งหน้าจอ เซิร์ฟเวอร์ และเทสต์)
 * ส่วนที่อ่าน/เขียนฐานข้อมูลอยู่ที่ lib/quote-convert.ts
 */

export const QUOTE_PULLABLE_STATUSES = ["sent", "accepted"] as const;
export const QUOTE_STATUS_TH: Record<string, string> = {
  draft: "ร่าง", sent: "ส่งแล้ว", accepted: "ตอบรับแล้ว", converted: "แปลงแล้ว",
  rejected: "ปฏิเสธ", expired: "หมดอายุ", cancelled: "ยกเลิก",
};

export type QuoteForPull = {
  id: string; quote_number: string | null; status: string | null;
  converted_so_id: string | null; customer_id: string | null; accepted_at?: string | null;
};

/**
 * เหตุผลที่ดึงใบนี้เข้าใบสั่งขายไม่ได้ (null = ดึงได้)
 * @param linkedOrderNo  เลขใบสั่งขาย "อื่น" ที่ใบนี้อยู่แล้ว (ไม่นับใบที่กำลังแก้)
 * @param mine           ใบนี้อยู่ในใบสั่งขายที่กำลังแก้อยู่แล้ว (สถานะ "แปลงแล้ว" ของใบนี้เองถือว่าผ่าน)
 * @param customerId     ลูกค้าของใบสั่งขาย (ว่าง = ไม่เช็ก)
 */
export function quotePullBlock(q: QuoteForPull, opts: { linkedOrderNo?: string | null; mine?: boolean; customerId?: string | null } = {}): string | null {
  const no = q.quote_number || "ใบเสนอราคา";
  if (q.converted_so_id) return `${no} แปลงเป็นใบขายไปแล้ว`;
  if (opts.linkedOrderNo) return `${no} อยู่ในใบสั่งขาย ${opts.linkedOrderNo} แล้ว`;
  const okStatus = (QUOTE_PULLABLE_STATUSES as readonly string[]).includes(q.status ?? "") || (opts.mine && q.status === "converted");
  if (!okStatus) return `${no} ยังดึงไม่ได้ (สถานะ: ${QUOTE_STATUS_TH[q.status ?? ""] ?? q.status ?? "—"}) — ต้อง "ส่งแล้ว" หรือ "ตอบรับแล้ว"`;
  if (opts.customerId && q.customer_id && opts.customerId !== q.customer_id) return `${no} เป็นของลูกค้าคนอื่น`;
  return null;
}

type PickDoc = { id: string; no: string | null; customer_id?: string | null; customer_name: string | null };
const sameName = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * หน้าจอ: เลือกใบเสนอราคาหลายใบเข้าใบสั่งขายใบเดียว — ต้องเป็นลูกค้าเดียวกัน · ใบที่อยู่ในฟอร์มแล้วไม่ดึงซ้ำ
 * ลูกค้าหลัก = ลูกค้าที่เลือกในฟอร์มแล้ว หรือ (ยังไม่เลือก) ลูกค้าของใบแรกที่เลือก
 */
export function pickQuoteDocs<T extends PickDoc>(docs: T[], opts: { customerId?: string | null; customerName?: string | null; have?: Iterable<string> }): { keep: T[]; skipped: string[] } {
  const have = new Set(opts.have ?? []);
  const keep: T[] = [];
  const skipped: string[] = [];
  let baseId = opts.customerId || null;
  let baseName = opts.customerName || null;
  for (const d of docs) {
    const no = d.no || "ใบเสนอราคา";
    if (have.has(d.id)) { skipped.push(`${no} (อยู่ในใบนี้แล้ว)`); continue; }
    if (!baseId && !baseName) { baseId = d.customer_id ?? null; baseName = d.customer_name; }
    const same = baseId && d.customer_id ? baseId === d.customer_id : sameName(baseName, d.customer_name);
    if (!same) { skipped.push(`${no} (ลูกค้าคนอื่น)`); continue; }
    keep.push(d);
  }
  return { keep, skipped };
}
