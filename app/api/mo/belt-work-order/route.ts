/**
 * ใบงานเข็มขัด (เฟส 1) — รวมหลายใบสั่งผลิต (MO) รุ่นเดียวกันเป็น "ตารางไซส์รวม"
 * GET /api/mo/belt-work-order?mos=MO-2026-00069,MO-2026-00070
 *   → หัว: แบรนด์ (จาก Parent SKU) + รุ่น + กำหนดส่ง
 *   → ตารางไซส์: แถว = แต่ละ MO (สี/หนัง), คอลัมน์ = ไซส์ทุกตัวที่เจอ, + แถวรวม
 * ของกลาง: supabaseAdmin + guardApi · อ่านอย่างเดียว (ไม่แตะข้อมูล)
 * สเปก (รู/ห่วง/ปลายหาง/พิมพ์) ฝั่งหน้าพิมพ์ดึงจาก /api/product-spec แยก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BeltWoRow = { mo_no: string; product_sku: string; label: string; by_size: Record<string, number>; total: number };
export type BeltWorkOrder = {
  mos: string[];
  brand: string | null;
  parent_code: string | null;
  parent_name: string | null;
  due_dates: string[];
  sizes: string[];
  rows: BeltWoRow[];
  totals_by_size: Record<string, number>;
  grand_total: number;
  warnings: string[];
  error: string | null;
};

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

// เรียงไซส์: ตัวเลข(ความกว้าง) น้อย→มาก · ตัวอักษร(S/M/L) ตามลำดับมาตรฐาน · ที่เหลือ ก-ฮ/A-Z
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];
function sortSizes(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    const aNum = a.trim() !== "" && !Number.isNaN(na);
    const bNum = b.trim() !== "" && !Number.isNaN(nb);
    if (aNum && bNum) return na - nb;
    if (aNum !== bNum) return aNum ? 1 : -1;   // ตัวอักษรก่อน ตัวเลขทีหลัง (เผื่อปนกัน)
    const ia = SIZE_ORDER.indexOf(a.toUpperCase()), ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "th");
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const mosParam = str(new URL(request.url).searchParams.get("mos"));
  const mos = [...new Set(mosParam.split(",").map((s) => s.trim()).filter(Boolean))];
  if (!mos.length) return NextResponse.json({ error: "ต้องระบุ mos" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: moRows, error } = await admin.from("manufacturing_orders")
    .select("mo_no, product_sku, product_name, qty, size_breakdown, due_date")
    .in("mo_no", mos).eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = (moRows ?? []) as Record<string, unknown>[];
  if (!list.length) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตที่เลือก" }, { status: 404 });

  const warnings: string[] = [];

  // ── แบรนด์ + รุ่น จาก Parent SKU ──
  const skuCodes = [...new Set(list.map((m) => str(m.product_sku)).filter(Boolean))];
  let brand: string | null = null, parent_code: string | null = null, parent_name: string | null = null;
  if (skuCodes.length) {
    const { data: skus } = await admin.from("skus_v2").select("code, parent_sku_id").in("code", skuCodes);
    const parentIds = new Set<string>();
    for (const s of (skus ?? []) as Record<string, unknown>[]) if (s.parent_sku_id) parentIds.add(String(s.parent_sku_id));
    if (parentIds.size > 1) warnings.push("ใบสั่งผลิตที่เลือกมาจากหลายรุ่น (Parent SKU ไม่เหมือนกัน) — สเปกอาจไม่ตรงทุกใบ");
    const firstParent = [...parentIds][0];
    if (firstParent) {
      const { data: p } = await admin.from("parent_skus_v2").select("code, sku_name, name_th, brand_id").eq("id", firstParent).maybeSingle();
      if (p) {
        const pp = p as Record<string, unknown>;
        parent_code = str(pp.code) || null;
        parent_name = str(pp.sku_name) || str(pp.name_th) || null;
        if (pp.brand_id) {
          const { data: b } = await admin.from("brands").select("name").eq("id", pp.brand_id).maybeSingle();
          brand = str((b as Record<string, unknown> | null)?.name) || null;
        }
      }
    }
  }

  // ── ตารางไซส์รวม ──
  const sizeSet = new Set<string>();
  const totals: Record<string, number> = {};
  const dueSet = new Set<string>();
  let grand = 0;
  const rows: BeltWoRow[] = [];
  for (const m of list) {
    const sb = Array.isArray(m.size_breakdown) ? (m.size_breakdown as { label?: unknown; qty?: unknown }[]) : [];
    const by: Record<string, number> = {};
    let total = 0;
    if (sb.length) {
      for (const s of sb) {
        const lb = str(s.label) || "—";
        const q = num(s.qty);
        if (q === 0) continue;
        by[lb] = (by[lb] ?? 0) + q;
        totals[lb] = (totals[lb] ?? 0) + q;
        sizeSet.add(lb);
        total += q;
      }
    } else {
      const q = num(m.qty);
      by["—"] = q;
      totals["—"] = (totals["—"] ?? 0) + q;
      sizeSet.add("—");
      total = q;
    }
    grand += total;
    if (m.due_date) dueSet.add(str(m.due_date));
    rows.push({ mo_no: str(m.mo_no), product_sku: str(m.product_sku), label: str(m.product_name) || str(m.product_sku), by_size: by, total });
  }
  rows.sort((a, b) => a.mo_no.localeCompare(b.mo_no));

  const payload: BeltWorkOrder = {
    mos: rows.map((r) => r.mo_no),
    brand, parent_code, parent_name,
    due_dates: [...dueSet].sort(),
    sizes: sortSizes([...sizeSet]),
    rows,
    totals_by_size: totals,
    grand_total: grand,
    warnings,
    error: null,
  };
  return NextResponse.json(payload);
}
