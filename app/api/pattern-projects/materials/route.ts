/**
 * GET /api/pattern-projects/materials — รายชื่อวัสดุให้เลือกติดกับชิ้นในสตูดิโอแพทเทิร์น   (pattern_studio.view)
 *   วัสดุชุดเดียวกับ "วัสดุตีราคา" ของใบงานออกแบบ (design_price_items) → ส่งชิ้นไปตีราคาแล้วจับคู่วัสดุได้ทันที
 *   ส่งเฉพาะ ชื่อ + ชนิด — **ไม่ส่งราคา** (ราคาอยู่หลังสิทธิ์ดูต้นทุน ที่ /api/design-sheets/price-items)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { PROJECT_PERM } from "@/lib/pattern-project-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.view); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("design_price_items")
    .select("id, name, grp:material_groups!material_group_id ( name )")
    .eq("is_active", true).order("name", { ascending: true }).limit(1000);
  if (error) return NextResponse.json({ data: [], error: "โหลดรายชื่อวัสดุไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const items = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const g = (Array.isArray(r.grp) ? r.grp[0] : r.grp) as { name?: string } | null;
    return { id: String(r.id), name: String(r.name), group: g?.name ?? null };
  });
  return NextResponse.json({ data: items, error: null });
}
