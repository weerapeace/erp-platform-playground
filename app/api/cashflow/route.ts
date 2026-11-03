/**
 * GET /api/cashflow — รวมเงินเข้า-เงินออกทั้งบริษัทจาก 5 แหล่ง แล้วคืนเป็น "รายการเงิน" หน้าตาเดียวกัน
 *
 * แหล่งข้อมูล (อ่านอย่างเดียว ไม่แก้ของเดิม):
 *   เงินเข้า  ← erp_playground_sales_orders (ใบขายยืนยันแล้ว) · erp_playground_billing_notes (ใบวางบิล)
 *   เงินออก  ← purchase_orders_v2 (ใบซื้อค้างจ่าย) · payment_batches (เงินเดือน)
 *              loan_installments (งวดผ่อน) · od_facilities (ดอกเบี้ย OD) · china_bills (โอนเงินจีน)
 *
 * เรื่องที่ต้องระวัง (เจอจากข้อมูลจริง):
 *   - ใบซื้อ 77/143 ใบเป็นเงินหยวน (currency = RMB หรือ YUAN — สะกด 2 แบบ แปลว่าอย่างเดียวกัน)
 *     และตาราง purchase_orders_v2 ไม่มีช่องอัตราแลกเปลี่ยน → ต้องคูณเรตเอง ไม่งั้นยอดจ่ายหายไปเกินครึ่ง
 *   - เครดิตลูกค้า/ร้านค้าแทบไม่มีใครตั้ง → ต้องเดาวันด้วยค่าเริ่มต้น และบอกผู้ใช้ว่าเดา (dateConfident = false)
 *   - ใบขายทุกใบ amount_due = ยอดเต็ม เพราะระบบยังไม่มีที่บันทึก "ลูกค้าจ่ายมาแล้ว" → เงินเข้าเป็นประมาณการ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { addDaysISO, todayISO } from "@/lib/cashflow";
import { loadCashflow } from "@/lib/cashflow-server";

// ตัวคิดย้ายไป lib/cashflow-server.ts (ใช้ร่วมกับ cron เตือนเงินจะขาด) — ชนิดข้อมูลยัง import จากไฟล์นี้ได้เหมือนเดิม
export type { CashflowWarning, CashflowMeta, CashflowApiData } from "@/lib/cashflow-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const today = todayISO();
  const from = sp.get("from") || today;
  const to = sp.get("to") || addDaysISO(today, 90);
  /** เงินเข้านับจากอะไร: so = ใบขายยืนยันแล้ว · billing = ใบวางบิล · both = ทั้งสอง (ตัดใบขายที่วางบิลแล้วออก ไม่ให้ซ้ำ) */
  const incomeBasis = (sp.get("incomeBasis") || "both") as "so" | "billing" | "both";
  const customerDefaultDays = Math.max(0, Number(sp.get("customerDays") ?? 30) || 0);
  const supplierDefaultDays = Math.max(0, Number(sp.get("supplierDays") ?? 30) || 0);
  const rmbRateParam = Number(sp.get("rmbRate") ?? 0);


  const data = await loadCashflow(supabaseAdmin(), { from, to, incomeBasis, customerDefaultDays, supplierDefaultDays, rmbRateParam });
  return NextResponse.json({ data, error: null });
}
