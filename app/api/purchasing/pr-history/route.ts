/**
 * GET /api/purchasing/pr-history
 * ประวัติใบขอซื้อ (PR v2) ล่าสุดทั้งหมด + "ไปถึงไหนแล้ว" — สำหรับป๊อป "ประวัติการขอซื้อ" หน้าขอซื้อ
 * join skus_v2 เอา code + รูปปก · เรียงใหม่สุดก่อน
 * 2026-11-05: เติมใบสั่งซื้อที่ผูก (เลข/สถานะ) + ขั้นความคืบหน้า (lib/pr-progress) + สถานะจ่ายเงิน (lib/po-pay-server)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { SKU_COVER_SELECT, resolveSkuCover } from "@/lib/sku-cover";
import { skuIdsByBracketCode, resolveSkuId } from "@/lib/sku-code-lookup";
import { prProgress } from "@/lib/pr-progress";
import { loadPoPay, PO_PAY_COLUMNS } from "@/lib/po-pay-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
type Row = Record<string, unknown>;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: prs, error } = await admin
    .from("purchase_requests_v2")
    .select("id, pr_no, seller_name, item_sku_id, item_name, qty, uom, price_est, currency, order_date, requester, status, image_key, reject_reason, created_at, po_id, source_mo_no, source_mo_nos")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const list = (prs ?? []) as Row[];

  // ใบที่มาจากใบสั่งงาน (BOM) ยังไม่ผูก SKU — รหัสอยู่ในชื่อ "[CODE] ชื่อ" → เดา SKU จากรหัสนั้น (ของกลาง)
  const codeSkuMap = await skuIdsByBracketCode(admin, list.map((p) => p.item_name as string));
  const skuIdOf = (p: { item_sku_id?: unknown; item_name?: unknown }) => resolveSkuId(p.item_sku_id, p.item_name, codeSkuMap);
  const skuIds = [...new Set(list.map(skuIdOf).filter(Boolean) as string[])];
  const skuMap = new Map<string, { code: string | null; cover: string | null }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, " + SKU_COVER_SELECT + "").in("id", skuIds.slice(i, i + 300));
    for (const s of (sk ?? []) as unknown as Row[]) skuMap.set(String(s.id), { code: (s.code as string) ?? null, cover: resolveSkuCover(s).key });
  }

  // บรรทัดใบสั่งซื้อที่ผูกใบขอซื้อ (pr_id) → ได้ของแล้วเท่าไร
  const prIds = list.map((p) => String(p.id));
  const lineByPr = new Map<string, Row>();
  for (let i = 0; i < prIds.length; i += 300) {
    const { data: ls } = await admin.from("purchase_order_lines_v2")
      .select("pr_id, po_id, qty, qty_received, line_status")
      .in("pr_id", prIds.slice(i, i + 300)).not("is_active", "is", false);
    for (const l of (ls ?? []) as Row[]) if (!lineByPr.has(String(l.pr_id))) lineByPr.set(String(l.pr_id), l);
  }
  // ใบสั่งซื้อ (เลข/สถานะ/จ่ายเงิน)
  const poIds = [...new Set(list.map((p) => String(lineByPr.get(String(p.id))?.po_id ?? p.po_id ?? "")).filter(Boolean))];
  const poMap = new Map<string, Row>();
  for (let i = 0; i < poIds.length; i += 300) {
    const { data: ps } = await admin.from("purchase_orders_v2")
      .select("id, po_no, status, currency, " + PO_PAY_COLUMNS).in("id", poIds.slice(i, i + 300));
    for (const p of (ps ?? []) as unknown as Row[]) poMap.set(String(p.id), p);
  }
  const payOf = poMap.size ? await loadPoPay(admin) : null;

  const rows = list.map((p) => {
    const sid = skuIdOf(p);
    const sk = sid ? skuMap.get(sid) : null;
    const key = sk?.cover ?? (p.image_key as string) ?? null;
    const ln = lineByPr.get(String(p.id)) ?? null;
    const po = poMap.get(String(ln?.po_id ?? p.po_id ?? "")) ?? null;
    const prog = prProgress({
      pr_status: p.status as string,
      line: ln ? { qty: num(ln.qty), qty_received: num(ln.qty_received), line_status: (ln.line_status as string) ?? null } : null,
      po_status: (po?.status as string) ?? null,
    });
    const mos = Array.isArray(p.source_mo_nos) && p.source_mo_nos.length ? (p.source_mo_nos as string[]) : p.source_mo_no ? [String(p.source_mo_no)] : [];
    return {
      id: String(p.id),
      pr_no: (p.pr_no as string) ?? "",
      seller_name: (p.seller_name as string) ?? "—",
      item_name: (p.item_name as string) ?? "",
      code: sk?.code ?? "",
      image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
      qty: num(p.qty),
      uom: (p.uom as string) || "",
      price_est: num(p.price_est),
      line_total: num(p.qty) * num(p.price_est),
      currency: (p.currency as string) ?? "THB",
      order_date: (p.order_date as string) ?? null,
      created_at: (p.created_at as string) ?? null,
      requester: (p.requester as string) ?? "",
      status: (p.status as string) ?? "",
      reject_reason: (p.reject_reason as string) ?? null,
      mo_nos: mos,
      po_id: po ? String(po.id) : null,
      po_no: (po?.po_no as string) ?? null,
      qty_received: ln ? num(ln.qty_received) : 0,
      progress: prog,
      pay: po && payOf ? payOf(po) : null,
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
