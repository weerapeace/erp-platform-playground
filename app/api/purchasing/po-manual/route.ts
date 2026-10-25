/**
 * POST /api/purchasing/po-manual — "เปิด PO เอง" (ไม่ต้องผ่านใบขอซื้อ)
 *
 * ใช้เมื่อ: ซัพพลายเออร์ขอใบ PO / ของที่ไม่ได้ผ่านตะกร้าขอซื้อ / สั่งด่วน
 * ต่างจาก /api/purchasing/create-po ตรงที่ตัวนั้นสร้างจาก PR ที่อนุมัติแล้วเท่านั้น
 *
 * body: {
 *   seller_name: string, seller_partner_id?: string|null, currency?: string,
 *   order_date?: string, expected_date?: string|null, note?: string,
 *   lines: [{ item_sku_id?: string|null, item_name: string, qty: number, uom?: string|null, price?: number, note?: string }]
 * }
 *
 * ตัวสร้างจริงอยู่ที่ของกลาง lib/po-manual (ใช้ร่วมกับ "คำสั่งซื้อจากไลน์" ที่เปิด PO ใหม่จากรูปคำสั่งซื้อ)
 * ตารางเดียวกับ PO ปกติ (purchase_orders_v2 + purchase_order_lines_v2) → ไหลเข้าหน้ารับของ/ปฏิทิน/แดชบอร์ดได้เลย
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { createManualPo, type ManualPoInput } from "@/lib/po-manual";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = ManualPoInput & { actor?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const actor = String(body.actor ?? "").trim() || user.email || "system";
  const res = await createManualPo(supabaseAdmin(), body, { id: user.id, name: actor });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ id: res.id, po_no: res.po_no, line_count: res.line_count, grand_total: res.grand_total, error: null });
}
