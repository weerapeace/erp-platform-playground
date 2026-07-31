/**
 * GET /api/purchasing/po-detail?id=<po_id> — รายละเอียดใบสั่งซื้อ 1 ใบ (หัวใบ + รายการสินค้า + รูป)
 * ใช้ใน popup ของแดชบอร์ดจัดซื้อ (กดแถวในรายการ จ่ายแล้ว / รอจ่าย)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export type PoDetailLine = {
  name: string; qty: number; received: number; uom: string | null;
  price: number; total: number; img: string | null; done: boolean;
  /** รหัสสินค้า — ใช้บนใบพิมพ์ที่แขวนไว้ที่โต๊ะรับของ */
  sku: string | null;
};
export type PoDetail = {
  id: string; po_no: string; seller: string | null; order_date: string | null;
  currency: string | null; amount_thb: number;
  payment_status: string | null; paid_date: string | null; paid_amount_thb: number | null;
  payment_due_date: string | null; expected_date: string | null;
  lines: PoDetailLine[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const rateRes = await admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rmb = num((rateRes.data as { rate?: number } | null)?.rate) || 5;

  const { data: po, error } = await admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, order_date, grand_total, currency, payment_status, paid_date, paid_amount_thb, payment_due_date, expected_date")
    .eq("id", id).single();
  if (error || !po) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });

  const { data: ls } = await admin.from("purchase_order_lines_v2")
    .select("item_sku_id, item_name, qty, qty_received, uom, price_est, line_total, sort_order, line_status, is_active")
    .eq("po_id", id).order("sort_order", { ascending: true });
  const rows = ((ls ?? []) as Record<string, unknown>[]).filter((l) => l.is_active !== false);

  const skuIds = [...new Set(rows.map((l) => l.item_sku_id).filter(Boolean) as string[])];
  const coverMap = new Map<string, string | null>();
  const uomBySku = new Map<string, string | null>();
  const codeBySku = new Map<string, string | null>();
  if (skuIds.length) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, cover_image_r2_key, uom_id").in("id", skuIds);
    const uomIds = [...new Set(((sk ?? []) as Record<string, unknown>[]).map((s) => s.uom_id).filter(Boolean) as string[])];
    const uomName = new Map<string, string>();
    if (uomIds.length) {
      const { data: us } = await admin.from("uoms").select("id, name").in("id", uomIds);
      for (const u of (us ?? []) as Record<string, unknown>[]) uomName.set(String(u.id), String(u.name ?? ""));
    }
    for (const s of (sk ?? []) as Record<string, unknown>[]) {
      coverMap.set(String(s.id), (s.cover_image_r2_key as string) ?? null);
      uomBySku.set(String(s.id), s.uom_id ? (uomName.get(String(s.uom_id)) ?? null) : null);
      codeBySku.set(String(s.id), (s.code as string) ?? null);
    }
  }

  const p = po as Record<string, unknown>;
  const detail: PoDetail = {
    id: String(p.id), po_no: String(p.po_no ?? "—"), seller: (p.seller_name as string) ?? null,
    order_date: (p.order_date as string) ?? null, currency: (p.currency as string) ?? null,
    amount_thb: Math.round(num(p.grand_total) * (isCNY(p.currency) ? rmb : 1)),
    payment_status: (p.payment_status as string) ?? null,
    paid_date: (p.paid_date as string) ?? null,
    paid_amount_thb: p.paid_amount_thb == null ? null : num(p.paid_amount_thb),
    payment_due_date: (p.payment_due_date as string) ?? null,
    expected_date: (p.expected_date as string) ?? null,
    lines: rows.map((l) => {
      const sid = l.item_sku_id ? String(l.item_sku_id) : null;
      const key = sid ? coverMap.get(sid) : null;
      const st = String(l.line_status ?? "");
      const remain = Math.max(0, num(l.qty) - num(l.qty_received));
      return {
        name: String(l.item_name ?? ""), qty: num(l.qty), received: num(l.qty_received),
        uom: (l.uom as string) || (sid ? (uomBySku.get(sid) ?? null) : null),
        price: num(l.price_est), total: num(l.line_total),
        img: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
        done: st === "received" || st === "short_closed" || st === "closed_short" || remain === 0,
        sku: sid ? (codeBySku.get(sid) ?? null) : null,
      };
    }),
  };
  return NextResponse.json({ data: detail, error: null });
}
