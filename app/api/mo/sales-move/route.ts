/**
 * 🔀 ผูกใบขายผิด · ย้าย — GET /api/mo/sales-move?mo_no=MO-…  (อ่านอย่างเดียว)
 *   ข้อมูลใบเดิมที่หน้าต่าง "ย้ายใบขาย" ต้องรู้: ใบขายที่ผูกอยู่ · ประวัติส่งออกจากชั้น QC ที่ยังย้อนได้ (audit qc.ship − qc.unship) · ชั้น QC
 *   กติกา/ตัวบันทึก = app/master/work-board/sales-move-plan.ts (บันทึกจริงผ่าน API เดิม: sales-match · qc-warehouse/items unship · ตัวแก้ไขใบงาน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { shipRecs, type MoveInfo } from "@/lib/mo-sales-move";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return NextResponse.json({ error: "ระบุใบสั่งผลิต" }, { status: 400 });
  const admin = supabaseAdmin();
  const [moRes, linkRes, auditRes, shelfRes] = await Promise.all([
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status").eq("mo_no", moNo).limit(1).maybeSingle(),
    admin.from("mo_sales_links").select("id, sale_line_id, so_number, sale_date, qty").eq("mo_no", moNo).eq("is_active", true).order("created_at"),
    admin.from("audit_logs").select("id, action, created_at, metadata").eq("entity_type", "qc_warehouse_items").in("action", ["qc.ship", "qc.unship"]).eq("metadata->>mo_no", moNo).order("created_at").limit(500),
    admin.from("qc_shelves").select("id, name, kind, sort_order").eq("is_active", true).order("sort_order"),
  ]);
  const m = moRes.data as Row | null;
  if (!m) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 404 });
  const data: MoveInfo = {
    mo: { id: String(m.id), mo_no: String(m.mo_no), qty: n(m.qty), status: String(m.status ?? ""), product_sku: (m.product_sku as string | null) ?? null },
    links: ((linkRes.data ?? []) as Row[]).map((k) => ({ id: String(k.id), sale_line_id: String(k.sale_line_id), so_number: (k.so_number as string | null) ?? null, sale_date: (k.sale_date as string | null) ?? null, qty: n(k.qty) })),
    ships: shipRecs(((auditRes.data ?? []) as Row[]).map((a) => ({ id: String(a.id), action: String(a.action), created_at: String(a.created_at ?? ""), metadata: (a.metadata as Record<string, unknown> | null) ?? null }))),
    shelves: ((shelfRes.data ?? []) as Row[]).map((s) => ({ id: String(s.id), name: String(s.name ?? ""), kind: String(s.kind ?? "") })),
  };
  return NextResponse.json({ data });
}
