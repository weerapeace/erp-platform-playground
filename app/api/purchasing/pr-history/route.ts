/**
 * GET /api/purchasing/pr-history
 * ประวัติใบขอซื้อ (PR v2) ล่าสุดทั้งหมด + สถานะ — สำหรับป๊อป "ประวัติการขอซื้อ" หน้าขอซื้อ
 * join skus_v2 เอา code + รูปปก · เรียงใหม่สุดก่อน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: prs, error } = await admin
    .from("purchase_requests_v2")
    .select("id, seller_name, item_sku_id, item_name, qty, uom, price_est, currency, order_date, requester, status, image_key, reject_reason, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const skuIds = [...new Set((prs ?? []).map((p) => p.item_sku_id).filter(Boolean) as string[])];
  const skuMap = new Map<string, { code: string | null; cover: string | null }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, cover_image_r2_key").in("id", skuIds.slice(i, i + 300));
    for (const s of (sk ?? []) as Record<string, unknown>[]) skuMap.set(String(s.id), { code: (s.code as string) ?? null, cover: (s.cover_image_r2_key as string) ?? null });
  }

  const rows = (prs ?? []).map((p) => {
    const sk = p.item_sku_id ? skuMap.get(String(p.item_sku_id)) : null;
    const key = sk?.cover ?? p.image_key ?? null;
    return {
      id: String(p.id),
      seller_name: p.seller_name ?? "—",
      item_name: p.item_name ?? "",
      code: sk?.code ?? "",
      image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
      qty: num(p.qty),
      uom: (p.uom as string) || "",
      price_est: num(p.price_est),
      line_total: num(p.qty) * num(p.price_est),
      currency: p.currency ?? "THB",
      order_date: p.order_date ?? null,
      created_at: p.created_at ?? null,
      requester: p.requester ?? "",
      status: p.status ?? "",
      reject_reason: p.reject_reason ?? null,
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
