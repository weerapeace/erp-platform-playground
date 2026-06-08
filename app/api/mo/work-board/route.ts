/**
 * ข้อมูลบอร์ดจ่ายงาน (whiteboard) — เฟส D (รื้อใหม่)
 * GET /api/mo/work-board
 *   → departments: โซนแผนก
 *   → workOrders: ใบจ่ายงาน active (+ แบรนด์/สี/รูป/แผนก) — ซ่อน done ฝั่ง client
 *   → pending: ใบสั่งผลิตที่ยังจ่ายไม่ครบ (การ์ดโซน "รอจ่าย") + ยอดจ่ายแล้ว/เหลือ
 * อ่านผ่าน supabaseAdmin + guardApi (join ข้ามตาราง master)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

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
      map.set(String(s.code), {
        image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
        brand: brand?.name ?? null, brand_color: brand?.color ?? null,
      });
    }
  }
  return map;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const [{ data: depts }, { data: wos }, { data: mos }] = await Promise.all([
    admin.from("departments").select("id, name, status, display_order").order("display_order", { ascending: true, nullsFirst: false }).order("name", { ascending: true }),
    admin.from("mo_work_orders").select("*").eq("is_active", true).order("created_at", { ascending: true }).limit(2000),
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, status, due_date").eq("is_active", true).not("status", "in", "(cancelled,done)").limit(1000),
  ]);

  const departments = (depts ?? []).filter((d: Record<string, unknown>) => !d.status || d.status === "active")
    .map((d: Record<string, unknown>) => ({ id: String(d.id), name: (d.name as string) ?? "—" }));

  const workOrders = (wos ?? []) as Record<string, unknown>[];

  // ยอดจ่ายแล้วต่อ MO (ไม่นับยกเลิก) → คำนวณ "เหลือจ่าย"
  const dispatchedByMo = new Map<string, number>();
  for (const w of workOrders) {
    if (w.status === "cancelled") continue;
    const k = String(w.mo_no);
    dispatchedByMo.set(k, (dispatchedByMo.get(k) ?? 0) + (Number(w.qty) || 0));
  }

  // เสริม แบรนด์/สี/รูป
  const allSkus = [...workOrders.map((w) => w.product_sku as string), ...(mos ?? []).map((m: Record<string, unknown>) => m.product_sku as string)];
  const info = await skuInfoMap(admin, allSkus.filter(Boolean) as string[]);

  const enrichedWO = workOrders.map((w) => {
    const inf = info.get(String(w.product_sku)) ?? { image_url: null, brand: null, brand_color: null };
    return { ...w, ...inf };
  });

  const pending = (mos ?? []).map((m: Record<string, unknown>) => {
    const qty = Number(m.qty) || 0;
    const dispatched = dispatchedByMo.get(String(m.mo_no)) ?? 0;
    const remaining = r2(Math.max(0, qty - dispatched));
    const inf = info.get(String(m.product_sku)) ?? { image_url: null, brand: null, brand_color: null };
    return { id: String(m.id), mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name,
      qty, dispatched: r2(dispatched), remaining, due_date: m.due_date ?? null, status: m.status, ...inf };
  }).filter((m) => m.remaining > 0.0001);   // ซ่อน MO ที่จ่ายครบแล้ว

  return NextResponse.json({ departments, workOrders: enrichedWO, pending, error: null });
}
