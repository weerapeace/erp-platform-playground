/**
 * POST /api/skus/for-print  body { ids: string[], entity?: "skus" | "parent-skus" }
 *   → { data: [{ id, code, barcode, name, price }] } เรียงตามลำดับ ids ที่ส่งมา
 *
 * ใช้กับระบบพิมพ์บาร์โค้ด/QR แบบ batch — ดึงเฉพาะฟิลด์ที่ต้องพิมพ์
 * (Parent SKU ไม่มีช่อง barcode/ราคา → ใช้ code เป็นบาร์โค้ด, ราคา = null)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PrintSku = { id: string; code: string; barcode: string; name: string; price: number | null; brandLogo: string | null };

const uniq = (arr: (string | null | undefined)[]): string[] => [...new Set(arr.filter(Boolean) as string[])];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  let body: { ids?: string[]; entity?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ids = (body.ids ?? []).filter(Boolean).slice(0, 5000);
  if (ids.length === 0) return NextResponse.json({ data: [], error: null });

  const isParent = body.entity === "parent-skus";
  const admin = supabaseAdmin();
  const table = isParent ? "parent_skus_v2" : "skus_v2";
  const sel = isParent ? "id, code, name_th, brand_id" : "id, code, name_th, barcode, list_price, parent_sku_id";

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await admin.from(table).select(sel).in("id", ids.slice(i, i + 1000));
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) rows.push(r);
  }

  // resolve โลโก้แบรนด์: SKU → parent_sku_id → brand_id → brands.logo_url (Parent มี brand_id ตรง ๆ)
  const parentBrand = new Map<string, string>();   // parent_sku_id → brand_id
  if (!isParent) {
    const pids = uniq(rows.map((r) => r.parent_sku_id as string | null));
    for (let i = 0; i < pids.length; i += 1000) {
      const { data } = await admin.from("parent_skus_v2").select("id, brand_id").in("id", pids.slice(i, i + 1000));
      for (const p of (data ?? []) as { id: string; brand_id: string | null }[]) if (p.brand_id) parentBrand.set(p.id, p.brand_id);
    }
  }
  const brandIds = isParent
    ? uniq(rows.map((r) => r.brand_id as string | null))
    : uniq([...parentBrand.values()]);
  const brandLogo = new Map<string, string>();     // brand_id → logo_url (R2 key)
  if (brandIds.length) {
    const { data } = await admin.from("brands").select("id, logo_url").in("id", brandIds);
    for (const b of (data ?? []) as { id: string; logo_url: string | null }[]) if (b.logo_url) brandLogo.set(b.id, b.logo_url);
  }

  const found = new Map<string, PrintSku>();
  for (const r of rows) {
    const code = String(r.code ?? "");
    const brandId = isParent ? (r.brand_id as string | null) : parentBrand.get(String(r.parent_sku_id ?? "")) ?? null;
    found.set(String(r.id), {
      id: String(r.id), code,
      barcode: isParent ? code : ((r.barcode as string | null)?.trim() || code),
      name: (r.name_th as string | null) ?? "",
      price: isParent ? null : ((r.list_price as number | null) ?? null),
      brandLogo: brandId ? (brandLogo.get(brandId) ?? null) : null,
    });
  }
  // เรียงตามลำดับที่เลือกมา
  const data = ids.map((id) => found.get(id)).filter(Boolean) as PrintSku[];
  return NextResponse.json({ data, error: null });
}
