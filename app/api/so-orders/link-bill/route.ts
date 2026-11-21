/**
 * ผูกใบขายที่เพิ่งสร้าง (ป๊อป "สร้าง SO ใหม่" หน้าใบขาย → ปุ่ม "ดึงจากใบสั่งขาย") เข้าใบสั่งผลิตของรายการใบสั่งขาย
 *   POST /api/so-orders/link-bill { sale_id, picks: [{ so_line_id, qty }] }
 *   → mo_sales_links + ปิดงานอัตโนมัติ + ใบสั่งขายส่งครบ = "ส่งแล้ว" (ship-lines.ts linkBillToSoLines)
 *   คืน { mos: [{ mo_no, qty, left, partial }] } — หน้าจอถามต่อว่าชิ้นที่เหลืออยู่ขั้นไหน
 * สิทธิ์: so.create (คนที่สร้างใบขายได้) · กดซ้ำได้ ไม่ผูกซ้ำเกินจำนวนในบรรทัดใบขาย
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { actorOf, linkBillToSoLines, type ShipPick } from "../ship-lines";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.create"); if (denied) return denied;
  const body = await request.json().catch(() => null) as { sale_id?: string; picks?: ShipPick[] } | null;
  const saleId = String(body?.sale_id ?? "");
  const picks = (Array.isArray(body?.picks) ? body!.picks : []).map((p) => ({ so_line_id: String(p.so_line_id ?? ""), qty: Number(p.qty) || 0 })).filter((p) => p.so_line_id && p.qty > 0);
  if (!saleId || !picks.length) return NextResponse.json({ error: "ระบุใบขายและรายการใบสั่งขาย" }, { status: 400 });
  const admin = supabaseAdmin();
  const me = await actorOf(request, admin);
  const r = await linkBillToSoLines(admin, saleId, picks, { id: me.id, name: me.name });
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, mos: r.mos, skipped: r.skipped, orders_shipped: r.orders_shipped });
}
