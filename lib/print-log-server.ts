/**
 * 🖨 ประวัติการพิมพ์ — ฝั่งเซิร์ฟเวอร์ (ของกลาง): สรุป "พิมพ์แล้วกี่ครั้ง" ของหลายใบทีเดียว (ป้ายบนบอร์ด)
 *   ชนิด/ป้ายกำกับ = lib/print-log.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrintSummary } from "./print-log";

/** doc_id → { n, last, qty } · ไล่ทีละ 300 ใบขนานกัน (กันลิงก์ยาวเกิน) · พังเงียบ = ไม่มีป้าย (บอร์ดยังเปิดได้) */
export async function printSummaryOf(admin: SupabaseClient, docType: string, ids: string[]): Promise<Map<string, PrintSummary>> {
  const out = new Map<string, PrintSummary>();
  const list = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 300) chunks.push(list.slice(i, i + 300));
  const results = await Promise.all(chunks.map((c) =>
    admin.from("print_logs").select("doc_id, printed_at, qty_at_print").eq("doc_type", docType).in("doc_id", c).order("printed_at", { ascending: false })));
  for (const { data, error } of results) {
    if (error) { console.error("[print-logs] สรุปไม่สำเร็จ:", error.message); continue; }
    for (const r of (data ?? []) as { doc_id: string; printed_at: string; qty_at_print: number | null }[]) {
      const s = out.get(r.doc_id);
      if (s) s.n += 1;   // เรียงล่าสุดก่อน → แถวแรกของแต่ละใบ = ครั้งล่าสุด
      else out.set(r.doc_id, { n: 1, last: r.printed_at, qty: r.qty_at_print == null ? null : Number(r.qty_at_print) });
    }
  }
  return out;
}
