/**
 * 🧾 อัปเดตงานจากใบขาย — GET รายการบรรทัดใบขายที่ยังไม่ผูกใบสั่งผลิต + ใบที่ระบบเสนอ/เลือกแทนได้ + รูปสินค้า
 *   กติกา/คำนวณ = lib/mo-sales-unlinked (ใช้ matchSales ตัวเดียวกับหน้าอัปเดตเป็นชุด)
 *   เฉพาะสินค้าที่มีใบสั่งผลิต (ของผลิตเอง) · ไม่นับใบขายร่าง/ยกเลิก · อ่านอย่างเดียว — ผูกจริงใช้ POST /api/mo/sales-match เดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import type { SaleLine, SalesLinkRow } from "@/lib/mo-sales-match";
import { buildUnlinked, type MoStage, type UnlinkedMo } from "@/lib/mo-sales-unlinked";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  // ทุกตารางโตตามข้อมูล → ดึงครบด้วย fetchAllPages (กันตัด 1,000 แถวเงียบ ๆ)
  const [moRows, lineRows, linkRows, woRows] = await Promise.all([
    fetchAllPages<Row>((f, t) => admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, created_at, status, is_active")
      .neq("status", "cancelled").order("id").range(f, t)),
    fetchAllPages<Row>((f, t) => admin.from("erp_playground_so_lines").select("id, so_id, sku, qty, erp_playground_sales_orders!inner(id, so_number, status, order_date, customer_name)")
      .gt("qty", 0).order("id").range(f, t)),
    fetchAllPages<Row>((f, t) => admin.from("mo_sales_links").select("id, mo_id, sale_line_id, qty, so_number, sale_date").eq("is_active", true).order("id").range(f, t)),
    fetchAllPages<Row>((f, t) => admin.from("mo_work_orders").select("mo_no, qty, received_qty, status").eq("is_active", true).order("id").range(f, t)),
  ]);

  // ตอนนี้ใบอยู่ไหน — จากใบจ่ายงาน (ไม่มี = รอจ่าย · รับคืนครบ = รับคืนแล้ว · อื่น ๆ = อยู่ที่ช่าง)
  const wo = new Map<string, { qty: number; recv: number }>();
  for (const w of woRows) { const k = String(w.mo_no ?? ""); const c = wo.get(k) ?? { qty: 0, recv: 0 }; c.qty += n(w.qty); c.recv += n(w.received_qty); wo.set(k, c); }
  const stageOf = (m: Row): MoStage => {
    if (m.is_active === false || ["done", "cancel", "cancelled"].includes(String(m.status ?? ""))) return "closed";
    const w = wo.get(String(m.mo_no ?? ""));
    if (!w || w.qty <= 0) return "wait";
    return w.recv >= n(m.qty) - 0.0001 ? "recv" : "work";
  };
  const mos: UnlinkedMo[] = moRows.filter((m) => m.status !== "cancel").map((m) => ({
    id: String(m.id), mo_no: String(m.mo_no), sku: String(m.product_sku ?? "").trim(), qty: n(m.qty), created_at: String(m.created_at ?? ""), stage: stageOf(m),
  }));
  const madeSkus = new Set(mos.map((m) => m.sku.toUpperCase()));
  const lines: SaleLine[] = [];
  for (const l of lineRows) {
    const h = one(l.erp_playground_sales_orders as Row | Row[] | null);
    const sku = String(l.sku ?? "").trim();
    if (!h || h.status === "cancelled" || h.status === "draft" || !madeSkus.has(sku.toUpperCase())) continue;
    lines.push({ id: String(l.id), sale_id: String(h.id), so_number: String(h.so_number ?? "—"), date: String(h.order_date ?? "").slice(0, 10), customer: (h.customer_name as string | null) ?? null, sku, qty: n(l.qty) });
  }
  const links: SalesLinkRow[] = linkRows.map((k) => ({ id: String(k.id), mo_id: String(k.mo_id), sale_line_id: String(k.sale_line_id), qty: n(k.qty), so_number: (k.so_number as string | null) ?? null, sale_date: (k.sale_date as string | null) ?? null }));
  const { rows, stats } = buildUnlinked(mos, lines, links);

  // ชื่อ + รูปสินค้า (ปก SKU → ปกสินค้าแม่) เฉพาะรหัสที่ขึ้นในรายการ
  const codes = [...new Set(rows.map((r) => r.sku))];
  const info = new Map<string, { name: string | null; key: string | null }>();
  for (let i = 0; i < codes.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("code, name_th, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", codes.slice(i, i + 300)).eq("is_active", true);
    for (const s of (data ?? []) as Row[]) {
      const par = one(s.parent_skus_v2 as Row | Row[] | null);
      info.set(String(s.code).trim().toUpperCase(), { name: (s.name_th as string | null) ?? null, key: (s.cover_image_r2_key as string | null) || (par?.cover_image_r2_key as string | null) || null });
    }
  }
  for (const r of rows) {
    const x = info.get(r.sku.toUpperCase());
    r.sku_name = x?.name ?? null;
    r.image_url = x?.key ? `/api/r2-image?key=${encodeURIComponent(x.key)}&w=160` : null;
  }
  return NextResponse.json({ data: { rows, stats } });
}
