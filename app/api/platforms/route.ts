/**
 * /api/platforms — จัดการ "ร้าน/แพลตฟอร์ม" ระบบรวม (erp_platforms)
 *   GET   → ทุกแพลตฟอร์ม (รวมที่ปิดอยู่) เรียงตาม sort_order   (products.platforms.view)
 *   PATCH { id, is_active }        → เปิด/ปิดการแสดง            (products.platforms.manage_accounts)
 *   PATCH { order: [id,...] }      → เรียงลำดับใหม่ (sort_order ตาม index)
 * มีผลกับทุกที่ที่ดึง "แพลตฟอร์มที่เปิดใช้" (แท็บแพลตฟอร์มของสินค้า, ตัวจัดการลงขาย ฯลฯ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("erp_platforms")
    .select("id, code, name_th, icon_key, color, theme_color, is_active, sort_order")
    .order("sort_order", { ascending: true }).order("name_th", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  let b: { id?: string; is_active?: boolean; order?: string[] };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();

  // เรียงลำดับใหม่ทั้งชุด
  if (Array.isArray(b.order)) {
    for (let i = 0; i < b.order.length; i++) {
      const { error } = await admin.from("erp_platforms").update({ sort_order: i }).eq("id", b.order[i]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, error: null });
  }

  // เปิด/ปิดการแสดง
  if (!b.id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const { error } = await admin.from("erp_platforms").update({ is_active: b.is_active !== false }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
