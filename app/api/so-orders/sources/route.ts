/**
 * "ดึงรายการเข้าใบสั่งขาย" — /api/so-orders/sources
 *   GET ?type=quote&search=  → ใบเสนอราคา (พร้อมบรรทัด) ที่ยังไม่ถูกแปลง
 *   GET ?type=mo&search=     → ใบสั่งผลิตที่ยังไม่ผูกใบสั่งขาย (เอาไปตั้งเป็นบรรทัดได้เลย)
 * สิทธิ์: so.view (เป็นการอ่านเพื่อมาตั้งใบสั่งขาย)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SourceLine = {
  sku: string | null; product_name: string; qty: number; unit: string;
  unit_price: number; due_date: string | null; mo_id: string | null; mo_no: string | null;
};
export type SourceDoc = {
  kind: "quote" | "mo";
  id: string; no: string | null; date: string | null;
  customer_name: string | null; title: string; amount: number;
  lines: SourceLine[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "quote").trim();
  const search = (searchParams.get("search") ?? "").trim();
  const admin = supabaseAdmin();

  // ── ใบเสนอราคา ────────────────────────────────────────
  if (type === "quote") {
    let q = admin.from("erp_playground_quotations")
      .select("id, quote_number, quote_date, customer_name, grand_total, status, converted_so_id")
      .neq("status", "cancelled").order("quote_date", { ascending: false }).limit(100);
    if (search) q = q.or(`quote_number.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

    const ids = (data ?? []).map((r) => (r as { id: string }).id);
    const linesByQuote = new Map<string, SourceLine[]>();
    if (ids.length) {
      const { data: lines } = await admin.from("erp_playground_quote_lines")
        .select("quote_id, sku, product_name, qty, unit, unit_price").in("quote_id", ids);
      for (const l of (lines ?? []) as Record<string, unknown>[]) {
        const k = String(l.quote_id);
        (linesByQuote.get(k) ?? linesByQuote.set(k, []).get(k)!).push({
          sku: (l.sku as string) ?? null, product_name: (l.product_name as string) ?? "",
          qty: Number(l.qty) || 0, unit: (l.unit as string) || "ชิ้น",
          unit_price: Number(l.unit_price) || 0, due_date: null, mo_id: null, mo_no: null,
        });
      }
    }
    const docs: SourceDoc[] = (data ?? []).map((r) => {
      const q2 = r as Record<string, unknown>;
      return {
        kind: "quote", id: String(q2.id), no: (q2.quote_number as string) ?? null,
        date: (q2.quote_date as string) ?? null, customer_name: (q2.customer_name as string) ?? null,
        title: `${q2.quote_number ?? "—"} · ${q2.customer_name ?? "—"}`,
        amount: Number(q2.grand_total) || 0,
        lines: linesByQuote.get(String(q2.id)) ?? [],
      };
    });
    return NextResponse.json({ data: docs, error: null });
  }

  // ── ใบสั่งผลิต (ที่ยังไม่ผูกใบสั่งขาย) ─────────────────
  let q = admin.from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, due_date, order_date, status, so_order_id")
    .eq("is_active", true).is("so_order_id", null)
    .not("status", "in", "(cancelled,done)")
    .order("created_at", { ascending: false }).limit(200);
  if (search) q = q.or(`mo_no.ilike.%${search}%,product_sku.ilike.%${search}%,product_name.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  // ราคาขายของสินค้า (เอาไปตั้งราคาให้อัตโนมัติ) — เฉพาะแถวสินค้าที่ใช้งานอยู่
  const skus = [...new Set((data ?? []).map((r) => (r as { product_sku: string | null }).product_sku).filter(Boolean))] as string[];
  const priceOf = new Map<string, number>();
  if (skus.length) {
    const { data: sk } = await admin.from("skus_v2").select("code, list_price").in("code", skus).eq("is_active", true);
    for (const s of (sk ?? []) as { code: string; list_price: number | null }[]) priceOf.set(s.code, Number(s.list_price) || 0);
  }

  const docs: SourceDoc[] = (data ?? []).map((r) => {
    const m = r as Record<string, unknown>;
    const sku = (m.product_sku as string) ?? null;
    const qty = Number(m.qty) || 0;
    const price = sku ? (priceOf.get(sku) ?? 0) : 0;
    return {
      kind: "mo", id: String(m.id), no: (m.mo_no as string) ?? null,
      date: (m.order_date as string) ?? null, customer_name: null,
      title: `${m.mo_no ?? "—"} · ${sku ?? ""} ${m.product_name ?? ""}`.trim(),
      amount: qty * price,
      lines: [{
        sku, product_name: (m.product_name as string) || sku || "",
        qty, unit: "ชิ้น", unit_price: price,
        due_date: (m.due_date as string) ?? null,
        mo_id: String(m.id), mo_no: (m.mo_no as string) ?? null,
      }],
    };
  });
  return NextResponse.json({ data: docs, error: null });
}
