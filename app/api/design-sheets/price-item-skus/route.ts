/**
 * Design Sheets — ผูก SKU เข้ากับ "วัสดุตีราคา" (one-to-many)
 *
 * GET   → วัสดุตีราคาทั้งหมด + SKU ที่ผูกไว้ (skus_v2.design_price_item_id) — ไว้โชว์ในโมดอลผูก
 * PATCH → { item_id, sku_ids[] } ตั้ง SKU ที่สังกัดวัสดุนี้
 *         (เซ็ต design_price_item_id ให้ SKU ที่เลือก + ปลดของที่เคยผูกแต่เอาออก)
 *
 * 1 SKU สังกัดได้วัสดุเดียว — ถ้า SKU เคยผูกวัสดุอื่นแล้วถูกเลือกที่นี่ จะย้ายมาวัสดุนี้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PriceItemSkuLink = { item_id: string; sku_ids: string[] };
export type SkuLite = { id: string; code: string; name: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("skus_v2")
    .select("id, code, name_th, design_price_item_id")
    .not("design_price_item_id", "is", null);
  if (error) return NextResponse.json({ links: {}, skus: {}, error: friendlyDbError(error.message) }, { status: 500 });

  const links: Record<string, string[]> = {};
  const skus: Record<string, SkuLite> = {};
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const item = String(r.design_price_item_id);
    const id = String(r.id);
    (links[item] ??= []).push(id);
    skus[id] = { id, code: String(r.code ?? ""), name: String(r.name_th ?? r.code ?? "") };
  }
  return NextResponse.json({ links, skus, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { item_id?: string; sku_ids?: string[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.item_id) return NextResponse.json({ error: "ต้องระบุ item_id" }, { status: 400 });
  const ids = Array.isArray(body.sku_ids) ? [...new Set(body.sku_ids.map((s) => String(s)).filter(Boolean))] : [];

  const admin = supabaseAdmin();
  // 1) ปลด SKU ที่เคยผูกวัสดุนี้ แต่ไม่ได้อยู่ในชุดใหม่
  const clear = admin.from("skus_v2").update({ design_price_item_id: null }).eq("design_price_item_id", body.item_id);
  const { error: e1 } = ids.length > 0 ? await clear.not("id", "in", `(${ids.join(",")})`) : await clear;
  if (e1) return NextResponse.json({ error: friendlyDbError(e1.message) }, { status: 400 });

  // 2) ผูก SKU ที่เลือก (ย้ายมาจากวัสดุอื่นได้)
  if (ids.length > 0) {
    const { error: e2 } = await admin.from("skus_v2").update({ design_price_item_id: body.item_id }).in("id", ids);
    if (e2) return NextResponse.json({ error: friendlyDbError(e2.message) }, { status: 400 });
  }

  await writeAudit(admin, {
    action: "update", entityType: "design_price_item", entityId: body.item_id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { linked_skus: ids.length },
  });
  return NextResponse.json({ item_id: body.item_id, linked: ids.length, error: null });
}
