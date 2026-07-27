/**
 * GET /api/pending-data/siblings?supplier_item_id=<id>
 * หา "วัตถุดิบพี่น้อง" ของรายการนั้น = SKU ที่อยู่ใต้ Parent เดียวกัน + ผูกร้านเดียวกัน + ยังไม่มีราคา
 * ใช้ตอนใส่ราคาในรายงานรายการค้าง → ถามว่าจะใส่ราคาเดียวกันให้พี่น้องด้วยไหม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const s = (v: unknown) => (v == null ? "" : String(v));

export type PriceSibling = { supplier_item_id: string; sku_id: string; code: string; name: string; supplier_sku: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("supplier_item_id");
  if (!id) return NextResponse.json({ data: [], error: "ต้องระบุ supplier_item_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("supplier_items")
    .select("id, item_sku_id, supplier_partner_id").eq("id", id).maybeSingle();
  const c = (cur ?? {}) as Record<string, unknown>;
  if (!c.item_sku_id || !c.supplier_partner_id) return NextResponse.json({ data: [], parent_name: null, error: null });

  // Parent ของ SKU นี้
  const { data: sku } = await admin.from("skus_v2").select("parent_sku_id").eq("id", s(c.item_sku_id)).maybeSingle();
  const parentId = s((sku ?? {} as Record<string, unknown>).parent_sku_id);
  if (!parentId) return NextResponse.json({ data: [], parent_name: null, error: null });

  // SKU พี่น้องทั้งหมดใต้ Parent เดียวกัน (ไม่รวมตัวเอง)
  const { data: sibs } = await admin.from("skus_v2").select("id, code, name_th")
    .eq("parent_sku_id", parentId).neq("id", s(c.item_sku_id)).limit(500);
  const sibList = (sibs ?? []) as Record<string, unknown>[];
  if (sibList.length === 0) return NextResponse.json({ data: [], parent_name: null, error: null });

  // เอาเฉพาะที่ผูกร้านเดียวกันไว้แล้ว และยังไม่มีราคา
  const { data: items } = await admin.from("supplier_items")
    .select("id, item_sku_id, supplier_sku, price")
    .eq("supplier_partner_id", s(c.supplier_partner_id))
    .in("item_sku_id", sibList.map((x) => s(x.id)))
    .eq("is_active", true);
  const skuById = new Map(sibList.map((x) => [s(x.id), x]));

  const out: PriceSibling[] = ((items ?? []) as Record<string, unknown>[])
    .filter((it) => !(Number(it.price) > 0))
    .map((it) => {
      const sk = skuById.get(s(it.item_sku_id));
      return {
        supplier_item_id: s(it.id), sku_id: s(it.item_sku_id),
        code: s(sk?.code), name: s(sk?.name_th), supplier_sku: (it.supplier_sku as string) ?? null,
      };
    });

  const { data: par } = await admin.from("parent_skus_v2").select("code, name_th").eq("id", parentId).maybeSingle();
  const p = (par ?? {}) as Record<string, unknown>;
  return NextResponse.json({ data: out, parent_name: s(p.code) || s(p.name_th) || null, error: null });
}
