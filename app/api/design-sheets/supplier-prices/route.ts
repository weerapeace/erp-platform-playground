/**
 * ราคาเดิมของร้าน (ทะเบียนราคาต่อร้าน supplier_items) — ใช้ในตีราคา "สั่งจากร้าน"
 *
 * GET /api/design-sheets/supplier-prices?supplier_id=<partner>&q=<คำค้น>&limit=20
 *   → รายการสินค้าที่เคยตั้งราคาไว้กับร้านนี้ (รหัส/ชื่อ SKU + ราคา + สกุล + MOQ + ลิงก์ซื้อ)
 *   ไม่ส่ง supplier_id = ค้นทุกร้าน (เผื่ออยากดูว่าของแบบนี้ร้านไหนเคยเสนอเท่าไหร่)
 *
 * สิทธิ์: products.view (ตัวเลขราคาซื้อ = ต้นทุน → หน้าจอโชว์เฉพาะคนที่มี products.cost.view อีกชั้น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SupplierPriceRow = {
  id: string;
  sku_id: string | null; sku_code: string | null; sku_name: string | null;
  supplier_id: string | null; supplier_name: string | null;
  price: number | null; currency: string | null;
  supplier_sku: string | null; moq: number | null; purchase_uom: string | null;
  purchase_link: string | null; note: string | null; is_default: boolean;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const supplierId = (sp.get("supplier_id") ?? "").trim();
  const q = (sp.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") ?? "20", 10)));

  const admin = supabaseAdmin();
  let query = admin.from("supplier_items")
    .select("id, item_sku_id, supplier_partner_id, price, currency, supplier_sku, moq, purchase_uom, purchase_link, note, is_default")
    .not("price", "is", null)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(q ? 300 : limit);   // มีคำค้น → ดึงมากรองด้วยชื่อ SKU ฝั่งเซิร์ฟเวอร์
  if (supplierId) query = query.eq("supplier_partner_id", supplierId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];

  // เติมชื่อ/รหัส SKU + ชื่อร้าน
  const skuIds = [...new Set(rows.map((r) => r.item_sku_id).filter(Boolean).map(String))];
  const partnerIds = [...new Set(rows.map((r) => r.supplier_partner_id).filter(Boolean).map(String))];
  const [skus, partners] = await Promise.all([
    skuIds.length ? admin.from("skus_v2").select("id, code, name_th").in("id", skuIds) : Promise.resolve({ data: [] }),
    partnerIds.length ? admin.from("partners_v2").select("id, name_th, name_en, code").in("id", partnerIds) : Promise.resolve({ data: [] }),
  ]);
  const skuMap = new Map(((skus.data ?? []) as { id: string; code: string | null; name_th: string | null }[]).map((s) => [String(s.id), s]));
  const parMap = new Map(((partners.data ?? []) as { id: string; name_th?: string; name_en?: string; code?: string }[])
    .map((p) => [String(p.id), p.name_th || p.name_en || p.code || ""]));

  let out: SupplierPriceRow[] = rows.map((r) => {
    const s = r.item_sku_id ? skuMap.get(String(r.item_sku_id)) : null;
    return {
      id: String(r.id),
      sku_id: (r.item_sku_id as string) ?? null, sku_code: s?.code ?? null, sku_name: s?.name_th ?? null,
      supplier_id: (r.supplier_partner_id as string) ?? null,
      supplier_name: r.supplier_partner_id ? (parMap.get(String(r.supplier_partner_id)) ?? null) : null,
      price: r.price == null ? null : Number(r.price),
      currency: (r.currency as string) ?? null,
      supplier_sku: (r.supplier_sku as string) ?? null,
      moq: r.moq == null ? null : Number(r.moq),
      purchase_uom: (r.purchase_uom as string) ?? null,
      purchase_link: (r.purchase_link as string) ?? null,
      note: (r.note as string) ?? null,
      is_default: r.is_default === true,
    };
  });

  if (q) {
    const s = q.toLowerCase();
    out = out.filter((r) => `${r.sku_code ?? ""} ${r.sku_name ?? ""} ${r.supplier_sku ?? ""} ${r.note ?? ""}`.toLowerCase().includes(s)).slice(0, limit);
  }
  return NextResponse.json({ data: out, error: null });
}
