/**
 * GET /api/purchasing/rejected
 * รายการใบขอซื้อ (PR v2) ที่ "ไม่อนุมัติ (rejected)" — สำหรับแท็บ "ไม่อนุมัติ" ในหน้าสั่งซื้อ
 * join skus_v2 เอา code + รูปปก · โชว์เหตุผล + ผู้กด + เวลา ไว้ตรวจ/กู้คืน
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

  // โหมดนับอย่างเดียว (?count=1) — ไว้โชว์ตัวเลขบนปุ่ม "รายการไม่อนุมัติ" โดยไม่ลากข้อมูลทั้งหมด
  if (new URL(request.url).searchParams.get("count") === "1") {
    const { count, error: cErr } = await admin
      .from("purchase_requests_v2").select("id", { count: "exact", head: true })
      .eq("status", "rejected").eq("is_active", true).is("po_id", null);
    if (cErr) return NextResponse.json({ count: 0, error: cErr.message }, { status: 500 });
    return NextResponse.json({ count: count ?? 0, error: null });
  }

  const { data: prs, error } = await admin
    .from("purchase_requests_v2")
    .select("id, seller_name, item_sku_id, item_name, qty, uom, price_est, currency, order_date, requester, status, image_key, reject_reason, approved_by, approved_at")
    .eq("status", "rejected").eq("is_active", true).is("po_id", null)
    .order("approved_at", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const skuIds = [...new Set((prs ?? []).map((p) => p.item_sku_id).filter(Boolean) as string[])];
  const skuMap = new Map<string, { code: string | null; cover: string | null; name: string | null }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, cover_image_r2_key, name_th").in("id", skuIds.slice(i, i + 300));
    for (const s of (sk ?? []) as Record<string, unknown>[]) skuMap.set(String(s.id), { code: (s.code as string) ?? null, cover: (s.cover_image_r2_key as string) ?? null, name: (s.name_th as string) ?? null });
  }

  const rows = (prs ?? []).map((p) => {
    const sk = p.item_sku_id ? skuMap.get(String(p.item_sku_id)) : null;
    const key = sk?.cover ?? p.image_key ?? null;
    return {
      id: String(p.id),
      item_sku_id: p.item_sku_id ?? null,
      seller_name: p.seller_name ?? "—",
      // ข้อ 3: โชว์ชื่อสดจากทะเบียน SKU (เปลี่ยนชื่อ SKU แล้วสะท้อนที่นี่) — ไม่มี SKU ผูก → ใช้ชื่อสำเนาเดิม
      item_name: sk?.name ?? p.item_name ?? "",
      code: sk?.code ?? "",
      qty: num(p.qty), uom: (p.uom as string) || "",
      price_est: num(p.price_est), line_total: num(p.qty) * num(p.price_est),
      currency: p.currency ?? "THB",
      order_date: p.order_date ?? null,
      requester: p.requester ?? "",
      reject_reason: p.reject_reason ?? "",
      rejected_by: p.approved_by ?? "",
      rejected_at: p.approved_at ?? null,
      image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
