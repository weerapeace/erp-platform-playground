/**
 * รวมวัตถุดิบที่ "ต้องขอซื้อ" จากทุกใบสั่งผลิต (active) — /api/mo/purchase-needs
 * GET → จัดกลุ่มตามวัตถุดิบ: รวมที่ยังต้องซื้อ (ทุกใบ) + รายใบที่ต้องใช้
 *   ต้องซื้อต่อใบ = (qty_per × จำนวนสั่ง − ของที่มี) หรือค่า override − ที่ขอซื้อไปแล้ว
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PurchaseNeedMo = { mo_no: string; mo_id: string; product_label: string; due_date: string | null; needed: number };
export type PurchaseNeedRow = {
  component_sku: string | null; component_name: string | null; material_type: string | null; uom: string | null;
  total_remaining: number; total_requested: number; mos: PurchaseNeedMo[];
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: mos } = await admin.from("manufacturing_orders")
    .select("id, mo_no, qty, product_sku, product_name, due_date")
    .eq("is_active", true).not("status", "in", "(cancelled,done)").limit(1000);
  const moList = (mos ?? []) as Record<string, unknown>[];
  if (moList.length === 0) return NextResponse.json({ data: [], error: null });
  const moNos = moList.map((m) => String(m.mo_no));
  const moById = new Map(moList.map((m) => [String(m.mo_no), m]));

  const [{ data: sums }, { data: prs }] = await Promise.all([
    admin.from("mo_material_summary").select("mo_no, component_sku, component_name, material_type, uom, qty_per, on_hand_qty, to_purchase_qty").in("mo_no", moNos).eq("is_active", true),
    admin.from("purchase_requests_v2").select("item_name, qty, source_mo_no").in("source_mo_no", moNos).eq("is_active", true).not("status", "in", "(rejected,cancelled)"),
  ]);

  // ขอซื้อไปแล้ว ต่อ (ใบ, รหัสวัตถุดิบ)
  const requested = new Map<string, number>();   // key = mo_no|code
  for (const p of (prs ?? []) as Record<string, unknown>[]) {
    const m = /^\[([^\]]+)\]/.exec(String(p.item_name ?? ""));
    const code = m ? m[1] : String(p.item_name ?? "");
    if (!code) continue;
    const k = `${String(p.source_mo_no)}|${code}`;
    requested.set(k, (requested.get(k) ?? 0) + (Number(p.qty) || 0));
  }

  // จัดกลุ่มตามวัตถุดิบ
  const groups = new Map<string, PurchaseNeedRow>();
  for (const s of (sums ?? []) as Record<string, unknown>[]) {
    const moNo = String(s.mo_no); const mo = moById.get(moNo); if (!mo) continue;
    const code = (s.component_sku as string) ?? null;
    const moQty = Number(mo.qty) || 0;
    const qtyPer = Number(s.qty_per) || 0;
    const onHand = Number(s.on_hand_qty) || 0;
    const base = Math.max(0, r4(qtyPer * moQty - onHand));
    const stored = s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null;
    const want = stored != null && Math.round(stored * 10000) !== Math.round(base * 10000) ? stored : base;   // override ถ้ามี
    const got = requested.get(`${moNo}|${code ?? ""}`) ?? 0;
    const remaining = Math.max(0, r4(want - got));
    if (remaining <= 0.0001) continue;

    const gkey = code ?? `nm:${String(s.component_name ?? "")}`;
    let g = groups.get(gkey);
    if (!g) { g = { component_sku: code, component_name: (s.component_name as string) ?? null, material_type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null, total_remaining: 0, total_requested: 0, mos: [] }; groups.set(gkey, g); }
    g.total_remaining = r4(g.total_remaining + remaining);
    g.total_requested = r4(g.total_requested + got);
    g.mos.push({ mo_no: moNo, mo_id: String(mo.id), product_label: `${mo.product_sku ?? ""}`.trim() || String(mo.product_name ?? ""), due_date: (mo.due_date as string) ?? null, needed: remaining });
  }

  const data = [...groups.values()].sort((a, b) => (a.component_name ?? "").localeCompare(b.component_name ?? "", "th"));
  return NextResponse.json({ data, error: null });
}
