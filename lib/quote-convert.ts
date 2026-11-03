/**
 * กติกากลาง "ดึงใบเสนอราคาเข้าใบสั่งขาย" (so_orders) — ที่เดียวที่ตัดสินว่าใบไหนดึงได้ และสถานะใบเสนอราคาต้องเป็นอะไร
 *
 *   • ดึงได้เฉพาะใบ "ส่งแล้ว" / "ตอบรับแล้ว" ที่ยังไม่ถูกแปลงเป็นใบขาย และยังไม่อยู่ในใบสั่งขายอื่นที่ยังไม่ยกเลิก
 *   • ลูกค้าต้องตรงกับใบสั่งขาย
 *   • 1 ใบสั่งขายรวมได้หลายใบเสนอราคา — จำต่อบรรทัด so_order_lines.quote_id / quote_no (เจ้าของเลือก 2026-11-03)
 *   • บันทึกใบสั่งขาย → ใบเสนอราคาที่ถูกใช้เป็น "แปลงแล้ว"
 *     ยกเลิก/ลบใบสั่งขาย หรือลบบรรทัดของใบนั้นออกหมด → กลับเป็น "ตอบรับแล้ว" ดึงใหม่ได้
 *
 * ไม่แตะ: สถานะปกติ (ส่ง/ตอบรับ/ปฏิเสธ/ยกเลิก) = ตาราง erp_workflow_transitions + RPC erp_playground_quote_transition
 *         แปลงเป็นใบขายตรง ๆ = RPC erp_playground_quote_to_so (เขียน converted_so_id — ไฟล์นี้อ่านอย่างเดียว)
 * ใช้ที่: /api/so-orders (สร้าง) · /api/so-orders/[id] (บันทึก/ยกเลิก/เปิดกลับ/ลบ) · /api/so-orders/sources (รายการที่ดึงได้)
 * ส่วนที่ไม่แตะฐานข้อมูล (ตัดสินรายใบ · หน้าจอเลือกหลายใบ) = lib/quote-pull.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditMany } from "@/lib/audit";
import { QUOTE_PULLABLE_STATUSES, quotePullBlock, type QuoteForPull } from "@/lib/quote-pull";

export { QUOTE_PULLABLE_STATUSES } from "@/lib/quote-pull";

type Admin = ReturnType<typeof supabaseAdmin>;

const uniq = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))];

/** ใบเสนอราคาที่อยู่ในใบสั่งขาย "ที่ยังไม่ยกเลิก" → Map quote_id → เลขใบสั่งขาย (ไม่นับใบ exceptOrderId) */
export async function quotesInOpenOrders(admin: Admin, quoteIds: string[], exceptOrderId?: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = uniq(quoteIds);
  if (!ids.length) return out;
  const { data: ls } = await admin.from("so_order_lines").select("quote_id, order_id").in("quote_id", ids);
  const lines = ((ls ?? []) as { quote_id: string; order_id: string }[]).filter((l) => l.order_id !== exceptOrderId);
  const orderIds = uniq(lines.map((l) => l.order_id));
  if (!orderIds.length) return out;
  const { data: os } = await admin.from("so_orders").select("id, order_no, status").in("id", orderIds);
  // กรองใน JS (ไม่ใช้ .neq ที่ตัดแถว status ว่างทิ้ง)
  const open = new Map(((os ?? []) as { id: string; order_no: string | null; status: string | null }[])
    .filter((o) => o.status !== "cancelled").map((o) => [o.id, o.order_no ?? "—"]));
  for (const l of lines) if (open.has(l.order_id) && !out.has(l.quote_id)) out.set(l.quote_id, open.get(l.order_id)!);
  return out;
}

async function loadQuotes(admin: Admin, ids: string[]): Promise<QuoteForPull[]> {
  if (!ids.length) return [];
  const { data } = await admin.from("erp_playground_quotations")
    .select("id, quote_number, status, converted_so_id, customer_id, accepted_at").in("id", ids);
  return (data ?? []) as QuoteForPull[];
}

/** ปัญหาของแต่ละใบ (quote_id → ข้อความ) — ใบที่ไม่อยู่ใน Map = ดึงได้ */
export async function quotePullProblems(admin: Admin, quoteIds: string[], opts: { orderId?: string | null; customerId?: string | null } = {}): Promise<Map<string, string>> {
  const ids = uniq(quoteIds);
  const problems = new Map<string, string>();
  if (!ids.length) return problems;
  const [quotes, elsewhere, mineRows] = await Promise.all([
    loadQuotes(admin, ids),
    quotesInOpenOrders(admin, ids, opts.orderId ?? null),
    opts.orderId ? admin.from("so_order_lines").select("quote_id").eq("order_id", opts.orderId).in("quote_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const mine = new Set(((mineRows.data ?? []) as { quote_id: string }[]).map((r) => r.quote_id));
  const byId = new Map(quotes.map((q) => [q.id, q]));
  for (const id of ids) {
    const q = byId.get(id);
    const why = q ? quotePullBlock(q, { linkedOrderNo: elsewhere.get(id) ?? null, mine: mine.has(id), customerId: opts.customerId }) : "ไม่พบใบเสนอราคาที่ดึงมา (อาจถูกลบไปแล้ว)";
    if (why) problems.set(id, why);
  }
  return problems;
}

/** ตรวจก่อนบันทึกใบสั่งขาย — คืนข้อความผิดพลาดรวม (null = ผ่าน) */
export async function checkQuotePull(admin: Admin, quoteIds: string[], opts: { orderId?: string | null; customerId?: string | null } = {}): Promise<string | null> {
  const p = await quotePullProblems(admin, quoteIds, opts);
  return p.size ? [...p.values()].join(" · ") : null;
}

/**
 * ทำให้สถานะใบเสนอราคาตรงกับความจริง หลังสร้าง/บันทึก/ยกเลิก/เปิดกลับ/ลบใบสั่งขาย — เรียกซ้ำได้ ผลเหมือนเดิม
 *   อยู่ในใบสั่งขายที่ยังไม่ยกเลิก + ส่งแล้ว/ตอบรับแล้ว → "แปลงแล้ว"
 *   ไม่อยู่ในใบไหนแล้ว + "แปลงแล้ว" ที่ไม่ได้มาจากการแปลงเป็นใบขาย → กลับ "ตอบรับแล้ว"
 */
export async function syncQuoteConversions(admin: Admin, quoteIds: string[], actor: { actorId: string | null; actorName: string | null }): Promise<{ converted: string[]; released: string[] }> {
  const ids = uniq(quoteIds);
  const res = { converted: [] as string[], released: [] as string[] };
  if (!ids.length) return res;
  const [quotes, linked] = await Promise.all([loadQuotes(admin, ids), quotesInOpenOrders(admin, ids)]);
  const now = new Date().toISOString();
  const audits: Parameters<typeof writeAuditMany>[1] = [];
  for (const q of quotes) {
    const orderNo = linked.get(q.id);
    if (orderNo && (QUOTE_PULLABLE_STATUSES as readonly string[]).includes(q.status ?? "") && !q.converted_so_id) {
      const { error } = await admin.from("erp_playground_quotations")
        .update({ status: "converted", converted_at: now, accepted_at: q.accepted_at ?? now, updated_at: now }).eq("id", q.id);
      if (error) { console.error("[quote-convert] convert", q.id, error.message); continue; }
      res.converted.push(q.quote_number ?? q.id);
      audits.push({ action: "convert_to_so_order", entityType: "erp_playground_quote", entityId: q.id, ...actor, metadata: { quote_number: q.quote_number, from: q.status, to: "converted", order_no: orderNo } });
    } else if (!orderNo && q.status === "converted" && !q.converted_so_id) {
      const { error } = await admin.from("erp_playground_quotations")
        .update({ status: "accepted", converted_at: null, updated_at: now }).eq("id", q.id);
      if (error) { console.error("[quote-convert] release", q.id, error.message); continue; }
      res.released.push(q.quote_number ?? q.id);
      audits.push({ action: "release_from_so_order", entityType: "erp_playground_quote", entityId: q.id, ...actor, metadata: { quote_number: q.quote_number, from: "converted", to: "accepted" } });
    }
  }
  if (audits.length) await writeAuditMany(admin, audits);
  return res;
}

/** quote_id ของบรรทัดในใบสั่งขายใบนี้ (ไว้ส่งต่อให้ sync หลังยกเลิก/ลบ) */
export async function orderQuoteIds(admin: Admin, orderId: string): Promise<string[]> {
  const { data } = await admin.from("so_order_lines").select("quote_id").eq("order_id", orderId).not("quote_id", "is", null);
  return uniq(((data ?? []) as { quote_id: string | null }[]).map((r) => r.quote_id));
}
