/**
 * POST /api/purchasing/po-line-price — ใส่/แก้ "ราคาต่อหน่วย" ของรายการในใบสั่งซื้อ (ของกลาง)
 *   body: { line_id, price }
 * ทำ 3 อย่างในครั้งเดียว (logic อยู่ที่ lib/po-line-price — ใบสำคัญรับใช้ตัวเดียวกัน):
 *   1. อัปเดตบรรทัด PO (price_est + line_total = qty × price)
 *   2. คำนวณยอดรวมใบใหม่ (grand_total)
 *   3. บันทึกราคาเข้า "ตารางราคาหลายร้าน" กลาง (supplier_items) ของ SKU + ร้านนั้น
 *      → ครั้งหน้าสั่งซื้อร้านเดิมมีราคาให้เลย (จับคู่ร้านจากชื่อบนใบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { applyPoLinePrice } from "@/lib/po-line-price";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { line_id?: string; price?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const lineId = typeof body.line_id === "string" ? body.line_id : null;
  const price = num(body.price);
  if (!lineId) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });
  if (!(price > 0)) return NextResponse.json({ error: "ราคาต้องมากกว่า 0" }, { status: 400 });

  try {
    const r = await applyPoLinePrice(supabaseAdmin(), { lineId, price, actorId: user?.id ?? null, actorName: user?.email ?? null });
    return NextResponse.json({ ok: true, price: r.price, line_total: r.line_total, grand_total: r.grand_total, saved_to_price_list: r.saved_to_price_list, error: null });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    return NextResponse.json({ error: msg }, { status: msg === "ไม่พบรายการนี้" ? 404 : 500 });
  }
}
