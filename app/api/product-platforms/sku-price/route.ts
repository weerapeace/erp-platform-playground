/**
 * แก้ราคาขาย SKU เดียว (inline) — /api/product-platforms/sku-price
 *  POST { sku_id, price }  (products.edit)
 *   → set skus_v2.list_price = price ของ SKU นั้น
 *   หมายเหตุ: list_price = ราคาขายกลางของ SKU (ใช้ทุกช่องทาง) — แก้ที่นี่กระทบราคากลาง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { sku_id?: string; price?: number | string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const sku_id = (body.sku_id ?? "").trim();
  if (!sku_id) return NextResponse.json({ error: "ต้องระบุ sku_id" }, { status: 400 });
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "ราคาไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("skus_v2").select("id, list_price").eq("id", sku_id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบ SKU" }, { status: 404 });
  const { error } = await admin.from("skus_v2").update({ list_price: price }).eq("id", sku_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "sku_price", entityId: sku_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { field: "list_price", old: (before as { list_price?: number }).list_price ?? null, new: price, source: "platform_manager_inline" } });
  return NextResponse.json({ ok: true, price, error: null });
}
