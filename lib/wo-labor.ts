/**
 * ค่าแรงรวมของใบจ่ายงาน (mo_work_orders.labor_cost) — ของกลาง
 *
 * ความหมาย: labor_cost = ค่าแรงรวมของ "ทั้งใบ" → ราคาต่อชิ้น = labor_cost / qty (ดู /api/mo/[id]/status)
 * ปัญหาเดิม: ส่งงานแต่ละครั้งเขียน labor_cost = ค่าแรงของ "รอบนั้น" ทับ → ส่งคืนหลายรอบ ค่าแรงรวมเหลือแค่รอบสุดท้าย
 * ตอนนี้: ค่าแรงที่ลงแล้วทุกรอบ + ส่วนที่ยังไม่ลง/ยังไม่ส่ง คิดราคาต่อชิ้นของรอบล่าสุดที่มีค่าแรง
 *   ส่งครบรอบเดียว = เท่าค่าแรงรอบนั้นเหมือนเดิม · ส่ง 10+10 จาก 20 ที่ ฿50 = ฿1,000 (ไม่ใช่ ฿500)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export type WoSubLite = { qty: number; wage: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** ค่าแรงรวมของใบจากรายการส่งงาน (เรียงเก่า → ใหม่) · null = ยังไม่มีรอบไหนลงค่าแรง (อย่าแตะค่าเดิมของใบ) */
export function woLaborTotal(woQty: number, subs: WoSubLite[]): number | null {
  const paid = subs.filter((s) => s.wage != null && s.qty > 0);
  if (!paid.length) return null;
  const last = paid[paid.length - 1];
  const rate = (last.wage as number) / last.qty;
  const paidQty = paid.reduce((a, s) => a + s.qty, 0);
  const paidSum = paid.reduce((a, s) => a + (s.wage as number), 0);
  return r2(paidSum + rate * Math.max(0, woQty - paidQty));
}

/** คำนวณใหม่จากรายการส่งงานจริง แล้วเขียนลงใบจ่ายงาน — ไม่มีรอบไหนลงค่าแรง = ไม่แตะ */
export async function syncWoLabor(admin: Admin, woId: string): Promise<void> {
  const [{ data: wo }, { data: subs }] = await Promise.all([
    admin.from("mo_work_orders").select("qty").eq("id", woId).maybeSingle(),
    admin.from("wo_submissions").select("qty, wage, created_at").eq("wo_id", woId).order("created_at"),
  ]);
  if (!wo) return;
  const total = woLaborTotal(Number((wo as { qty: unknown }).qty) || 0,
    ((subs ?? []) as { qty: unknown; wage: unknown }[]).map((s) => ({ qty: Number(s.qty) || 0, wage: s.wage == null ? null : Number(s.wage) })));
  if (total != null) await admin.from("mo_work_orders").update({ labor_cost: total }).eq("id", woId);
}
