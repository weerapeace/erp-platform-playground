/**
 * ของกลาง — หา "ใบลดหนี้" ที่ผูกกับใบกำกับภาษี/ใบขาย เพื่อเอาไปหักในเอกสารอื่น
 *
 * ใช้ที่ใบวางบิล (หักยอดที่ต้องเก็บจากลูกค้า) และเอาไปใช้ต่อกับรายงาน/แดชบอร์ดได้
 *
 * การจับคู่ทำ 2 ทาง เพราะใบลดหนี้อ้างอิงได้ทั้ง 2 แบบ:
 *   1) `ref_so_id`      — กดดึงจากใบกำกับในระบบ
 *   2) `ref_invoice_no` — พิมพ์เลขใบกำกับเอง (ใบที่ออกนอกระบบ) → เทียบกับ tax_invoice_no / so_number
 *
 * นับเฉพาะใบที่ **ออกเอกสารแล้ว (issued)** — ใบร่างและใบที่ยกเลิกไม่หักยอด
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export type LinkedCreditNote = {
  id: string;
  cn_number: string | null;
  cn_date: string | null;
  ref_invoice_no: string | null;
  reason: string | null;
  diff_amount: number;    // ยอดลดก่อน VAT
  vat_amount: number;
  grand_total: number;    // ยอดที่หักได้จริง (รวม VAT)
  so_id: string | null;   // ใบขาย/ใบกำกับที่หักออก
};

/** คืน map: so_id → ใบลดหนี้ที่หักจากใบนั้น (เฉพาะที่ออกเอกสารแล้ว) */
export async function creditNotesForSoIds(client: Client, soIds: string[]): Promise<Map<string, LinkedCreditNote[]>> {
  const result = new Map<string, LinkedCreditNote[]>();
  const ids = [...new Set(soIds.filter(Boolean))];
  if (ids.length === 0) return result;

  // เลขใบกำกับของใบขายเหล่านี้ (ไว้จับคู่กับใบลดหนี้ที่พิมพ์เลขเอง)
  const numberToSo = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await client.from("erp_playground_sales_orders")
      .select("id, so_number, tax_invoice_no").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      for (const key of [r.tax_invoice_no, r.so_number]) {
        const k = String(key ?? "").trim();
        if (k) numberToSo.set(k, String(r.id));
      }
    }
  }

  const seen = new Set<string>();
  const push = (row: Record<string, unknown>) => {
    const id = String(row.id);
    if (seen.has(id)) return;
    const refSo = String(row.ref_so_id ?? "").trim();
    const byNumber = numberToSo.get(String(row.ref_invoice_no ?? "").trim());
    const soId = (refSo && ids.includes(refSo)) ? refSo : byNumber ?? null;
    if (!soId) return;
    seen.add(id);
    const list = result.get(soId) ?? [];
    list.push({
      id,
      cn_number: (row.cn_number as string) ?? null,
      cn_date: (row.cn_date as string) ?? null,
      ref_invoice_no: (row.ref_invoice_no as string) ?? null,
      reason: (row.reason as string) ?? null,
      diff_amount: num(row.diff_amount),
      vat_amount: num(row.vat_amount),
      grand_total: num(row.grand_total),
      so_id: soId,
    });
    result.set(soId, list);
  };

  // 1) ผูกด้วย ref_so_id
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await client.from("erp_playground_credit_notes")
      .select("*").eq("status", "issued").in("ref_so_id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Record<string, unknown>[]) push(r);
  }

  // 2) ผูกด้วยเลขใบกำกับที่พิมพ์เอง
  const numbers = [...numberToSo.keys()];
  for (let i = 0; i < numbers.length; i += 200) {
    const { data } = await client.from("erp_playground_credit_notes")
      .select("*").eq("status", "issued").in("ref_invoice_no", numbers.slice(i, i + 200));
    for (const r of (data ?? []) as Record<string, unknown>[]) push(r);
  }

  return result;
}

/** รวมยอดหักทั้งหมด (รวม VAT แล้ว) */
export const sumCredit = (list: LinkedCreditNote[]) =>
  Math.round(list.reduce((s, c) => s + c.grand_total, 0) * 100) / 100;
