/**
 * GET /api/partners/[id]/related — รายการที่เชื่อมกับ partner (ตาม FK จริง)
 *   ผู้ขาย: วัตถุดิบที่รับซื้อ (supplier_items + ราคา) · ใบสั่งซื้อ PO (purchase_orders_v2) · บิลจีน (china_bills)
 *   ลูกค้า: ใบเสนอราคา (offer_sheets)
 *   → { is_supplier, is_customer, materials[], purchase_orders[], china_bills[], offer_sheets[], counts }
 *
 * ⚡ perf: ยิงทุก query "พร้อมกัน" (Promise.all) + embed รหัส SKU มาในคำสั่งเดียว (ไม่ยิงซ้ำ)
 *    เดิมยิงเรียงทีละอัน 7 รอบ → Supabase อยู่โตเกียว รวม ~1–2 วิ · ตอนนี้ ≈ คำสั่งเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAT_CAP = 500;   // วัตถุดิบ: ดึงมาให้ตารางแบ่งหน้าฝั่งหน้าเว็บ (ร้านใหญ่สุดหลักร้อย)
const DOC_CAP = 50;    // เอกสาร (PO/บิล/ใบเสนอ): เอาล่าสุดพอ

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: p } = await admin.from("partners_v2").select("id, is_customer, is_supplier").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบ partner" }, { status: 404 });

  // ยิงทุกอย่างพร้อมกัน (เฉพาะฝั่งที่เกี่ยว) — วัตถุดิบ embed รหัส/ชื่อ SKU มาเลย
  const [mats, pos, bills, offers] = await Promise.all([
    p.is_supplier
      ? admin.from("supplier_items")
          .select("id, item_sku_id, item_sku, supplier_sku, price, currency, moq, lead_time_days, is_default, sku:skus_v2!item_sku_id(id, code, name_th)", { count: "exact" })
          .eq("supplier_partner_id", id).order("is_default", { ascending: false }).limit(MAT_CAP)
      : Promise.resolve({ data: [], count: 0 }),
    p.is_supplier
      ? admin.from("purchase_orders_v2").select("id, po_no, order_date, grand_total, status", { count: "exact" })
          .eq("seller_partner_id", id).order("order_date", { ascending: false, nullsFirst: false }).limit(DOC_CAP)
      : Promise.resolve({ data: [], count: 0 }),
    p.is_supplier
      ? admin.from("china_bills").select("id, status, created_at", { count: "exact" })
          .eq("supplier_id", id).order("created_at", { ascending: false }).limit(DOC_CAP)
      : Promise.resolve({ data: [], count: 0 }),
    p.is_customer
      ? admin.from("offer_sheets").select("id, title, status, created_at", { count: "exact" })
          .eq("customer_id", id).order("created_at", { ascending: false }).limit(DOC_CAP)
      : Promise.resolve({ data: [], count: 0 }),
  ]);

  type SkuEmbed = { id?: string; code?: string | null; name_th?: string | null } | null;
  type MatRow = { id: string; item_sku_id: string | null; item_sku: string | null; supplier_sku: string | null;
    price: number | null; currency: string | null; moq: number | null; lead_time_days: number | null; is_default: boolean | null; sku?: SkuEmbed };

  const materials = ((mats.data ?? []) as unknown as MatRow[]).map((r) => ({
    id: r.id,
    sku_id: r.sku?.id ?? r.item_sku_id ?? null,
    sku_code: r.sku?.code ?? r.item_sku ?? "—",
    sku_name: r.sku?.name_th ?? "",
    supplier_sku: r.supplier_sku ?? "",
    price: r.price, currency: r.currency ?? "THB",
    moq: r.moq, lead_time_days: r.lead_time_days, is_default: !!r.is_default,
  }));

  return NextResponse.json({
    is_supplier: !!p.is_supplier, is_customer: !!p.is_customer,
    materials,
    purchase_orders: pos.data ?? [],
    china_bills: bills.data ?? [],
    offer_sheets: offers.data ?? [],
    counts: {
      materials: mats.count ?? materials.length,
      purchase_orders: pos.count ?? (pos.data ?? []).length,
      china_bills: bills.count ?? (bills.data ?? []).length,
      offer_sheets: offers.count ?? (offers.data ?? []).length,
    },
    error: null,
  });
}
