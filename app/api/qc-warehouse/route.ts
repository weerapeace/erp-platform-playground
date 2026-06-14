/**
 * โกดัง QC — อ่านสถานะบอร์ด (เฟส 1, ข้อมูลจริง)
 * GET /api/qc-warehouse → { shelves, items, reasons, queue }
 *  - queue = งานที่ช่างส่งคืนจากบอร์ดจ่ายงาน (mo_work_orders.received_qty - qc_pulled_qty > 0)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type QcShelf = { id: string; name: string; kind: "store" | "defect"; sort_order: number };
export type QcItem = {
  id: string; shelf_id: string; wo_id: string | null; mo_no: string | null;
  sku: string | null; sku_name: string | null; worker: string | null;
  qty: number; status: "good" | "defect" | "repairing"; reason: string | null; repair_by: string | null;
  source?: string | null;
  image_key?: string | null; brand_color?: string | null; brand_name?: string | null; is_customer_job?: boolean;
};
export type QcReason = { id: string; name: string };
export type QcSource = { id: string; name: string };
export type QcQueueCard = {
  wo_id: string; mo_no: string | null; sku: string | null; name: string | null;
  worker: string | null; remaining: number; due_date: string | null; image_key?: string | null;
  brand_color?: string | null; brand_name?: string | null; is_customer_job?: boolean; is_subcontract?: boolean;
};

type BrandInfo = { color: string | null; name: string | null; is_customer_job: boolean };
// แมป SKU → แบรนด์ (สี/ชื่อ/ธงงานลูกค้า) ผ่าน skus_v2.parent_sku_id → parent_skus_v2.brand_id → brands
async function buildBrandMap(admin: ReturnType<typeof supabaseAdmin>, skus: string[]): Promise<Record<string, BrandInfo>> {
  const map: Record<string, BrandInfo> = {};
  if (skus.length === 0) return map;
  const { data: sk } = await admin.from("skus_v2").select("code, parent_sku_id").in("code", skus);
  const codeParent = new Map<string, string>();
  const parentIds = new Set<string>();
  for (const r of (sk ?? []) as { code: string | null; parent_sku_id: string | null }[]) if (r.code && r.parent_sku_id) { codeParent.set(r.code, r.parent_sku_id); parentIds.add(r.parent_sku_id); }
  if (parentIds.size === 0) return map;
  const { data: par } = await admin.from("parent_skus_v2").select("id, brand_id").in("id", [...parentIds]);
  const parentBrand = new Map<string, string>();
  const brandIds = new Set<string>();
  for (const r of (par ?? []) as { id: string; brand_id: string | null }[]) if (r.brand_id) { parentBrand.set(r.id, r.brand_id); brandIds.add(r.brand_id); }
  if (brandIds.size === 0) return map;
  const { data: br } = await admin.from("brands").select("id, color, name, is_customer_job").in("id", [...brandIds]);
  const brandInfo = new Map<string, BrandInfo>();
  for (const b of (br ?? []) as { id: string; color: string | null; name: string | null; is_customer_job: boolean | null }[]) brandInfo.set(b.id, { color: b.color, name: b.name, is_customer_job: !!b.is_customer_job });
  for (const [code, pid] of codeParent) { const bid = parentBrand.get(pid); const info = bid ? brandInfo.get(bid) : undefined; if (info) map[code] = info; }
  return map;
}

// รูปสินค้าต่อ SKU (cover_image_r2_key ของ skus_v2 หรือ parent) — สำหรับโชว์บนการ์ด
type SkuImgRow = { code: string | null; cover_image_r2_key: string | null; parent_skus_v2: { cover_image_r2_key: string | null } | { cover_image_r2_key: string | null }[] | null };
async function buildImageMap(admin: ReturnType<typeof supabaseAdmin>, skus: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const list = skus.filter(Boolean);
  if (list.length === 0) return map;
  const { data } = await admin.from("skus_v2").select("code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", list);
  for (const r of (data ?? []) as SkuImgRow[]) {
    const p = Array.isArray(r.parent_skus_v2) ? r.parent_skus_v2[0] : r.parent_skus_v2;
    const key = r.cover_image_r2_key ?? p?.cover_image_r2_key ?? null;
    if (r.code && key) map[r.code] = key;
  }
  return map;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [sh, it, rs, wo, sc] = await Promise.all([
    admin.from("qc_shelves").select("id,name,kind,sort_order").eq("is_active", true).order("sort_order"),
    admin.from("qc_warehouse_items").select("id,shelf_id,wo_id,mo_no,sku,sku_name,worker,qty,status,reason,repair_by,source").order("created_at"),
    admin.from("qc_defect_reasons").select("id,name").eq("is_active", true).order("sort_order"),
    admin.from("mo_work_orders").select("id,mo_no,product_sku,product_name,assignee_name,assignee_id,assignee_type,received_qty,qc_pulled_qty,due_date").eq("is_active", true).gt("received_qty", 0),
    admin.from("qc_sources").select("id,name").eq("is_active", true).order("sort_order"),
  ]);
  const err = sh.error || it.error || rs.error || wo.error || sc.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  // รูป + แบรนด์ ต่อ SKU (จากของบนชั้น + งานในคิว)
  const skus = Array.from(new Set([...(it.data ?? []).map((i) => i.sku as string | null), ...(wo.data ?? []).map((w) => w.product_sku as string | null)].filter((s): s is string => !!s)));
  const [imgMap, brandMap] = await Promise.all([buildImageMap(admin, skus), buildBrandMap(admin, skus)]);

  // ช่างเหมา: assignee_id (craftsman) → employees.is_subcontract
  const assigneeIds = Array.from(new Set((wo.data ?? []).filter((w) => w.assignee_type === "craftsman" && w.assignee_id).map((w) => w.assignee_id as string)));
  const subMap: Record<string, boolean> = {};
  if (assigneeIds.length > 0) {
    const { data: emps } = await admin.from("employees").select("id, is_subcontract").in("id", assigneeIds);
    for (const e of (emps ?? []) as { id: string; is_subcontract: boolean | null }[]) subMap[e.id] = !!e.is_subcontract;
  }

  const items: QcItem[] = (it.data ?? []).map((i) => { const b = i.sku ? brandMap[i.sku as string] : undefined; return { ...(i as QcItem), image_key: i.sku ? imgMap[i.sku as string] ?? null : null, brand_color: b?.color ?? null, brand_name: b?.name ?? null, is_customer_job: b?.is_customer_job ?? false }; });
  const queue: QcQueueCard[] = (wo.data ?? []).map((w) => { const sku = w.product_sku as string | null; const b = sku ? brandMap[sku] : undefined; return {
    wo_id: w.id as string, mo_no: w.mo_no as string | null, sku,
    name: (w.product_name as string | null) ?? sku,
    worker: w.assignee_name as string | null,
    remaining: Number(w.received_qty ?? 0) - Number(w.qc_pulled_qty ?? 0),
    due_date: w.due_date as string | null,
    image_key: sku ? imgMap[sku] ?? null : null,
    brand_color: b?.color ?? null, brand_name: b?.name ?? null, is_customer_job: b?.is_customer_job ?? false,
    is_subcontract: w.assignee_type === "craftsman" && w.assignee_id ? subMap[w.assignee_id as string] ?? false : false,
  }; }).filter((q) => q.remaining > 0);

  return NextResponse.json({ shelves: sh.data ?? [], items, reasons: rs.data ?? [], sources: sc.data ?? [], queue, error: null });
}
