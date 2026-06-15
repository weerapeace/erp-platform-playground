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

// กลุ่มวัสดุ (สำหรับตีราคาแบบ "กลุ่ม") — ราคาเฉลี่ยจากวัสดุในกลุ่ม + ราคาตั้ง + ราคาซื้อจริงล่าสุด (GR→PO)
export type PriceGroup = {
  code: string; name: string;
  calc_method: string | null; loss_percent: number | null; divisor: number | null; uom_default: string | null;
  avg_price: number | null; set_price: number | null; item_count: number;
  latest_price: number | null; latest_currency: string | null;   // ราคา PO ของรายการที่รับล่าสุด (สกุลตามจริง)
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
  const admin = supabaseAdmin();
  // กลุ่มวัสดุ + ราคาเฉลี่ย (จากวัสดุในกลุ่ม) + ราคาตั้ง + สินค้าตัวแทน (ref_sku_ids)
  const { data: grpData } = await admin.from("material_groups")
    .select("code, name, calc_method, loss_percent, divisor, uom_default, set_price, ref_sku_ids")
    .eq("is_active", true).order("sort_order", { ascending: true });

  // ราคาซื้อจริงล่าสุด (GR→PO) ต่อ SKU ตัวแทน: ใบรับล่าสุด (receive_date) → ราคาในบรรทัด PO
  const allRefSkus = [...new Set(((grpData ?? []) as Array<Record<string, unknown>>)
    .flatMap((g) => (Array.isArray(g.ref_sku_ids) ? (g.ref_sku_ids as string[]) : [])))];
  const latestBySku = new Map<string, { price: number | null; currency: string | null; date: string }>();
  if (allRefSkus.length) {
    const { data: grl } = await admin.from("goods_receipt_lines_v2")
      .select("item_sku_id, gr_id, po_line_id, created_at")
      .in("item_sku_id", allRefSkus).eq("is_active", true).not("po_line_id", "is", null);
    const lines = (grl ?? []) as Array<Record<string, unknown>>;
    const grIds = [...new Set(lines.map((l) => String(l.gr_id)))];
    const polIds = [...new Set(lines.map((l) => String(l.po_line_id)))];
    const [{ data: grs }, { data: pols }] = await Promise.all([
      grIds.length ? admin.from("goods_receipts_v2").select("id, receive_date, is_active").in("id", grIds) : Promise.resolve({ data: [] }),
      polIds.length ? admin.from("purchase_order_lines_v2").select("id, price_est, currency").in("id", polIds) : Promise.resolve({ data: [] }),
    ]);
    const grMap = new Map((grs ?? []).map((g: Record<string, unknown>) => [String(g.id), g]));
    const polMap = new Map((pols ?? []).map((p: Record<string, unknown>) => [String(p.id), p]));
    for (const l of lines) {
      const gr = grMap.get(String(l.gr_id)); if (!gr || gr.is_active === false) continue;
      const pol = polMap.get(String(l.po_line_id)); if (!pol) continue;
      const date = (gr.receive_date as string) || (l.created_at as string) || "";
      const sku = String(l.item_sku_id);
      const prev = latestBySku.get(sku);
      if (!prev || date > prev.date) {
        latestBySku.set(sku, { price: pol.price_est != null ? Number(pol.price_est) : null, currency: (pol.currency as string) ?? null, date });
      }
    }
  }
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
    // ราคาซื้อจริงล่าสุดของกลุ่ม = ตัวที่รับล่าสุด ในบรรดา SKU ตัวแทนของกลุ่ม
    const refs = Array.isArray(g.ref_sku_ids) ? (g.ref_sku_ids as string[]) : [];
    let latest: { price: number | null; currency: string | null; date: string } | null = null;
    for (const sku of refs) {
      const e = latestBySku.get(sku);
      if (e && (!latest || e.date > latest.date)) latest = e;
    }
    return {
      code, name: String(g.name),
      calc_method: (g.calc_method as string) ?? null,
      loss_percent: g.loss_percent != null ? Number(g.loss_percent) : null,
      divisor: g.divisor != null ? Number(g.divisor) : null,
      uom_default: (g.uom_default as string) ?? null,
      avg_price: agg && agg.n > 0 ? Math.round((agg.sum / agg.n) * 100) / 100 : null,
      set_price: g.set_price != null ? Number(g.set_price) : null,
      item_count: agg?.n ?? 0,
      latest_price: latest?.price ?? null, latest_currency: latest?.currency ?? null,
    };
  });

  return NextResponse.json({ data: items, groups, error: null });
}
