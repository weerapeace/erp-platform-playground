/**
 * ตัวเลือกใบสั่งขายสำหรับป๊อปสร้างใบสั่งผลิต — GET /api/mo/so-options?sku=CODE[&all=1]  (หรือ ?skus=A,B → needs ต่อรหัส)
 *   → need      ต้องผูกไหม (required = แบรนด์ลูกค้า · optional = แบรนด์เรา · unknown_brand = ยังไม่มีแบรนด์)
 *   → brand     แบรนด์ + ลูกค้าประจำแบรนด์ (ไว้เติมตอน "สร้างใหม่")
 *   → orders    ใบสั่งขายที่ยังไม่ส่งครบ/ไม่ยกเลิก — ใบที่มีสินค้านี้ขึ้นก่อน (+ รายการที่ตรง + เปิดผลิตไปแล้วเท่าไร)
 *               ค่าตั้งต้นกรองลูกค้าประจำแบรนด์ (หรือใบที่มีสินค้าแบรนด์เดียวกัน) · all=1 = ทุกใบ
 * สิทธิ์: products.view (คนเปิดใบสั่งผลิต) — อ่านอย่างเดียว
 * กติกากลาง: lib/mo-so-rule.ts · ตัวช่วยเซิร์ฟเวอร์: app/api/mo/so-link.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { soNeedOf, soLineProgress, type BrandInfo, type SoOption, type SoOptionsResponse } from "@/lib/mo-so-rule";
import { brandInfoOfSkus } from "../so-link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  // โหมดหลายรายการ: ?skus=A,B,C → ต้องผูกไหมของแต่ละรหัส (ไม่โหลดใบสั่งขาย)
  const many = (sp.get("skus") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (many.length) {
    const info = await brandInfoOfSkus(supabaseAdmin(), many);
    const needs: Record<string, { need: ReturnType<typeof soNeedOf>; brand: BrandInfo | null }> = {};
    for (const c of many) { const b = info.get(c) ?? null; needs[c] = { need: soNeedOf(b), brand: b }; }
    return NextResponse.json({ needs, error: null });
  }
  const sku = (sp.get("sku") ?? "").trim();
  const all = sp.get("all") === "1";
  if (!sku) return NextResponse.json({ need: "optional", brand: null, orders: [], filtered_by: "all", error: "ไม่ระบุสินค้า" }, { status: 400 });

  const admin = supabaseAdmin();
  const brand = (await brandInfoOfSkus(admin, [sku])).get(sku) ?? null;
  const need = soNeedOf(brand);

  const { data: os, error } = await admin.from("so_orders")
    .select("id, order_no, order_date, due_date, customer_id, customer_name, customer_po_no, company_code, status")
    .eq("status", "confirmed").order("order_date", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ need, brand, orders: [], filtered_by: "all", error: "โหลดใบสั่งขายไม่สำเร็จ" }, { status: 500 });
  const orders = (os ?? []) as Row[];
  const ids = orders.map((o) => String(o.id));

  const lines: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("so_order_lines").select("id, order_id, sku, qty, mo_id, mo_no, due_date").in("order_id", ids.slice(i, i + 200));
    lines.push(...((data ?? []) as Row[]));
  }
  const mos: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, so_order_id")
      .in("so_order_id", ids.slice(i, i + 200)).eq("is_active", true);
    mos.push(...((data ?? []) as Row[]));
  }
  const linesOf = new Map<string, Row[]>();
  for (const l of lines) (linesOf.get(String(l.order_id)) ?? linesOf.set(String(l.order_id), []).get(String(l.order_id))!).push(l);
  const mosOf = new Map<string, Row[]>();
  for (const m of mos) (mosOf.get(String(m.so_order_id)) ?? mosOf.set(String(m.so_order_id), []).get(String(m.so_order_id))!).push(m);

  // ใบที่มีสินค้าแบรนด์เดียวกัน (ใช้กรองเมื่อแบรนด์ยังไม่ตั้งลูกค้าประจำ)
  let sameBrandOrders: Set<string> | null = null;
  // ลูกค้าประจำแบรนด์ (หลายสาขาได้) → เอาใบของลูกค้าทุกรายในรายการ
  const custIds = new Set((brand?.default_customers ?? []).map((c) => c.id));
  if (!all && !custIds.size && brand) {
    const info = await brandInfoOfSkus(admin, lines.map((l) => String(l.sku ?? "")));
    sameBrandOrders = new Set(lines.filter((l) => info.get(String(l.sku ?? ""))?.brand_id === brand.brand_id).map((l) => String(l.order_id)));
  }

  const out: SoOption[] = [];
  for (const o of orders) {
    const id = String(o.id);
    if (!all && custIds.size && !custIds.has(String(o.customer_id ?? ""))) continue;
    if (!all && sameBrandOrders && !sameBrandOrders.has(id)) continue;
    const ls = linesOf.get(id) ?? [];
    const prog = soLineProgress(
      ls.map((l) => ({ id: String(l.id), sku: (l.sku as string) ?? null, qty: Number(l.qty) || 0, mo_id: (l.mo_id as string) ?? null })),
      (mosOf.get(id) ?? []).map((m) => ({ id: String(m.id), mo_no: String(m.mo_no), product_sku: (m.product_sku as string) ?? null, qty: Number(m.qty) || 0, status: (m.status as string) ?? null })),
    ).byLine;
    out.push({
      id, order_no: (o.order_no as string) ?? null, order_date: String(o.order_date ?? ""), due_date: (o.due_date as string) ?? null,
      customer_id: (o.customer_id as string) ?? null, customer_name: (o.customer_name as string) ?? null,
      customer_po_no: (o.customer_po_no as string) ?? null, company_code: (o.company_code as string) ?? null,
      lines: ls.filter((l) => l.sku === sku).map((l) => ({
        id: String(l.id), qty: Number(l.qty) || 0, opened: prog[String(l.id)]?.opened ?? 0,
        mo_no: (l.mo_no as string) ?? null, due_date: (l.due_date as string) ?? null,
      })),
      line_count: ls.length,
    });
  }
  // ใบที่มีสินค้านี้และยังเปิดผลิตไม่ครบขึ้นก่อน → มีสินค้านี้ → ใหม่สุด
  const rank = (o: SoOption) => (o.lines.some((l) => l.opened + 0.0001 < l.qty) ? 0 : o.lines.length ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b) || b.order_date.localeCompare(a.order_date));
  const filtered_by = all ? "all" : custIds.size ? "customer" : sameBrandOrders ? "brand" : "all";
  return NextResponse.json({ need, brand, orders: out.slice(0, 60), filtered_by, error: null } satisfies SoOptionsResponse);
}
