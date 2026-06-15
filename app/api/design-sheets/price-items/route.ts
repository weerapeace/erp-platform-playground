/**
 * Design Sheets — รายการวัสดุตีราคา (เฟส 4)
 *
 * GET /api/design-sheets/price-items → วัสดุที่ใช้งานอยู่ + ข้อมูลกลุ่ม (วิธีคำนวณ/เผื่อเสีย/ตัวหาร/หน่วย)
 * (การเพิ่ม/แก้วัสดุ ทำที่หน้า master กลาง /master/design-price-items)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PriceItem = {
  id: string; code: string | null; name: string;
  price_per_unit: number | null; uom: string | null; face_width_cm: number | null;
  width_cm: number | null; length_cm: number | null;
  group_name: string | null; group_code: string | null; calc_method: string | null; loss_percent: number | null; divisor: number | null; uom_default: string | null;
};

// กลุ่มวัสดุ (สำหรับตีราคาแบบ "กลุ่ม") — ราคาเฉลี่ยจากวัสดุในกลุ่ม + ราคาตั้ง
export type PriceGroup = {
  code: string; name: string;
  calc_method: string | null; loss_percent: number | null; divisor: number | null; uom_default: string | null;
  avg_price: number | null; set_price: number | null; item_count: number;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("design_price_items")
    .select("id, code, name, price_per_unit, uom, face_width_cm, width_cm, length_cm, grp:material_groups!material_group_id ( code, name, calc_method, loss_percent, divisor, uom_default )")
    .eq("is_active", true).order("name", { ascending: true }).limit(1000);
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });

  const items: PriceItem[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const g = (Array.isArray(r.grp) ? r.grp[0] : r.grp) as Record<string, unknown> | null;
    return {
      id: String(r.id), code: (r.code as string) ?? null, name: String(r.name),
      price_per_unit: r.price_per_unit != null ? Number(r.price_per_unit) : null,
      uom: (r.uom as string) ?? null,
      face_width_cm: r.face_width_cm != null ? Number(r.face_width_cm) : null,
      width_cm: r.width_cm != null ? Number(r.width_cm) : null,
      length_cm: r.length_cm != null ? Number(r.length_cm) : null,
      group_name: (g?.name as string) ?? null,
      group_code: (g?.code as string) ?? null,
      calc_method: (g?.calc_method as string) ?? null,
      loss_percent: g?.loss_percent != null ? Number(g.loss_percent) : null,
      divisor: g?.divisor != null ? Number(g.divisor) : null,
      uom_default: (g?.uom_default as string) ?? null,
    };
  });
  // กลุ่มวัสดุ + ราคาเฉลี่ย (จากวัสดุในกลุ่ม) + ราคาตั้ง
  const { data: grpData } = await supabaseAdmin().from("material_groups")
    .select("code, name, calc_method, loss_percent, divisor, uom_default, set_price")
    .eq("is_active", true).order("sort_order", { ascending: true });
  // เฉลี่ยราคาต่อกลุ่ม จาก items ที่ดึงมาแล้ว
  const sumByGroup = new Map<string, { sum: number; n: number }>();
  for (const it of items) {
    if (it.group_code && it.price_per_unit != null) {
      const e = sumByGroup.get(it.group_code) ?? { sum: 0, n: 0 };
      e.sum += it.price_per_unit; e.n += 1; sumByGroup.set(it.group_code, e);
    }
  }
  const groups: PriceGroup[] = ((grpData ?? []) as Array<Record<string, unknown>>).map((g) => {
    const code = String(g.code);
    const agg = sumByGroup.get(code);
    return {
      code, name: String(g.name),
      calc_method: (g.calc_method as string) ?? null,
      loss_percent: g.loss_percent != null ? Number(g.loss_percent) : null,
      divisor: g.divisor != null ? Number(g.divisor) : null,
      uom_default: (g.uom_default as string) ?? null,
      avg_price: agg && agg.n > 0 ? Math.round((agg.sum / agg.n) * 100) / 100 : null,
      set_price: g.set_price != null ? Number(g.set_price) : null,
      item_count: agg?.n ?? 0,
    };
  });

  return NextResponse.json({ data: items, groups, error: null });
}
