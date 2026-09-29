/**
 * ลบ "ใบร่าง" ของเอกสารขาย (ของกลางฝั่งเซิร์ฟเวอร์) — ใบเสนอราคา / ใบขาย / ใบวางบิล
 *
 * กติกาเดียวกันทั้ง 3 เอกสาร (ตามแบบใบส่งสินค้า DELETE /api/delivery-notes/[id]):
 *   1. ลบได้เฉพาะสถานะ "ร่าง" — ใบที่ยืนยัน/ส่ง/วางบิลแล้วต้องใช้ "ยกเลิก" (เอกสารมีผลกับลูกค้าแล้ว ต้องเหลือร่องรอย)
 *   2. มีเอกสารอื่นอ้างถึงอยู่ = ลบไม่ได้ (บอกชื่อเอกสารที่อ้างถึง ให้ไปเอาออกก่อน)
 *   3. ก่อนลบเก็บสำเนาทั้งใบ + รายการ ลง audit log (ตามดู/กู้ด้วยมือได้)
 *   4. เลขที่ของใบที่ลบ = ว่าง → ชุดเลขที่เปิด "นำเลขที่ว่างกลับมาใช้" จะให้ใบถัดไปใช้เลขนี้เอง (ระบบเลขสแกนจากตารางจริง)
 *
 * ไม่รวมสิทธิ์ — ผู้เรียก (API route) ต้อง guardApi ก่อน
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

export type SalesDocKind = "quotation" | "sales_order" | "billing_note";

const SPEC: Record<SalesDocKind, { table: string; lines: string; fk: string; numberCol: string; label: string }> = {
  quotation:    { table: "erp_playground_quotations",    lines: "erp_playground_quote_lines",        fk: "quote_id",        numberCol: "quote_number", label: "ใบเสนอราคา" },
  sales_order:  { table: "erp_playground_sales_orders",  lines: "erp_playground_so_lines",           fk: "so_id",           numberCol: "so_number",    label: "ใบขาย" },
  billing_note: { table: "erp_playground_billing_notes", lines: "erp_playground_billing_note_lines", fk: "billing_note_id", numberCol: "bill_number",  label: "ใบวางบิล" },
};

export type DeleteDraftResult =
  | { ok: true; number: string | null }
  | { ok: false; status: number; error: string };

const list = (xs: unknown[]) => [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 5).join(", ");

/** เอกสารอื่นที่ยังอ้างถึงใบนี้อยู่ (ว่าง = ลบได้) */
async function referencesOf(admin: Admin, kind: SalesDocKind, id: string, doc: Row): Promise<string[]> {
  const found: string[] = [];

  // ใบรับชำระที่ตัดยอดใบนี้ (ไม่นับใบรับชำระที่ยกเลิกแล้ว)
  const receiptRefs = async (col: "so_id" | "billing_note_id") => {
    const { data: ls } = await admin.from("customer_receipt_lines").select("receipt_id").eq(col, id).limit(200);
    const ids = [...new Set((ls ?? []).map((l) => String(l.receipt_id)))];
    if (!ids.length) return;
    const { data: rs } = await admin.from("customer_receipts").select("receipt_no, status, is_active").in("id", ids);
    const live = (rs ?? []).filter((r) => r.is_active !== false && r.status !== "cancelled");
    if (live.length) found.push(`ใบรับชำระ ${list(live.map((r) => r.receipt_no))}`);
  };

  if (kind === "quotation") {
    const { data } = await admin.from("so_orders").select("order_no").eq("quote_id", id).limit(5);
    if (data?.length) found.push(`ใบสั่งขาย ${list(data.map((r) => (r as Row).order_no))}`);
  }

  if (kind === "sales_order") {
    if (doc.stock_reserved === true || doc.stock_shipped === true) found.push("มีการจองหรือตัดสต๊อกของใบนี้อยู่");
    await receiptRefs("so_id");
    const [bn, cn, dn, so, store] = await Promise.all([
      admin.from("erp_playground_billing_note_lines").select("billing_note_id").eq("so_id", id).limit(50),
      admin.from("erp_playground_credit_notes").select("cn_number, status").eq("ref_so_id", id).limit(5),
      admin.from("erp_playground_delivery_notes").select("dn_number, status").contains("so_ids", [id]).limit(5),
      admin.from("so_orders").select("order_no").eq("invoice_so_id", id).limit(5),
      admin.from("store_orders").select("id").eq("erp_so_id", id).limit(5),
    ]);
    const bnIds = [...new Set((bn.data ?? []).map((l) => String(l.billing_note_id)))];
    if (bnIds.length) {
      const { data: bns } = await admin.from("erp_playground_billing_notes").select("bill_number, status").in("id", bnIds);
      const live = (bns ?? []).filter((b) => b.status !== "cancelled");
      if (live.length) found.push(`ใบวางบิล ${list(live.map((b) => b.bill_number))}`);
    }
    const liveCn = ((cn.data ?? []) as Row[]).filter((c) => c.status !== "cancelled");
    if (liveCn.length) found.push(`ใบลดหนี้ ${list(liveCn.map((c) => c.cn_number))}`);
    const liveDn = ((dn.data ?? []) as Row[]).filter((d) => d.status !== "cancelled");
    if (liveDn.length) found.push(`ใบส่งสินค้า ${list(liveDn.map((d) => d.dn_number))}`);
    if (so.data?.length) found.push(`ใบสั่งขาย ${list(so.data.map((r) => (r as Row).order_no))}`);
    if (store.data?.length) found.push("ออเดอร์จากเว็บขาย");
  }

  if (kind === "billing_note") await receiptRefs("billing_note_id");

  return found;
}

export async function deleteDraftSalesDoc(
  admin: Admin, kind: SalesDocKind, id: string, actor: { id?: string | null; name?: string | null },
): Promise<DeleteDraftResult> {
  const spec = SPEC[kind];
  const { data: doc, error: getErr } = await admin.from(spec.table).select("*").eq("id", id).maybeSingle();
  if (getErr) return { ok: false, status: 500, error: getErr.message };
  if (!doc) return { ok: false, status: 404, error: `ไม่พบ${spec.label}นี้` };

  const row = doc as Row;
  const number = String(row[spec.numberCol] ?? "").trim() || null;
  const status = String(row.status ?? "");
  if (status !== "draft") {
    return { ok: false, status: 400, error: `ลบได้เฉพาะใบร่าง — ${spec.label}${number ? ` ${number}` : ""} ไม่ใช่ใบร่างแล้ว ให้ใช้ "ยกเลิก" แทน` };
  }

  const refs = await referencesOf(admin, kind, id, row);
  if (refs.length) {
    return { ok: false, status: 400, error: `ลบไม่ได้ เพราะยังมีเอกสารอ้างถึงใบนี้อยู่: ${refs.join(" · ")} — เอาใบนี้ออกจากเอกสารเหล่านั้นก่อน หรือใช้ "ยกเลิก" แทน` };
  }

  const { data: lines } = await admin.from(spec.lines).select("*").eq(spec.fk, id);

  // เก็บประวัติ + สำเนาก่อนลบ (ลบแล้วยังตามดูได้ว่าใบไหน ใครลบ มีอะไรอยู่ในใบ)
  await writeAudit(admin, {
    action: "delete", entityType: spec.table, entityId: id, actorId: actor.id ?? null, actorName: actor.name ?? null,
    metadata: { doc_number: number, status, customer_name: row.customer_name ?? null, grand_total: row.grand_total ?? null, line_count: (lines ?? []).length, snapshot: row, lines: lines ?? [] },
  });

  const { error: delLinesErr } = await admin.from(spec.lines).delete().eq(spec.fk, id);
  if (delLinesErr) return { ok: false, status: 500, error: delLinesErr.message };
  const { error: delErr } = await admin.from(spec.table).delete().eq("id", id);
  if (delErr) return { ok: false, status: 500, error: delErr.message };

  return { ok: true, number };
}
