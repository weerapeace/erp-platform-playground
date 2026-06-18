/**
 * รวมวัตถุดิบที่ "ต้องขอซื้อ/เตรียม" จากทุกใบสั่งผลิต (active) — /api/mo/purchase-needs
 * GET → จัดกลุ่มตามวัตถุดิบ: รวมที่ยังต้องซื้อ (ทุกใบ) + รายใบที่ต้องใช้
 *   ต้องซื้อต่อใบ = (qty_per × จำนวนสั่ง − ของที่มี) หรือค่า override − ที่ขอซื้อไปแล้ว
 *   แต่ละใบแนบ summary_id/on_hand/is_ready (แก้ "เตรียมแล้ว+จำนวนที่มี" ได้) + รูปวัตถุดิบ + รูป SKU ของ MO
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PurchaseNeedMo = {
  mo_no: string; mo_id: string; product_label: string; product_image: string | null; due_date: string | null;
  needed: number; summary_id: string | null; on_hand: number; is_ready: boolean; qty_per: number; mo_qty: number;
};
export type PurchaseNeedRow = {
  component_sku: string | null; component_name: string | null; component_image: string | null; material_type: string | null; uom: string | null;
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
    admin.from("mo_material_summary").select("id, mo_no, component_sku, component_name, material_type, uom, qty_per, on_hand_qty, to_purchase_qty, is_ready").in("mo_no", moNos).eq("is_active", true),
    admin.from("purchase_requests_v2").select("item_name, qty, source_mo_no").in("source_mo_no", moNos).eq("is_active", true).not("status", "in", "(rejected,cancelled)"),
  ]);

  // รูปสินค้า (cover SKU, fallback Parent) — ดึงครั้งเดียวสำหรับทั้งวัตถุดิบและสินค้าของ MO
  const imgCodes = new Set<string>();
  for (const m of moList) if (m.product_sku) imgCodes.add(String(m.product_sku));
  for (const s of (sums ?? []) as Record<string, unknown>[]) if (s.component_sku) imgCodes.add(String(s.component_sku));
  const imgMap = new Map<string, string>();
  if (imgCodes.size) {
    const { data: skus } = await admin.from("skus_v2").select("code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", [...imgCodes]);
    for (const sk of (skus ?? []) as Record<string, unknown>[]) {
      const parRel = sk.parent_skus_v2;
      const par = (Array.isArray(parRel) ? parRel[0] : parRel) as { cover_image_r2_key?: string | null } | null;
      const key = (sk.cover_image_r2_key as string | null) || par?.cover_image_r2_key || "";
      if (key) imgMap.set(String(sk.code), `/api/r2-image?key=${encodeURIComponent(key)}`);
    }
  }
  const imgOf = (code: string | null | undefined) => (code ? imgMap.get(code) ?? null : null);

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
    if (!g) { g = { component_sku: code, component_name: (s.component_name as string) ?? null, component_image: imgOf(code), material_type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null, total_remaining: 0, total_requested: 0, mos: [] }; groups.set(gkey, g); }
    g.total_remaining = r4(g.total_remaining + remaining);
    g.total_requested = r4(g.total_requested + got);
    g.mos.push({
      mo_no: moNo, mo_id: String(mo.id),
      product_label: `${mo.product_sku ?? ""}`.trim() || String(mo.product_name ?? ""),
      product_image: imgOf(mo.product_sku as string | null),
      due_date: (mo.due_date as string) ?? null, needed: remaining,
      summary_id: s.id ? String(s.id) : null, on_hand: onHand, is_ready: !!s.is_ready, qty_per: qtyPer, mo_qty: moQty,
    });
  }

  const data = [...groups.values()].sort((a, b) => (a.component_name ?? "").localeCompare(b.component_name ?? "", "th"));
  return NextResponse.json({ data, error: null });
}
