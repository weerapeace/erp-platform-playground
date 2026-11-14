/**
 * POST /api/purchasing/vouchers/<id>/sys-price  { line_id, price }
 *   ★ 2026-11-14 ปุ่มไอคอน "แทนราคาในระบบ" ในตารางใบสำคัญรับ (เจ้าของขอ) — เอาราคาที่แก้ในตารางไปเป็นราคาในระบบทันที
 *   = ราคาต่อร้าน (supplier_items) ของร้านในใบนี้ ผ่านของกลาง upsertSupplierPrice (จดประวัติราคาเดิม→ใหม่ให้เอง) + audit log
 *   ไม่แตะราคาบนสินค้า (rmb_cost/standard_price) — อันนั้นเขียนตอนกดยืนยันใบตามเดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { upsertSupplierPrice } from "@/lib/po-line-price";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  let body: { line_id?: string; price?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const price = Number(body.price);
  if (!body.line_id) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });
  if (!(Number.isFinite(price) && price > 0)) return NextResponse.json({ error: "ใส่ราคาก่อน (ต้องมากกว่า 0)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: v } = await admin.from("purchase_vouchers_v2").select("id, seller_partner_id, seller_name, currency").eq("id", id).maybeSingle();
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  const partnerId = (v as Row).seller_partner_id ? String((v as Row).seller_partner_id) : null;
  if (!partnerId) return NextResponse.json({ error: "ใบนี้ยังไม่ได้ผูกร้าน (คู่ค้า) — ตั้งร้านก่อน ถึงจะบันทึกเป็นราคาต่อร้านได้" }, { status: 400 });
  const { data: line } = await admin.from("purchase_voucher_lines_v2").select("id, item_sku_id, item_name").eq("id", String(body.line_id)).eq("voucher_id", id).maybeSingle();
  if (!line) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const skuId = (line as Row).item_sku_id ? String((line as Row).item_sku_id) : null;
  if (!skuId) return NextResponse.json({ error: "รายการนี้ไม่ได้ผูกสินค้าในคลัง — บันทึกเป็นราคาในระบบไม่ได้" }, { status: 400 });

  const currency = String((v as Row).currency ?? "THB").toUpperCase();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;
  const ok = await upsertSupplierPrice(admin, { skuId, partnerId, price, currency, actorId: user?.id ?? null, actorName });
  if (!ok) return NextResponse.json({ error: "บันทึกราคาในระบบไม่สำเร็จ" }, { status: 500 });
  await writeAudit(admin, { action: "update", entityType: "supplier_items", entityId: skuId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { from: "purchase_voucher", voucher_id: id, line_id: String(body.line_id), item_name: (line as Row).item_name, partner_id: partnerId, price, currency } });
  return NextResponse.json({ ok: true, sys_price: price, sys_price_source: "shop", error: null });
}
