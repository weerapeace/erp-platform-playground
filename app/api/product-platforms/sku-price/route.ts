/**
 * แก้ราคา SKU เดียว (inline) — /api/product-platforms/sku-price
 *  POST { sku_id, price, field? }  (products.edit)
 *   field = "list_price" (ราคาขาย, default) | "fake_price" (ราคาเต็ม)
 *   price = ตัวเลข ≥0 · null/"" = ล้างค่า (set NULL)
 *   หมายเหตุ: เป็นราคาขายกลางของ SKU (ใช้ทุกช่องทาง)
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
  let body: { sku_id?: string; price?: number | string | null; field?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const sku_id = (body.sku_id ?? "").trim();
  if (!sku_id) return NextResponse.json({ error: "ต้องระบุ sku_id" }, { status: 400 });
  const field = body.field === "fake_price" ? "fake_price" : "list_price";
  let price: number | null;
  if (body.price === null || body.price === undefined || body.price === "") price = null;   // ล้างค่า
  else { price = Number(body.price); if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "ราคาไม่ถูกต้อง" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("skus_v2").select(`id, code, parent_sku_id, ${field}`).eq("id", sku_id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบ SKU" }, { status: 404 });
  const brow = before as Record<string, unknown>;
  const { error } = await admin.from("skus_v2").update({ [field]: price }).eq("id", sku_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "sku_price", entityId: sku_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { field, old: brow[field] ?? null, new: price, source: "platform_manager_inline", parent_sku_id: (brow.parent_sku_id as string) ?? null, sku_code: (brow.code as string) ?? null } });
  return NextResponse.json({ ok: true, price, field, error: null });
}
