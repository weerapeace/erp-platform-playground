/**
 * GET /api/partners/[id]/related — รายการที่เชื่อมกับ partner (ตาม FK จริง) · หน้ารายละเอียดคู่ค้า (แบบ B 2026-11-23)
 *   ผู้ขาย: สินค้าที่รับซื้อ (supplier_items + รูป + ซื้อล่าสุด) · ใบสั่งซื้อ (สถานะรับของ/จ่ายเงิน) · บิลจีน · ประวัติราคา
 *   ลูกค้า: ใบเสนอราคา (offer_sheets)
 *   → { is_supplier, is_customer, materials[], purchase_orders[], china_bills[], offer_sheets[], price_history[], kpi, counts }
 *
 * ⚡ perf: ยิงทุก query พร้อมกัน (Promise.all) · บรรทัดใบสั่งซื้อยิงรอบที่ 2 (ต้องรู้เลขใบก่อน) · ร้านใหญ่สุด ~84 ใบ
 * ตรรกะคำนวณ = lib/partner-insights (pure + เทสต์)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { poReceiveState, priceHistoryBySku, priceChangePct, sumByCurrency, todayTH, type PoLineLite, type PoLite } from "@/lib/partner-insights";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAT_CAP = 500;   // สินค้า: ร้านใหญ่สุดหลักร้อย
const PO_CAP = 500;    // ใบสั่งซื้อ: ต้องได้ครบเพื่อคิดยอดปีนี้ (ร้านใหญ่สุด ~84 ใบ)
const DOC_CAP = 50;    // บิลจีน/ใบเสนอราคา: เอาล่าสุดพอ

type SkuEmbed = { id?: string; code?: string | null; name_th?: string | null; cover_image_r2_key?: string | null } | null;
type MatRow = { id: string; item_sku_id: string | null; item_sku: string | null; supplier_sku: string | null;
  price: number | null; currency: string | null; moq: number | null; lead_time_days: number | null; is_default: boolean | null; sku?: SkuEmbed };
type PoRow = PoLite & { payment_status: string | null; paid_date: string | null; payment_due_date: string | null; china_bill_id: string | null; is_active: boolean | null };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: p } = await admin.from("partners_v2").select("id, is_customer, is_supplier").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบ partner" }, { status: 404 });

  const [mats, pos, bills, offers] = await Promise.all([
    p.is_supplier
      ? admin.from("supplier_items")
          .select("id, item_sku_id, item_sku, supplier_sku, price, currency, moq, lead_time_days, is_default, sku:skus_v2!item_sku_id(id, code, name_th, cover_image_r2_key)", { count: "exact" })
          .eq("supplier_partner_id", id).order("is_default", { ascending: false }).limit(MAT_CAP)
      : Promise.resolve({ data: [], count: 0 }),
    p.is_supplier
      ? admin.from("purchase_orders_v2")
          .select("id, po_no, order_date, grand_total, status, currency, payment_status, paid_date, payment_due_date, china_bill_id, is_active")
          .eq("seller_partner_id", id).order("order_date", { ascending: false, nullsFirst: false }).limit(PO_CAP)
      : Promise.resolve({ data: [] }),
    p.is_supplier
      ? admin.from("china_bills").select("id, status, bill_date, transfer_date, amount_rmb, paid_rmb, amount_thb, is_active, created_at", { count: "exact" })
          .eq("supplier_id", id).order("created_at", { ascending: false }).limit(DOC_CAP)
      : Promise.resolve({ data: [], count: 0 }),
    p.is_customer
      ? admin.from("offer_sheets").select("id, title, status, created_at", { count: "exact" })
          .eq("customer_id", id).order("created_at", { ascending: false }).limit(DOC_CAP)
      : Promise.resolve({ data: [], count: 0 }),
  ]);

  const poRows = ((pos.data ?? []) as unknown as PoRow[]).filter((r) => r.is_active !== false);
  // บรรทัดใบสั่งซื้อ → สถานะรับของ + ประวัติราคา
  let lines: (PoLineLite & { is_active?: boolean | null })[] = [];
  if (poRows.length) {
    const { data } = await admin.from("purchase_order_lines_v2")
      .select("po_id, item_sku_id, qty, qty_received, price_est, currency, is_active")
      .in("po_id", poRows.map((r) => r.id)).limit(5000);
    lines = ((data ?? []) as typeof lines).filter((l) => l.is_active !== false);
  }
  const linesByPo = new Map<string, PoLineLite[]>();
  for (const l of lines) { const a = linesByPo.get(l.po_id) ?? []; a.push(l); linesByPo.set(l.po_id, a); }
  const hist = priceHistoryBySku(lines, poRows);

  const matRows = (mats.data ?? []) as unknown as MatRow[];
  const materials = matRows.map((r) => {
    const skuId = r.sku?.id ?? r.item_sku_id ?? null;
    const last = skuId ? hist.get(skuId)?.[0] ?? null : null;
    return {
      id: r.id, sku_id: skuId,
      sku_code: r.sku?.code ?? r.item_sku ?? "—", sku_name: r.sku?.name_th ?? "",
      img: r.sku?.cover_image_r2_key ?? null,
      supplier_sku: r.supplier_sku ?? "",
      price: r.price, currency: r.currency ?? "THB",
      moq: r.moq, lead_time_days: r.lead_time_days, is_default: !!r.is_default,
      last_buy: last ? { date: last.date, price: last.price, currency: last.currency } : null,
    };
  });

  // ประวัติราคา: สินค้าที่เคยสั่งจากร้านนี้ (อาจไม่อยู่ในรายการสินค้าของร้าน) → ดึงรหัส/ชื่อ/รูปเพิ่ม
  const known = new Map(matRows.filter((r) => r.sku?.id).map((r) => [r.sku!.id!, r.sku!]));
  const missing = [...hist.keys()].filter((k) => !known.has(k));
  if (missing.length) {
    const { data } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", missing.slice(0, 500));
    for (const s of (data ?? []) as NonNullable<SkuEmbed>[]) if (s.id) known.set(s.id, s);
  }
  const price_history = [...hist.entries()].map(([skuId, points]) => {
    const s = known.get(skuId);
    return { sku_id: skuId, sku_code: s?.code ?? "—", sku_name: s?.name_th ?? "", img: s?.cover_image_r2_key ?? null,
      points, change_pct: priceChangePct(points) };
  }).sort((a, b) => (b.points[0]?.date ?? "").localeCompare(a.points[0]?.date ?? ""));

  const purchase_orders = poRows.map((r) => {
    const ls = linesByPo.get(r.id) ?? [];
    return { id: r.id, po_no: r.po_no, order_date: r.order_date, grand_total: r.grand_total, status: r.status, currency: r.currency,
      payment_status: r.payment_status, paid_date: r.paid_date, payment_due_date: r.payment_due_date, china_bill_id: r.china_bill_id,
      line_count: ls.length, recv: poReceiveState(ls) };
  });

  const yearStart = `${todayTH().slice(0, 4)}-01-01`;
  const activeBills = ((bills.data ?? []) as { is_active?: boolean | null }[]).filter((b) => b.is_active !== false);

  return NextResponse.json({
    is_supplier: !!p.is_supplier, is_customer: !!p.is_customer,
    materials,
    purchase_orders,
    china_bills: activeBills,
    offer_sheets: offers.data ?? [],
    price_history,
    kpi: {
      year_buy: sumByCurrency(poRows, yearStart),
      last_po: poRows.find((r) => r.status !== "cancelled")?.order_date ?? null,
    },
    counts: {
      materials: mats.count ?? materials.length,
      purchase_orders: purchase_orders.length,
      china_bills: activeBills.length,
      offer_sheets: offers.count ?? (offers.data ?? []).length,
      price_history: price_history.length,
    },
    error: null,
  });
}
