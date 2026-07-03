/**
 * Mass fill ราคาขาย SKU ใต้ Parent เดียว — /api/product-platforms/mass-price
 *  POST { parent_sku_id, price, only_empty? }  (products.edit)
 *   → set skus_v2.list_price = price (ทุก SKU ใต้ parent · only_empty=true = เฉพาะที่ยังไม่มีราคา)
 *   หมายเหตุ: list_price = ราคาขายกลางของ SKU (ใช้ทุกช่องทาง) — แก้ที่นี่กระทบราคากลาง ไม่ใช่เฉพาะแพลตฟอร์ม
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
  let body: { parent_sku_id?: string; price?: number | string; only_empty?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parent_sku_id = (body.parent_sku_id ?? "").trim();
  if (!parent_sku_id) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "ราคาไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  // หา SKU ที่จะอัปเดต (เฉพาะที่ยังไม่มีราคา ถ้า only_empty)
  let q = admin.from("skus_v2").select("id, list_price").eq("parent_sku_id", parent_sku_id);
  const { data: skus } = await q;
  let targets = ((skus ?? []) as { id: string; list_price: number | null }[]);
  if (body.only_empty) targets = targets.filter((s) => s.list_price == null || Number(s.list_price) === 0);
  if (targets.length === 0) return NextResponse.json({ ok: true, updated: 0, error: null });

  const ids = targets.map((s) => s.id);
  const { error } = await admin.from("skus_v2").update({ list_price: price }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "sku_price", entityId: parent_sku_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { mass_fill: true, price, count: ids.length, only_empty: !!body.only_empty } });
  void q;
  return NextResponse.json({ ok: true, updated: ids.length, error: null });
}
