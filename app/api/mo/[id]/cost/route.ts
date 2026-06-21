/**
 * ต้นทุน/กำไรต่อใบสั่งผลิต — /api/mo/<id>/cost
 * รวมข้อมูลคิดต้นทุน: ราคาขาย(list_price) · ต้นทุนวัตถุดิบ(Σ qty_per × standard_price)
 *   · ค่าแรงกลาง(เพดาน จาก bom_labor_rates) · ค่าแรงผลิตที่ตั้งจริง(est_labor_cost)
 * (งานเหมา ฝั่งหน้าใช้ /api/mo/piecework ที่โหลดอยู่แล้ว — ไม่ดึงซ้ำที่นี่)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export type MoCostMaterial = { sku: string | null; name: string | null; material_type: string | null; uom: string | null; qty_per: number; unit_cost: number; line_pp: number; has_price: boolean };
export type MoCost = {
  product_sku: string | null; product_name: string | null; qty: number;
  sell_price: number;                 // ราคาขาย/ชิ้น (list_price)
  material_cost_pp: number;           // ต้นทุนวัตถุดิบ/ชิ้น
  materials: MoCostMaterial[]; missing_price: number;
  central_rate: number;               // ค่าแรงกลาง/ชิ้น (เพดานห้ามเกิน)
  est_labor_total: number; est_labor_pp: number;   // ค่าแรงผลิตที่ตั้งจริง (รวม/ต่อชิ้น)
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: mo } = await admin.from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, bom_code, est_labor_cost").eq("id", id).maybeSingle();
  if (!mo) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });
  const m = mo as Record<string, unknown>;
  const qty = num(m.qty);

  const { data: mats } = await admin.from("mo_material_summary")
    .select("component_sku, component_name, material_type, uom, qty_per").eq("mo_no", String(m.mo_no)).eq("is_active", true).order("sequence", { ascending: true });
  const matRows = (mats ?? []) as Record<string, unknown>[];

  // ราคา: standard_price(ต้นทุนวัตถุดิบ) + list_price(ราคาขายสินค้า) จาก skus_v2
  const codes = new Set<string>(); if (m.product_sku) codes.add(String(m.product_sku));
  for (const x of matRows) if (x.component_sku) codes.add(String(x.component_sku));
  const priceMap = new Map<string, { std: number; list: number }>();
  if (codes.size) {
    const { data: skus } = await admin.from("skus_v2").select("code, standard_price, list_price").in("code", [...codes]);
    for (const s of (skus ?? []) as Record<string, unknown>[]) priceMap.set(String(s.code), { std: num(s.standard_price), list: num(s.list_price) });
  }

  const sell_price = priceMap.get(String(m.product_sku))?.list ?? 0;
  let material_cost_pp = 0, missing_price = 0;
  const materials: MoCostMaterial[] = matRows.map((x) => {
    const sku = (x.component_sku as string) ?? null; const qp = num(x.qty_per);
    const unit = sku ? (priceMap.get(sku)?.std ?? 0) : 0; const line = r4(unit * qp);
    const has = unit > 0; if (!has) missing_price += 1; material_cost_pp += line;
    return { sku, name: (x.component_name as string) ?? null, material_type: (x.material_type as string) ?? null, uom: (x.uom as string) ?? null, qty_per: qp, unit_cost: unit, line_pp: line, has_price: has };
  });
  material_cost_pp = r4(material_cost_pp);

  const { data: lr } = await admin.from("bom_labor_rates").select("rate")
    .eq("bom_code", (m.bom_code as string) ?? "").is("craftsman_id", null).eq("is_current", true).eq("is_active", true).maybeSingle();
  const central_rate = num((lr as { rate?: number } | null)?.rate);
  const est_labor_total = num(m.est_labor_cost);
  const est_labor_pp = qty > 0 ? r4(est_labor_total / qty) : 0;

  const data: MoCost = {
    product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null, qty,
    sell_price, material_cost_pp, materials, missing_price, central_rate, est_labor_total, est_labor_pp,
  };
  return NextResponse.json({ data, error: null });
}
