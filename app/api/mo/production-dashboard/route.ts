/**
 * Dashboard ผลิต — ข้อมูลงานผลิตทุกสถานะ (MO-centric) — /api/mo/production-dashboard
 * GET → { counts, jobs }
 *   jobs[] = 1 แถว/1 ใบสั่งผลิต + categories[] (อยู่ได้หลายกลุ่ม) + ความคืบหน้า (จ่าย/รับคืน)
 *   counts = ตัวเลขนับต่อ filter ซ้าย (all/unassigned/in_production/piecework/done_waiting)
 * นิยาม: ยังไม่จ่าย=เหลือจ่าย>0 · กำลังผลิต=จ่ายแล้วยังรับคืนไม่ครบ · เหมา=มี mo_piecework · เสร็จรอส่ง=รับคืนครบ (wo_submissions→received_qty)
 * ยิงครั้งเดียว (3 query หลัก) · ของกลาง guardApi(products.view)+supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

// รูป/แบรนด์ต่อ SKU (mirror ของ /api/mo/work-board — pure helper, ถ้าจะใช้ซ้ำที่ 3 แห่งค่อยแยกเป็น lib)
type SkuInfo = { image_url: string | null; brand: string | null; brand_color: string | null };
async function skuInfoMap(admin: ReturnType<typeof supabaseAdmin>, skus: string[]): Promise<Map<string, SkuInfo>> {
  const map = new Map<string, SkuInfo>();
  const list = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < list.length; i += 300) {
    const chunk = list.slice(i, i + 300);
    const { data } = await admin.from("skus_v2")
      .select("code, cover_image_r2_key, parent:parent_skus_v2!parent_sku_id ( brand:brands!brand_id ( name, color ) )")
      .in("code", chunk);
    for (const s of (data ?? []) as Record<string, unknown>[]) {
      const parent = (Array.isArray(s.parent) ? s.parent[0] : s.parent) as { brand?: unknown } | null;
      const brand = (parent && (Array.isArray(parent.brand) ? parent.brand[0] : parent.brand)) as { name?: string; color?: string } | null;
      const key = s.cover_image_r2_key as string | null;
      map.set(String(s.code), { image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null, brand: brand?.name ?? null, brand_color: brand?.color ?? null });
    }
  }
  return map;
}

export type ProdJobCategory = "unassigned" | "in_production" | "piecework" | "done_waiting";
export type ProductionJob = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  image_url: string | null; brand: string | null; brand_color: string | null;
  qty: number; dispatched: number; received: number; remaining: number;
  progress_pct: number;                 // รับคืนแล้วกี่ % ของจำนวน
  due_date: string | null; status: string | null;
  categories: ProdJobCategory[];
  dept_names: string | null;            // โต๊ะ/แผนกที่กำลังทำ (รวมชื่อ)
  worker_names: string | null;          // ช่างที่รับงาน (รวมชื่อ)
  piecework: boolean;
};
export type ProductionDashboardResponse = {
  counts: { all: number; unassigned: number; in_production: number; piecework: number; done_waiting: number };
  jobs: ProductionJob[];
  error: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const [{ data: mos }, { data: wos }, { data: pcs }] = await Promise.all([
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, status, due_date, created_at")
      .eq("is_active", true).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1000),
    admin.from("mo_work_orders").select("mo_no, qty, received_qty, status, department_name, assignee_name").eq("is_active", true).limit(3000),
    admin.from("mo_piecework").select("mo_no").eq("is_active", true).limit(3000),
  ]);

  const moList = (mos ?? []) as Record<string, unknown>[];
  const workOrders = (wos ?? []) as Record<string, unknown>[];

  // รวมยอดต่อ MO: จ่ายแล้ว / รับคืนแล้ว / โต๊ะ / ช่าง
  const dispatchedByMo = new Map<string, number>();
  const receivedByMo = new Map<string, number>();
  const deptsByMo = new Map<string, Set<string>>();
  const workersByMo = new Map<string, Set<string>>();
  for (const w of workOrders) {
    if (w.status === "cancelled") continue;
    const k = String(w.mo_no);
    dispatchedByMo.set(k, (dispatchedByMo.get(k) ?? 0) + (Number(w.qty) || 0));
    receivedByMo.set(k, (receivedByMo.get(k) ?? 0) + (Number(w.received_qty) || 0));
    const dn = (w.department_name as string) ?? ""; if (dn) (deptsByMo.get(k) ?? deptsByMo.set(k, new Set()).get(k)!).add(dn);
    const an = (w.assignee_name as string) ?? ""; if (an) (workersByMo.get(k) ?? workersByMo.set(k, new Set()).get(k)!).add(an);
  }
  const pieceworkMo = new Set<string>();
  for (const p of (pcs ?? []) as Record<string, unknown>[]) pieceworkMo.add(String(p.mo_no));

  const info = await skuInfoMap(admin, moList.map((m) => m.product_sku as string).filter(Boolean) as string[]);

  const counts = { all: 0, unassigned: 0, in_production: 0, piecework: 0, done_waiting: 0 };
  const jobs: ProductionJob[] = moList.map((m) => {
    const moNo = String(m.mo_no);
    const qty = Number(m.qty) || 0;
    const dispatched = r2(dispatchedByMo.get(moNo) ?? 0);
    const received = r2(receivedByMo.get(moNo) ?? 0);
    const remaining = r2(Math.max(0, qty - dispatched));
    const categories: ProdJobCategory[] = [];
    if (remaining > 0.0001) categories.push("unassigned");
    if (dispatched - received > 0.0001) categories.push("in_production");
    if (pieceworkMo.has(moNo)) categories.push("piecework");
    if (qty > 0 && received >= qty - 0.0001) categories.push("done_waiting");
    const inf = info.get(String(m.product_sku)) ?? { image_url: null, brand: null, brand_color: null };
    counts.all += 1;
    if (categories.includes("unassigned")) counts.unassigned += 1;
    if (categories.includes("in_production")) counts.in_production += 1;
    if (categories.includes("piecework")) counts.piecework += 1;
    if (categories.includes("done_waiting")) counts.done_waiting += 1;
    return {
      id: String(m.id), mo_no: moNo, product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null,
      ...inf, qty, dispatched, received, remaining,
      progress_pct: qty > 0 ? Math.min(100, Math.round((received / qty) * 100)) : 0,
      due_date: (m.due_date as string) ?? null, status: (m.status as string) ?? null,
      categories, dept_names: deptsByMo.get(moNo) ? [...deptsByMo.get(moNo)!].join(", ") : null,
      worker_names: workersByMo.get(moNo) ? [...workersByMo.get(moNo)!].join(", ") : null,
      piecework: pieceworkMo.has(moNo),
    };
  });

  return NextResponse.json({ counts, jobs, error: null } as ProductionDashboardResponse);
}
