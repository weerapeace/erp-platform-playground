/**
 * โกดัง QC — อ่านสถานะบอร์ด (เฟส 1, ข้อมูลจริง)
 * GET /api/qc-warehouse → { shelves, items, reasons, queue }
 *  - queue = งานที่ช่างส่งคืนจากบอร์ดจ่ายงาน (mo_work_orders.received_qty - qc_pulled_qty > 0)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type QcShelf = { id: string; name: string; kind: "store" | "defect"; sort_order: number };
export type QcItem = {
  id: string; shelf_id: string; wo_id: string | null; mo_no: string | null;
  sku: string | null; sku_name: string | null; worker: string | null;
  qty: number; status: "good" | "defect" | "repairing"; reason: string | null; repair_by: string | null;
  source?: string | null;
  created_at?: string | null;    // วันที่ของเข้าชั้นนี้ = วันรับเข้า
  image_key?: string | null; brand_color?: string | null; brand_name?: string | null; is_customer_job?: boolean;
};
export type QcReason = { id: string; name: string };
export type QcSource = { id: string; name: string };
export type QcQueueCard = {
  wo_id: string; mo_no: string | null; sku: string | null; name: string | null;
  worker: string | null; remaining: number; due_date: string | null; image_key?: string | null;
  received_at?: string | null;   // วันที่ช่างส่งงานเข้ามาล่าสุด (จากใบส่งงาน) — โชว์เป็น "วันรับเข้า"
  brand_color?: string | null; brand_name?: string | null; is_customer_job?: boolean; is_subcontract?: boolean;
};
// "จ่ายไปที่โต๊ะ" — ใบจ่ายงานที่ยังทำอยู่ที่โต๊ะ (ยังไม่ส่งครบ/ยังไม่ done) โชว์เป็นพรีวิวในหน้า QC ช้อป
export type QcDeskCard = {
  id: string; wo_no: string | null; mo_no: string | null; sku: string | null; name: string | null;
  department_name: string | null; worker: string | null; qty: number; received_qty: number;
  status: string; due_date: string | null; image_key?: string | null; brand_color?: string | null;
  rate: number;   // ค่าแรงผลิต/ชิ้น (จาก labor_cost ÷ qty ที่จ่าย) — ใช้เติมค่าแรงตอนส่งงาน
};

type BrandInfo = { color: string | null; name: string | null; is_customer_job: boolean };
// แมป SKU → แบรนด์ (สี/ชื่อ/ธงงานลูกค้า) ผ่าน skus_v2.parent_sku_id → parent_skus_v2.brand_id → brands
async function buildBrandMap(admin: ReturnType<typeof supabaseAdmin>, skus: string[]): Promise<Record<string, BrandInfo>> {
  const map: Record<string, BrandInfo> = {};
  if (skus.length === 0) return map;
  const { data: sk } = await admin.from("skus_v2").select("code, parent_sku_id").in("code", skus).eq("is_active", true);
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
  const { data } = await admin.from("skus_v2").select("code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", list).eq("is_active", true);
  for (const r of (data ?? []) as SkuImgRow[]) {
    const p = Array.isArray(r.parent_skus_v2) ? r.parent_skus_v2[0] : r.parent_skus_v2;
    const key = r.cover_image_r2_key ?? p?.cover_image_r2_key ?? null;
    if (r.code && key) map[r.code] = key;
  }
  return map;
}

// ราคาแรงผลิต "กลาง" (ราคากลาง = ไม่ระบุช่าง, is_current) ต่อ SKU → เติมค่าแรงตอนส่งงาน
async function buildRateMap(admin: ReturnType<typeof supabaseAdmin>, skus: string[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (skus.length === 0) return map;
  const { data: boms } = await admin.from("bom_headers").select("product_sku, bom_code, updated_at").in("product_sku", skus).eq("is_active", true).order("updated_at", { ascending: false });
  const skuBom = new Map<string, string>();
  for (const b of (boms ?? []) as { product_sku: string | null; bom_code: string | null }[]) if (b.product_sku && b.bom_code && !skuBom.has(b.product_sku)) skuBom.set(b.product_sku, b.bom_code);
  const bomCodes = [...new Set([...skuBom.values()])];
  if (bomCodes.length === 0) return map;
  const { data: rates } = await admin.from("bom_labor_rates").select("bom_code, rate").in("bom_code", bomCodes).eq("is_active", true).eq("is_current", true).is("craftsman_id", null);
  const bomRate = new Map<string, number>();
  for (const r of (rates ?? []) as { bom_code: string | null; rate: number | null }[]) if (r.bom_code && bomRate.get(r.bom_code) == null) bomRate.set(r.bom_code, Number(r.rate) || 0);
  for (const [sku, bom] of skuBom) { const rr = bomRate.get(bom); if (rr != null) map[sku] = rr; }
  return map;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  // ?only=queue → เอาเฉพาะ "คิวรอ QC รับเข้า" + ชั้น + สาเหตุ (ใช้ที่บอร์ดจ่ายงาน section รับเข้า QC)
  //   ไม่ต้องลากของบนชั้นทั้งโกดัง/งานในโต๊ะมาด้วย — หน้าบอร์ดจะได้ไม่หน่วง
  const onlyQueue = (new URL(request.url).searchParams.get("only") ?? "") === "queue";
  const noRows = { data: [] as Record<string, unknown>[], error: null };
  const [sh, it, rs, wo, sc, ad] = await Promise.all([
    admin.from("qc_shelves").select("id,name,kind,sort_order").eq("is_active", true).order("sort_order"),
    onlyQueue ? Promise.resolve(noRows) : admin.from("qc_warehouse_items").select("id,shelf_id,wo_id,mo_no,sku,sku_name,worker,qty,status,reason,repair_by,source,created_at").order("created_at").limit(10000),   // กันโตแบบไร้เพดาน (เดิมไม่มี limit)
    admin.from("qc_defect_reasons").select("id,name").eq("is_active", true).order("sort_order"),
    admin.from("mo_work_orders").select("id,mo_no,product_sku,product_name,assignee_name,assignee_id,assignee_type,received_qty,qc_pulled_qty,due_date").eq("is_active", true).gt("received_qty", 0),
    onlyQueue ? Promise.resolve(noRows) : admin.from("qc_sources").select("id,name").eq("is_active", true).order("sort_order"),
    // "จ่ายไปที่โต๊ะ" — ใบจ่ายงาน active ที่ยังไม่ done (ยังทำ/ส่งไม่ครบที่โต๊ะ)
    onlyQueue ? Promise.resolve(noRows) : admin.from("mo_work_orders").select("id,wo_no,mo_no,product_sku,product_name,department_name,assignee_name,qty,received_qty,status,due_date,labor_cost").eq("is_active", true).neq("status", "done"),
  ]);
  const err = sh.error || it.error || rs.error || wo.error || sc.error || ad.error;
  if (err) return NextResponse.json({ error: friendlyDbError(err.message) }, { status: 500 });

  // รูป + แบรนด์ ต่อ SKU (จากของบนชั้น + งานในคิว + งานในโต๊ะ)
  const skus = Array.from(new Set([...(it.data ?? []).map((i) => i.sku as string | null), ...(wo.data ?? []).map((w) => w.product_sku as string | null), ...(ad.data ?? []).map((w) => w.product_sku as string | null)].filter((s): s is string => !!s)));
  const [imgMap, brandMap, rateMap] = await Promise.all([buildImageMap(admin, skus), buildBrandMap(admin, skus), onlyQueue ? Promise.resolve({} as Record<string, number>) : buildRateMap(admin, skus)]);

  // ช่างเหมา: assignee_id (craftsman) → employees.is_subcontract
  const assigneeIds = Array.from(new Set((wo.data ?? []).filter((w) => w.assignee_type === "craftsman" && w.assignee_id).map((w) => w.assignee_id as string)));
  const subMap: Record<string, boolean> = {};
  if (assigneeIds.length > 0) {
    const { data: emps } = await admin.from("employees").select("id, is_subcontract").in("id", assigneeIds);
    for (const e of (emps ?? []) as { id: string; is_subcontract: boolean | null }[]) subMap[e.id] = !!e.is_subcontract;
  }

  const items: QcItem[] = (it.data ?? []).map((i) => { const b = i.sku ? brandMap[i.sku as string] : undefined; return { ...(i as QcItem), image_key: i.sku ? imgMap[i.sku as string] ?? null : null, brand_color: b?.color ?? null, brand_name: b?.name ?? null, is_customer_job: b?.is_customer_job ?? false }; });
  // วันรับเข้า = วันที่ช่างส่งงานเข้ามาล่าสุดของใบนั้น (ใบส่งงาน wo_submissions)
  const woIds = Array.from(new Set((wo.data ?? []).map((w) => String(w.id))));
  const lastSubBy: Record<string, string> = {};
  if (woIds.length > 0) {
    const { data: subs } = await admin.from("wo_submissions")
      .select("wo_id, submitted_at").in("wo_id", woIds).order("submitted_at", { ascending: true }).limit(5000);
    for (const r of (subs ?? []) as { wo_id: string | null; submitted_at: string | null }[]) {
      if (r.wo_id && r.submitted_at) lastSubBy[String(r.wo_id)] = String(r.submitted_at);   // เรียงเก่า→ใหม่ ตัวท้ายคือล่าสุด
    }
  }

  const queue: QcQueueCard[] = (wo.data ?? []).map((w) => { const sku = w.product_sku as string | null; const b = sku ? brandMap[sku] : undefined; return {
    wo_id: w.id as string, mo_no: w.mo_no as string | null, sku,
    name: (w.product_name as string | null) ?? sku,
    worker: w.assignee_name as string | null,
    remaining: Number(w.received_qty ?? 0) - Number(w.qc_pulled_qty ?? 0),
    due_date: w.due_date as string | null,
    received_at: lastSubBy[String(w.id)] ?? null,
    image_key: sku ? imgMap[sku] ?? null : null,
    brand_color: b?.color ?? null, brand_name: b?.name ?? null, is_customer_job: b?.is_customer_job ?? false,
    is_subcontract: w.assignee_type === "craftsman" && w.assignee_id ? subMap[w.assignee_id as string] ?? false : false,
  }; }).filter((q) => q.remaining > 0);

  const atDesks: QcDeskCard[] = (ad.data ?? []).map((w) => { const sku = w.product_sku as string | null; const b = sku ? brandMap[sku] : undefined; return {
    id: w.id as string, wo_no: w.wo_no as string | null, mo_no: w.mo_no as string | null, sku,
    name: (w.product_name as string | null) ?? sku, department_name: w.department_name as string | null,
    worker: w.assignee_name as string | null, qty: Number(w.qty ?? 0), received_qty: Number(w.received_qty ?? 0),
    status: (w.status as string) ?? "dispatched", due_date: w.due_date as string | null,
    image_key: sku ? imgMap[sku] ?? null : null, brand_color: b?.color ?? null,
    // ค่าแรง/ชิ้น: ราคากลางจาก BOM ก่อน · ไม่มีค่อยถอดจาก labor_cost ที่ตั้งไว้ตอนจ่าย
    rate: (sku && rateMap[sku] > 0) ? rateMap[sku] : (Number(w.qty) > 0 && w.labor_cost != null ? Math.round((Number(w.labor_cost) / Number(w.qty)) * 100) / 100 : 0),
  }; });

  return NextResponse.json({ shelves: sh.data ?? [], items, reasons: rs.data ?? [], sources: sc.data ?? [], queue, atDesks, error: null });
}
