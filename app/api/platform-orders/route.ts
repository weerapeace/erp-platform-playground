/**
 * ออเดอร์จากแพลตฟอร์ม — /api/platform-orders (เฟส 1a)
 * GET  ?id=                         → ออเดอร์ + รายการ (detail)
 * GET  ?platform_id=&brand_id=&status=  → รายการออเดอร์ + summary ตามสถานะ
 * PATCH { id, status?, tracking_no?, carrier? }  (platform_orders.manage)
 *   - status=confirmed → ตัดสต๊อก (ledger เดิม, ครั้งเดียว) · status=cancelled → คืนสต๊อกถ้าเคยตัด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = ["new", "confirmed", "packed", "shipped", "cancelled"];

async function defaultWarehouse(admin: ReturnType<typeof supabaseAdmin>): Promise<string | null> {
  const { data: main } = await admin.from("erp_playground_warehouses").select("id").eq("code", "WH-MAIN").maybeSingle();
  if ((main as { id?: string } | null)?.id) return String((main as { id: string }).id);
  const { data: any1 } = await admin.from("erp_playground_warehouses").select("id").limit(1).maybeSingle();
  return (any1 as { id?: string } | null)?.id ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const id = (sp.get("id") ?? "").trim();
  if (id) {
    const { data: order } = await admin.from("platform_orders").select("*").eq("id", id).maybeSingle();
    if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    const { data: items } = await admin.from("platform_order_items").select("*").eq("order_id", id);
    return NextResponse.json({ order, items: items ?? [], error: null });
  }
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  const status = (sp.get("status") ?? "").trim();
  let q = admin.from("platform_orders").select("id, platform_id, external_order_id, order_no, customer_name, status, total, currency, ordered_at, tracking_no, stock_deducted, created_at").order("created_at", { ascending: false }).limit(1000);
  if (platformId) q = q.eq("platform_id", platformId);
  if (brandId) q = q.eq("brand_id", brandId);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as Record<string, unknown>[];
  const summary: Record<string, number> = {};
  for (const s of STATUSES) summary[s] = rows.filter((r) => r.status === s).length;
  return NextResponse.json({ orders: rows, summary, total: rows.length, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; status?: string; tracking_no?: string; carrier?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: orderRow } = await admin.from("platform_orders").select("*").eq("id", id).maybeSingle();
  const order = orderRow as Record<string, unknown> | null;
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });

  const newStatus = typeof body.status === "string" ? body.status.trim() : null;
  if (newStatus && !STATUSES.includes(newStatus)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.tracking_no === "string") patch.tracking_no = body.tracking_no.trim() || null;
  if (typeof body.carrier === "string") patch.carrier = body.carrier.trim() || null;
  const label = (order.order_no as string) || (order.external_order_id as string) || "";
  const warnings: string[] = [];

  // ยืนยัน → ตัดสต๊อก (ครั้งเดียว)
  if (newStatus === "confirmed" && !order.stock_deducted) {
    const wh = await defaultWarehouse(admin);
    const { data: items } = await admin.from("platform_order_items").select("matched_sku_id, qty, name, sku_code").eq("order_id", id);
    if (!wh) warnings.push("ไม่พบคลังหลัก (WH-MAIN) — ยังไม่ได้ตัดสต๊อก");
    else {
      for (const it of ((items ?? []) as Record<string, unknown>[])) {
        if (!it.matched_sku_id) { warnings.push(`${it.sku_code ?? it.name ?? "?"}: จับคู่ SKU ไม่ได้ ข้ามการตัดสต๊อก`); continue; }
        const { error } = await admin.rpc("erp_stock_post_internal", { p_movement_type: "out", p_product_id: it.matched_sku_id as string, p_to_warehouse_id: null, p_from_warehouse_id: wh, p_qty: Number(it.qty) || 0, p_unit_cost: 0, p_reference_type: "platform_order", p_reference_id: id, p_reference_label: label, p_actor: user?.email ?? null });
        if (error) warnings.push(`${it.sku_code ?? "?"}: ตัดสต๊อกไม่สำเร็จ (${error.message})`);
      }
      patch.stock_deducted = true;
    }
  }
  // ยกเลิก → คืนสต๊อกถ้าเคยตัด
  if (newStatus === "cancelled" && order.stock_deducted) {
    const wh = await defaultWarehouse(admin);
    const { data: items } = await admin.from("platform_order_items").select("matched_sku_id, qty").eq("order_id", id);
    if (wh) for (const it of ((items ?? []) as Record<string, unknown>[])) {
      if (it.matched_sku_id) await admin.rpc("erp_stock_post_internal", { p_movement_type: "in", p_product_id: it.matched_sku_id as string, p_to_warehouse_id: wh, p_from_warehouse_id: null, p_qty: Number(it.qty) || 0, p_unit_cost: 0, p_reference_type: "platform_order_cancel", p_reference_id: id, p_reference_label: label, p_actor: user?.email ?? null });
    }
    patch.stock_deducted = false;
  }
  if (newStatus) patch.status = newStatus;

  const { error } = await admin.from("platform_orders").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: newStatus ? `order:${newStatus}` : "update", entityType: "platform_order", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { order_no: label, warnings } });
  return NextResponse.json({ ok: true, warnings, error: null });
}
