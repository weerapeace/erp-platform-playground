/**
 * /api/purchasing/sku-suppliers — รายการราคาหลายร้านต่อสินค้า (price list ของ SKU)
 *
 * ตาราง supplier_items: 1 SKU → หลายร้าน (supplier_partner_id) แต่ละร้านมี price + currency
 *   is_default = "ร้านหลัก" (มีได้ 1 ต่อสินค้า — บังคับด้วย unique index)
 *
 * GET    ?sku_id=...           → คืนรายการร้าน+ราคาของสินค้านั้น (เรียงร้านหลักก่อน)
 * POST   {sku_id, partner_id, price, currency, is_default?, supplier_sku?, moq?, note?}
 * PATCH  {id, price?, currency?, is_default?, supplier_sku?, moq?, note?}
 * DELETE ?id=...
 *
 * เขียนผ่าน supabaseAdmin (bypass RLS) — กั้นด้วย guardApi (products.view/edit) + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECT =
  "id, item_sku_id, supplier_partner_id, price, currency, is_default, supplier_sku, moq, lead_time_days, note, " +
  "partner:supplier_partner_id(id, display_name, name_th, default_currency, shop_country)";

type PartnerEmbed = { id: string; display_name: string | null; name_th: string | null; default_currency: string | null; shop_country: string | null } | null;

const num = (v: unknown): number | null => { if (v === "" || v == null) return null; const n = Number(v); return isFinite(n) ? n : null; };

function shape(r: Record<string, unknown>) {
  const p = r.partner as PartnerEmbed;
  return {
    id: String(r.id),
    sku_id: r.item_sku_id ? String(r.item_sku_id) : null,
    partner_id: r.supplier_partner_id ? String(r.supplier_partner_id) : null,
    partner_name: p?.display_name || p?.name_th || "—",
    partner_country: p?.shop_country ?? null,
    price: r.price == null ? null : Number(r.price),
    currency: String(r.currency ?? "THB"),
    is_default: r.is_default === true,
    supplier_sku: (r.supplier_sku as string) ?? null,
    moq: r.moq == null ? null : Number(r.moq),
    note: (r.note as string) ?? null,
  };
}

// ── GET — รายการร้าน+ราคาของสินค้า ──
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const skuId = new URL(request.url).searchParams.get("sku_id");
  if (!skuId) return NextResponse.json({ data: [], error: "ต้องระบุ sku_id" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("supplier_items")
    .select(SELECT)
    .eq("item_sku_id", skuId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("price", { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r) => shape(r as unknown as Record<string, unknown>)), error: null });
}

// ── POST — เพิ่มร้าน+ราคาให้สินค้า ──
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const skuId = typeof b.sku_id === "string" ? b.sku_id : null;
  const partnerId = typeof b.partner_id === "string" ? b.partner_id : null;
  if (!skuId || !partnerId) return NextResponse.json({ error: "ต้องระบุสินค้าและร้าน" }, { status: 400 });

  const admin = supabaseAdmin();
  const wantDefault = b.is_default === true;
  // ถ้าตั้งเป็นร้านหลัก → ปลดร้านหลักเดิมก่อน (กันชน unique index)
  if (wantDefault) await admin.from("supplier_items").update({ is_default: false }).eq("item_sku_id", skuId).eq("is_default", true);

  const row = {
    item_sku_id: skuId,
    supplier_partner_id: partnerId,
    price: num(b.price),
    currency: typeof b.currency === "string" && b.currency ? b.currency : "THB",
    is_default: wantDefault,
    supplier_sku: typeof b.supplier_sku === "string" ? b.supplier_sku : null,
    moq: num(b.moq),
    note: typeof b.note === "string" ? b.note : null,
    is_active: true,
  };
  const { data, error } = await admin.from("supplier_items").insert(row).select(SELECT).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "ร้านนี้มีอยู่ในรายการแล้ว" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await writeAudit(admin, { action: "create", entityType: "supplier_items", entityId: String((data as unknown as Record<string, unknown>).id), actorId: user?.id, actorName: user?.user_metadata?.name as string | undefined, metadata: { sku_id: skuId, partner_id: partnerId, price: row.price, currency: row.currency } });
  return NextResponse.json({ data: shape(data as unknown as Record<string, unknown>), error: null });
}

// ── PATCH — แก้ราคา/สกุลเงิน/ตั้งร้านหลัก ──
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("supplier_items").select("item_sku_id").eq("id", id).single();
  const skuId = cur ? String((cur as unknown as Record<string, unknown>).item_sku_id) : null;

  const patch: Record<string, unknown> = {};
  if ("price" in b) patch.price = num(b.price);
  if ("currency" in b && typeof b.currency === "string") patch.currency = b.currency || "THB";
  if ("supplier_sku" in b) patch.supplier_sku = typeof b.supplier_sku === "string" ? b.supplier_sku : null;
  if ("moq" in b) patch.moq = num(b.moq);
  if ("note" in b) patch.note = typeof b.note === "string" ? b.note : null;

  if (b.is_default === true) {
    if (skuId) await admin.from("supplier_items").update({ is_default: false }).eq("item_sku_id", skuId).eq("is_default", true);
    patch.is_default = true;
  } else if (b.is_default === false) {
    patch.is_default = false;
  }

  const { data, error } = await admin.from("supplier_items").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "update", entityType: "supplier_items", entityId: id, actorId: user?.id, actorName: user?.user_metadata?.name as string | undefined, metadata: { changes: patch } });
  return NextResponse.json({ data: shape(data as unknown as Record<string, unknown>), error: null });
}

// ── DELETE — ลบร้านออกจากรายการ ──
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("supplier_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "delete", entityType: "supplier_items", entityId: id, actorId: user?.id, actorName: user?.user_metadata?.name as string | undefined });
  return NextResponse.json({ data: { id }, error: null });
}
