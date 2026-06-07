/**
 * POST /api/purchasing/taobao-shop — หา "หรือสร้าง" ร้านกลาง Taobao (idempotent)
 * คืน { id, name } ของพาร์ทเนอร์ Taobao (is_supplier + is_taobao, สกุล RMB)
 * ใช้กับปุ่มลัด "🛒 Taobao" ในป๊อปตั้งร้าน/แก้ไขรายการ
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const admin = supabaseAdmin();

  // หาร้าน Taobao ที่มีอยู่แล้ว (ชื่อ Taobao + is_taobao)
  const { data: ex } = await admin.from("partners_v2")
    .select("id, display_name, name_th")
    .eq("is_supplier", true).eq("is_taobao", true)
    .or("display_name.ilike.taobao,name_th.ilike.taobao")
    .limit(1).maybeSingle();
  if (ex) {
    const r = ex as Record<string, unknown>;
    return NextResponse.json({ data: { id: String(r.id), name: String(r.display_name || r.name_th || "Taobao") }, error: null });
  }

  // ยังไม่มี → สร้างให้ครั้งเดียว
  const { data, error } = await admin.from("partners_v2").insert({
    is_supplier: true, is_customer: false, is_company: true, is_active: true, is_taobao: true,
    display_name: "Taobao", name_th: "Taobao", default_currency: "RMB", shop_country: "จีน", tags: [],
  }).select("id, display_name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = data as Record<string, unknown>;
  return NextResponse.json({ data: { id: String(r.id), name: String(r.display_name || "Taobao") }, error: null });
}
