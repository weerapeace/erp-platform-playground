/**
 * /api/bom/where-used — "SKU นี้ถูกใช้ในสูตรผลิตของสินค้าตัวไหนบ้าง" (ย้อน BOM)
 *
 * GET ?sku_id=<uuid>  หรือ  ?sku=<รหัส SKU>   [&limit=200]
 *   → รายการบรรทัดใน bom_lines ที่ component_sku = รหัสนี้ + ข้อมูลหัวสูตร (สินค้าที่ผลิต/เวอร์ชัน/สถานะ)
 *
 * ใช้ที่: แท็บ "BOM (สูตรผลิต)" ในหน้า SKU (components/bom-where-used)
 * ของกลาง: guardApi (products.view) · supabaseAdmin
 * หมายเหตุ: bom_lines/bom_headers ผูกกันด้วย bom_code (text) และอ้างสินค้าด้วย "รหัส SKU" ไม่ใช่ id
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BomWhereUsedRow = {
  line_id: string;
  bom_code: string | null;
  version: string | null;
  status: string | null;
  bom_active: boolean;
  is_default: boolean;
  product_sku: string | null;
  product_name: string | null;
  product_sku_id: string | null;      // เปิดจอสินค้าปลายทางได้ (ถ้าจับคู่รหัสเจอ)
  product_image: string | null;       // R2 key ของรูปปกสินค้าที่ผลิต
  qty: number | null;
  uom: string | null;
  slot_code: string | null;
  waste_percent: number | null;
  is_optional: boolean;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const sp    = new URL(request.url).searchParams;
  const skuId = (sp.get("sku_id") ?? "").trim();
  const limit = Math.min(Number(sp.get("limit")) || 200, 500);
  let   code  = (sp.get("sku") ?? "").trim();

  const admin = supabaseAdmin();

  // รับ id ได้ด้วย — แปลงเป็นรหัสให้เอง (หน้า SKU มีแต่ id ในมือ)
  if (!code && skuId) {
    const { data } = await admin.from("skus_v2").select("code").eq("id", skuId).maybeSingle();
    code = ((data as Record<string, unknown> | null)?.code as string) ?? "";
  }
  if (!code) return NextResponse.json({ data: [], total: 0, sku_code: null, error: null });

  const { data: lines, error } = await admin
    .from("bom_lines")
    .select("id, bom_code, qty, uom, slot_code, waste_percent, is_optional, sequence, is_active")
    .eq("component_sku", code)
    .eq("is_active", true)
    .limit(limit);
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message }, { status: 500 });

  const rows = (lines ?? []) as Record<string, unknown>[];
  const bomCodes = [...new Set(rows.map((r) => r.bom_code).filter(Boolean).map(String))];
  if (bomCodes.length === 0) return NextResponse.json({ data: [], total: 0, sku_code: code, error: null });

  const { data: heads } = await admin
    .from("bom_headers")
    .select("bom_code, version, status, is_active, is_default, product_sku, product_name")
    .in("bom_code", bomCodes);
  const headMap = new Map<string, Record<string, unknown>>();
  for (const h of ((heads ?? []) as Record<string, unknown>[])) headMap.set(String(h.bom_code), h);

  // สินค้าที่ผลิต — หา id/รูป เพื่อให้กดเปิดจอสินค้าและเห็นรูปได้ (จับคู่ด้วยรหัส)
  const productCodes = [...new Set(((heads ?? []) as Record<string, unknown>[]).map((h) => h.product_sku).filter(Boolean).map(String))];
  const prodMap = new Map<string, { id: string; name_th: string | null; cover: string | null }>();
  if (productCodes.length > 0) {
    const { data: prods } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key").in("code", productCodes);
    for (const p of ((prods ?? []) as Record<string, unknown>[])) {
      prodMap.set(String(p.code), {
        id: String(p.id),
        name_th: (p.name_th as string) ?? null,
        cover: (p.cover_image_r2_key as string) ?? null,
      });
    }
  }

  const out: BomWhereUsedRow[] = rows.map((r) => {
    const h = headMap.get(String(r.bom_code ?? "")) ?? {};
    const productSku = (h.product_sku as string) ?? null;
    const p = productSku ? prodMap.get(productSku) : undefined;
    return {
      line_id:        String(r.id),
      bom_code:       (r.bom_code as string) ?? null,
      version:        (h.version as string) ?? null,
      status:         (h.status as string) ?? null,
      bom_active:     h.is_active !== false,
      is_default:     h.is_default === true,
      product_sku:    productSku,
      product_name:   (h.product_name as string) ?? p?.name_th ?? null,
      product_sku_id: p?.id ?? null,
      product_image:  p?.cover ?? null,
      qty:            r.qty == null ? null : Number(r.qty),
      uom:            (r.uom as string) ?? null,
      slot_code:      (r.slot_code as string) ?? null,
      waste_percent:  r.waste_percent == null ? null : Number(r.waste_percent),
      is_optional:    r.is_optional === true,
    };
  });

  // สินค้าที่ผลิตจริง (ใช้งานอยู่) ก่อน แล้วเรียงตามรหัสสินค้า
  out.sort((a, b) => Number(b.bom_active) - Number(a.bom_active) || (a.product_sku ?? "").localeCompare(b.product_sku ?? "", "th"));

  return NextResponse.json({ data: out, total: out.length, sku_code: code, error: null });
}
