/**
 * วัตถุดิบ "ทุกตัว" ใน BOM ของใบสั่งผลิต + สถานะการซื้อ — /api/mo/material-status?mo_no=MO-xxxx
 * ใช้ในแท็บ "ใบสั่งผลิต" หน้าขอซื้อ: ต้องซื้อ (บน) → ขอแล้ว/สั่งแล้ว → รับแล้ว/มีของ/เตรียมแล้ว (ล่าง)
 *   ยอดต้องซื้อ = สูตรเดียวกับ /api/mo/purchase-needs (qty_per × จำนวนสั่ง − มีอยู่ หรือค่า override − ขอซื้อแล้ว)
 *   ขอซื้อแล้ว = ใบขอซื้อที่ผูกใบงานนี้ (m2m source_mo_nos) จับรหัสด้วย lib/pr-line-code
 *   สั่งแล้ว   = ใบขอซื้อที่ออก PO แล้ว — PO ร่างนับว่าสั่งแล้ว (เจ้าของตัดสิน 2026-10-25)
 *   รับแล้ว    = บรรทัด PO ที่ผูกใบขอซื้อนั้นจบหมด (รับครบ/ปิดยอด) และได้ของพอ
 *   ปิดยอดแต่ของขาด → ส่วนที่ขาดกลับไป "ต้องซื้อ" (นับเท่าที่รับจริง)
 *   links[] มี po_id/po_line_id/สถานะรับ → การ์ดกดดู PO + รับของได้ (ReceiveLineModal)
 *   stock = ยอดคลัง WH-RAW + นับล่าสุด + ที่แบ่งให้ใบงานอื่นแล้ว → ป้าย "นับแล้ว" + ป๊อปนับสต๊อก (/api/inventory/quick-count)
 * ของกลาง: guardApi(products.view) + supabaseAdmin + lib/mo-material-status (กติกาสถานะเดียวกับ /api/mo/material-progress)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadMoPurchaseLinks, computeMatStatus, linkKey, r4, type MatStatus, type MatPurchaseLink } from "@/lib/mo-material-status";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type { MatStatus, MatPurchaseLink };
export type MoMaterialStatus = {
  summary_id: string; code: string | null; name: string | null; image: string | null; type: string | null; uom: string | null;
  qty_per: number; required: number; on_hand: number; to_purchase_stored: number | null; is_ready: boolean;
  want: number; requested: number; remaining: number; received: number;
  status: MatStatus; links: MatPurchaseLink[];
  /** สต๊อกคลังวัตถุดิบ (WH-RAW) — null = ไม่มีรหัส SKU */
  stock: MatStock | null;
};
/**
 * ยอดในคลังวัตถุดิบ + การนับล่าสุด + ที่แบ่งให้ใบงานอื่นไปแล้ว (กันใช้ของก้อนเดียวซ้ำหลายใบ)
 *   reserved_other = ที่ "ใช้ของในสต๊อก" ให้ใบงานอื่นที่ยังเปิด + ยังไม่จ่ายงาน (จ่ายงานแล้ว ของย้าย RAW→WIP ยอดคลังลดเอง ไม่ต้องหักซ้ำ)
 *   available = on_hand − reserved_other (null = ยังไม่มียอดในคลังเลย)
 */
export type MatStock = {
  warehouse: string; on_hand: number | null;
  counted_at: string | null; counted_by: string | null; counted_qty: number | null;
  reserved_other: number; reserved_this: number; available: number | null;
};
/** mo_date = วันเปิดใบสั่งผลิต (order_date → ไม่มีใช้วันสร้าง) — ใช้นับว่า "ยังไม่ซื้อมากี่วัน" */
export type MoMaterialStatusResult = { mo_no: string; mo_qty: number; mo_date?: string | null; items: MoMaterialStatus[] };

type Row = Record<string, unknown>;

/** สต๊อก WH-RAW ต่อรหัสวัตถุดิบ: ยอดคงเหลือ · การนับล่าสุด (นับด่วนจากการ์ด / หน้านับสต๊อก) · ที่แบ่งให้ใบงานแล้ว */
async function loadRawStock(admin: SupabaseClient, moNo: string, skuIdByCode: Map<string, string>): Promise<Map<string, MatStock>> {
  const out = new Map<string, MatStock>();
  if (skuIdByCode.size === 0) return out;
  const { data: wh } = await admin.from("erp_playground_warehouses").select("id, code").eq("code", "WH-RAW").maybeSingle();
  const whId = wh ? String((wh as { id: string }).id) : null;
  const ids = [...new Set(skuIdByCode.values())];
  const codes = [...skuIdByCode.keys()];
  const [bal, audits, adjusts, allocs] = await Promise.all([
    whId ? admin.from("erp_playground_stock_balances").select("product_id, qty_on_hand").eq("warehouse_id", whId).in("product_id", ids) : Promise.resolve({ data: [] as Row[] }),
    admin.from("audit_logs").select("entity_id, metadata, created_at").eq("action", "stock_count").eq("entity_type", "skus_v2").in("entity_id", ids)
      .order("created_at", { ascending: false }).limit(1000),
    whId ? admin.from("erp_playground_stock_movements").select("product_id, qty, performed_by, created_at").eq("movement_type", "adjust").eq("to_warehouse_id", whId).in("product_id", ids)
      .order("created_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [] as Row[] }),
    admin.from("mo_material_allocations").select("mo_no, component_sku, qty").eq("source", "stock").eq("is_active", true).in("component_sku", codes).limit(2000),
  ]);
  const onHand = new Map(((bal.data ?? []) as Row[]).map((b) => [String(b.product_id), r4(Number(b.qty_on_hand) || 0)]));
  // นับล่าสุด = ใหม่สุดระหว่าง audit stock_count (ครอบคลุมนับได้ 0) กับ movement adjust (หน้านับสต๊อก)
  const lastCount = new Map<string, { at: string; by: string | null; qty: number | null }>();
  const keep = (pid: string, at: string, by: string | null, qty: number | null) => {
    const cur = lastCount.get(pid);
    if (!cur || at > cur.at) lastCount.set(pid, { at, by, qty });
  };
  for (const a of (audits.data ?? []) as Row[]) {
    const m = (a.metadata ?? {}) as Record<string, unknown>;
    keep(String(a.entity_id), String(a.created_at), (m.actor as string) ?? null, m.counted != null ? Number(m.counted) : null);
  }
  for (const m of (adjusts.data ?? []) as Row[]) keep(String(m.product_id), String(m.created_at), (m.performed_by as string) ?? null, Number(m.qty));
  // ของในสต๊อกที่ถูก "ใช้กับใบงาน" ไปแล้ว — นับเฉพาะใบที่ยังเปิด + ยังไม่จ่ายงาน
  const allocRows = (allocs.data ?? []) as Row[];
  const allocMos = [...new Set(allocRows.map((a) => String(a.mo_no)))];
  const liveMo = new Set<string>();
  if (allocMos.length) {
    const { data: mos } = await admin.from("manufacturing_orders").select("mo_no, status, is_active, materials_issued").in("mo_no", allocMos);
    for (const m of (mos ?? []) as Row[]) if (m.is_active && !["cancelled", "done"].includes(String(m.status)) && !m.materials_issued) liveMo.add(String(m.mo_no));
  }
  const resOther = new Map<string, number>(), resThis = new Map<string, number>();
  for (const a of allocRows) {
    if (!liveMo.has(String(a.mo_no))) continue;
    const c = String(a.component_sku), q = Number(a.qty) || 0;
    const tgt = String(a.mo_no) === moNo ? resThis : resOther;
    tgt.set(c, r4((tgt.get(c) ?? 0) + q));
  }
  for (const [code, pid] of skuIdByCode) {
    const oh = onHand.has(pid) ? onHand.get(pid) as number : null;
    const lc = lastCount.get(pid) ?? null;
    const other = resOther.get(code) ?? 0;
    out.set(code, {
      warehouse: "WH-RAW", on_hand: oh, counted_at: lc?.at ?? null, counted_by: lc?.by ?? null, counted_qty: lc?.qty ?? null,
      reserved_other: other, reserved_this: resThis.get(code) ?? 0, available: oh == null ? null : r4(oh - other),
    });
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return NextResponse.json({ data: null, error: "ต้องระบุเลขใบสั่งผลิต" }, { status: 400 });
  const admin = supabaseAdmin();

  // ใบขอซื้อ → PO (เลขใบ/สถานะ/วันของถึง) + บรรทัด PO (รับแล้วเท่าไร) — ของกลาง lib/mo-material-status
  const [{ data: mo }, { data: sums, error: sErr }, linksByKey] = await Promise.all([
    admin.from("manufacturing_orders").select("mo_no, qty, order_date, created_at").eq("mo_no", moNo).eq("is_active", true).maybeSingle(),
    admin.from("mo_material_summary")
      .select("id, component_sku, component_name, material_type, uom, qty_per, on_hand_qty, to_purchase_qty, is_ready, sequence")
      .eq("mo_no", moNo).eq("is_active", true)
      .order("sequence", { ascending: true, nullsFirst: false }).order("id", { ascending: true }),
    loadMoPurchaseLinks(admin, [moNo]),
  ]);
  if (sErr) return NextResponse.json({ data: null, error: "โหลดวัตถุดิบของใบสั่งผลิตไม่สำเร็จ" }, { status: 500 });
  if (!mo) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const moQty = Number((mo as Row).qty) || 0;

  // รูปวัตถุดิบ (cover SKU → fallback Parent)
  const codes = [...new Set(((sums ?? []) as Row[]).map((s) => String(s.component_sku ?? "").trim()).filter(Boolean))];
  const imgByCode = new Map<string, string>();
  const skuIdByCode = new Map<string, string>();
  if (codes.length) {
    const { data: skus } = await admin.from("skus_v2").select("id, code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", codes).eq("is_active", true);
    for (const sk of (skus ?? []) as Row[]) {
      if (!skuIdByCode.has(String(sk.code))) skuIdByCode.set(String(sk.code), String(sk.id));
      const parRel = sk.parent_skus_v2;
      const par = (Array.isArray(parRel) ? parRel[0] : parRel) as { cover_image_r2_key?: string | null } | null;
      const key = (sk.cover_image_r2_key as string | null) || par?.cover_image_r2_key || "";
      if (key) imgByCode.set(String(sk.code), `/api/r2-image?key=${encodeURIComponent(key)}`);
    }
  }
  const stockByCode = await loadRawStock(admin, moNo, skuIdByCode);

  const items: MoMaterialStatus[] = ((sums ?? []) as Row[]).map((s) => {
    const code = (s.component_sku as string) ?? null;
    const links = code ? linksByKey.get(linkKey(moNo, code)) ?? [] : [];
    return {
      summary_id: String(s.id), code, name: (s.component_name as string) ?? null, image: code ? imgByCode.get(code) ?? null : null,
      type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null,
      ...computeMatStatus(s, moQty, links), links,
      stock: code ? stockByCode.get(code) ?? null : null,
    };
  });

  const moRow = mo as Row;
  const moDate = (moRow.order_date as string) ?? (moRow.created_at ? new Date(new Date(String(moRow.created_at)).getTime() + 7 * 3600e3).toISOString().slice(0, 10) : null);
  const data: MoMaterialStatusResult = { mo_no: moNo, mo_qty: moQty, mo_date: moDate, items };
  return NextResponse.json({ data, error: null });
}
