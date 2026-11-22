/**
 * GET /api/partners/summary — สรุปต่อคู่ค้าสำหรับหน้า Partners (/master/partners)
 *
 * คืน { data: { [partnerId]: PartnerSummaryRow }, money: boolean }
 *   - ทุกคนที่ดูสินค้าได้ (products.view): จำนวนสินค้า · ใบซื้อ/ใบขาย · ซื้อขายล่าสุด · ป้าย "น่าจะเป็นผู้จำหน่าย"
 *   - เฉพาะคนที่ดูการเงินได้ (cashflow.view): ยอดค้าง · ครบกำหนดใกล้สุด · เลยกำหนด (ข้อมูลอ่อนไหว ตัดทิ้งที่ server)
 * ตัวคำนวณ = lib/partner-insights-server (ตัวเดียวกับหน้าจัดการเครดิตเทอม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { loadPartnerStats } from "@/lib/partner-insights-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PartnerSummaryRow = {
  items: number;
  buyCount: number; buyLast: string | null;
  sellCount: number; sellLast: string | null;
  suspectSupplier: boolean;
  /** ยอดค้าง (ฝั่งซื้อ = ต้องจ่าย · ฝั่งขาย = ต้องรับ) — มีเฉพาะผู้มีสิทธิ์ cashflow.view */
  payOpen?: number; recvOpen?: number;
  nextDue?: string | null;
  overdueDocs?: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const money = await apiCan(request, "cashflow.view");
  try {
    const stats = await loadPartnerStats(supabaseAdmin());
    const data: Record<string, PartnerSummaryRow> = {};
    for (const [id, s] of stats) {
      const row: PartnerSummaryRow = {
        items: s.items, buyCount: s.buy.count, buyLast: s.buy.last, sellCount: s.sell.count, sellLast: s.sell.last,
        suspectSupplier: s.suspectSupplier,
      };
      if (money) {
        row.payOpen = s.buy.open.openAmount;
        row.recvOpen = s.sell.open.openAmount;
        const dues = [s.buy.open.nextDue, s.sell.open.nextDue].filter(Boolean) as string[];
        row.nextDue = dues.sort()[0] ?? null;
        row.overdueDocs = s.buy.open.overdueDocs + s.sell.open.overdueDocs;
      }
      data[id] = row;
    }
    return NextResponse.json({ data, money, error: null });
  } catch (e) {
    return NextResponse.json({ data: {}, money, error: e instanceof Error ? e.message : "โหลดสรุปไม่สำเร็จ" }, { status: 500 });
  }
}
