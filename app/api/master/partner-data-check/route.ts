/**
 * GET /api/master/partner-data-check — คู่ค้าที่ข้อมูลไม่ครบสำหรับออกเอกสาร
 *
 * ทำไมต้องมี: ใบกำกับภาษี/ใบสั่งซื้อ พิมพ์ ชื่อ · ที่อยู่ · เลขผู้เสียภาษี · เบอร์โทร จากทะเบียนคู่ค้า
 * แต่ข้อมูลจริงกรอกไม่ครบ → เอกสารพิมพ์ออกมาช่องว่าง โดยไม่มีใครรู้จนกว่าจะพิมพ์
 *
 * กติกาอยู่ที่ lib/partner-data-check (ที่เดียวกับหน้า Partners แท็บ "ข้อมูลไม่ครบ")
 * เรียงตาม "จำนวนเอกสารที่เคยออก" มากไปน้อย → กรอกรายที่ใช้งานจริงก่อน คุ้มที่สุด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { checkRow, isIncomplete, sortCheckRows } from "@/lib/partner-data-check";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const t = (v: unknown) => String(v ?? "").trim();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  const admin = supabaseAdmin();
  const [pRes, soRes, poRes] = await Promise.all([
    admin.from("partners_v2")
      .select("id, code, display_name, name_th, name_en, address_line, district, province, tax_id, tax_branch, phone, mobile, is_customer, is_supplier, is_taobao, shop_country, wechat_id, sale_name, is_active")
      .limit(5000),
    admin.from("erp_playground_sales_orders").select("customer_id").limit(20000),
    admin.from("purchase_orders_v2").select("seller_partner_id").limit(20000),
  ]);

  if (pRes.error) return NextResponse.json({ data: [], error: pRes.error.message }, { status: 500 });
  // นับเอกสารไม่ได้ = เรียงผิด/การ์ดนับผิด → บอกตรง ๆ ดีกว่าโชว์ตัวเลขเพี้ยน
  if (soRes.error || poRes.error) return NextResponse.json({ data: [], error: "นับเอกสารของคู่ค้าไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 503 });

  const soBy = new Map<string, number>();
  for (const r of ((soRes.data ?? []) as Record<string, unknown>[])) {
    const k = t(r.customer_id); if (k) soBy.set(k, (soBy.get(k) ?? 0) + 1);
  }
  const poBy = new Map<string, number>();
  for (const r of ((poRes.data ?? []) as Record<string, unknown>[])) {
    const k = t(r.seller_partner_id); if (k) poBy.set(k, (poBy.get(k) ?? 0) + 1);
  }

  const rows = ((pRes.data ?? []) as Record<string, unknown>[])
    .filter((p) => p.is_active !== false)
    .map((p) => checkRow(p, soBy.get(t(p.id)) ?? 0, poBy.get(t(p.id)) ?? 0))
    .filter(isIncomplete);

  return NextResponse.json({ data: sortCheckRows(rows), error: null });
}
