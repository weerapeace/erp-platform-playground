/**
 * ยอดที่ขายแล้วต่อใบสั่งผลิต — GET /api/mo/sold-qty?ids=<mo id,...>
 *   = ผูกใบขาย (mo_sales_links ที่ยังผูกอยู่) รวมต่อใบ → การ์ดบอร์ดจ่ายงานโชว์ "ขายแล้ว x/y" กันจ่ายงานซ้ำของที่ขายไปแล้ว
 *   คืน { data: { [mo_id]: { qty, bills: ["ISG…"] } } }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type SoldQty = Record<string, { qty: number; bills: string[] }>;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s)))].slice(0, 1000);
  const out: SoldQty = {};
  const admin = supabaseAdmin();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("mo_sales_links").select("mo_id, qty, so_number")
      .in("mo_id", ids.slice(i, i + 200)).eq("is_active", true);
    if (error) return NextResponse.json({ data: out, error: error.message }, { status: 500 });
    for (const r of (data ?? []) as { mo_id: string; qty: number; so_number: string | null }[]) {
      const x = out[r.mo_id] ?? { qty: 0, bills: [] };
      x.qty += Number(r.qty) || 0;
      if (r.so_number && !x.bills.includes(r.so_number)) x.bills.push(r.so_number);
      out[r.mo_id] = x;
    }
  }
  return NextResponse.json({ data: out, error: null });
}
