/**
 * จัดการสินค้าบนเว็บร้านออนไลน์ (Pixiedustie store) ของ Parent SKU — /api/parent-web-listings
 * ใช้ในแท็บ "🛍 เว็บไซต์" ของ Parent SKU (drawer + หน้าเต็ม) — แก้ได้เลยในแท็บ (แผน A)
 *
 * GET  ?parentId=  → รุ่น + ทุกร้าน (ขึ้น/ราคา/ชื่อ/รูป override) + SKU ลูก (สต๊อก+รูป ERP) + ยอดขายเว็บ
 * POST { parentId, shopId, action:"add" }      → เพิ่มรุ่นเข้าร้านนั้น (ปิดไว้ก่อน)
 * POST { parentId, shopId, patch:{...} }        → แก้ override ของร้านนั้น (store_listings)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin (store_* อยู่ DB เดียวกัน) + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STORE_BASE = process.env.NEXT_PUBLIC_STORE_BASE || "https://pixiedustie-store.vercel.app";
const KEY_RE = /^[\w\-./%()]+$/; // r2 object key ที่ยอมรับ

const displayName = (p: { name_platform?: string | null; name_th?: string | null; code?: string | null }) =>
  (p.name_platform && p.name_platform.trim()) || (p.name_th && p.name_th.trim()) || p.code || "";

const productUrlFor = (code: string, slug: string, isDefault: boolean) =>
  isDefault
    ? `${STORE_BASE}/product/${encodeURIComponent(code)}`
    : `${STORE_BASE}/preview/${encodeURIComponent(slug)}?next=${encodeURIComponent(`/product/${code}`)}`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const parentId = (new URL(request.url).searchParams.get("parentId") ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parentId" }, { status: 400 });

  const sb = supabaseAdmin();
  const [{ data: parent }, { data: listings }, { data: shops }, { data: children }] = await Promise.all([
    sb.from("parent_skus_v2").select("id, code, name_th, name_platform, platform_description, description").eq("id", parentId).maybeSingle(),
    sb.from("store_listings").select("*").eq("parent_sku_id", parentId),
    sb.from("shops").select("id, name, slug, is_default").order("is_default", { ascending: false }),
    sb.from("skus_v2").select("id, code, color, list_price, cover_image_r2_key").eq("parent_sku_id", parentId).eq("is_active", true).eq("sale_ok", true).gt("list_price", 0).order("code"),
  ]);
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const code = (parent as { code: string }).code;
  const kids = (children ?? []) as Record<string, unknown>[];

  const { data: stockRows } = kids.length
    ? await sb.from("sku_stock_balances").select("sku_id, qty_on_hand").in("sku_id", kids.map((k) => k.id as string))
    : { data: [] };
  const stock = new Map<string, number>();
  for (const s of (stockRows ?? []) as { sku_id: string; qty_on_hand: number | string | null }[]) {
    stock.set(s.sku_id, Number(s.qty_on_hand) || 0);
  }
  const variants = kids.map((k, i) => ({
    id: k.id as string,
    code: (k.code as string) ?? "",
    label: ((k.color as string | null) ?? "").trim() || `แบบ ${i + 1}`,
    price: Number(k.list_price) || 0,
    qty: stock.get(k.id as string) ?? 0,
    erpImageKey: (k.cover_image_r2_key as string | null) ?? null,
  }));

  // ยอดขายเว็บต่อร้าน (ไม่รวมออเดอร์ยกเลิก)
  const soldByShop = new Map<string, number>();
  const { data: items } = await sb.from("store_order_items").select("order_id, qty").eq("parent_code", code);
  const itemRows = (items ?? []) as { order_id: string; qty: number | string }[];
  if (itemRows.length) {
    const { data: orders } = await sb.from("store_orders").select("id, shop_id, status").in("id", [...new Set(itemRows.map((i) => i.order_id))]);
    const orderShop = new Map(
      ((orders ?? []) as { id: string; shop_id: string; status: string }[]).filter((o) => o.status !== "cancelled").map((o) => [o.id, o.shop_id])
    );
    for (const it of itemRows) {
      const sid = orderShop.get(it.order_id);
      if (sid) soldByShop.set(sid, (soldByShop.get(sid) ?? 0) + (Number(it.qty) || 0));
    }
  }

  const listingByShop = new Map(((listings ?? []) as Record<string, unknown>[]).map((l) => [l.shop_id as string, l]));
  const shopRows = ((shops ?? []) as { id: string; name: string; slug: string; is_default: boolean }[]).map((s) => {
    const l = listingByShop.get(s.id);
    const webSkuImages =
      l?.web_sku_images && typeof l.web_sku_images === "object" && !Array.isArray(l.web_sku_images)
        ? (l.web_sku_images as Record<string, string>)
        : {};
    return {
      shopId: s.id,
      shopName: s.name,
      slug: s.slug,
      isDefault: s.is_default,
      listed: !!l,
      published: Boolean(l?.is_published),
      featured: Boolean(l?.featured),
      webPrice: l?.web_price != null ? Number(l.web_price) : null,
      webName: (l?.web_name as string | null) ?? "",
      webDescription: (l?.web_description as string | null) ?? "",
      webImages: Array.isArray(l?.web_images) ? (l!.web_images as string[]).filter((k) => typeof k === "string") : [],
      webSkuImages,
      soldQty: soldByShop.get(s.id) ?? 0,
      productUrl: productUrlFor(code, s.slug, s.is_default),
    };
  });

  return NextResponse.json({
    code,
    parentName: displayName(parent as { name_platform?: string | null; name_th?: string | null; code?: string | null }),
    erpDescription:
      ((parent as { platform_description?: string | null }).platform_description ?? "").trim() ||
      ((parent as { description?: string | null }).description ?? "").trim() ||
      null,
    adminUrl: `${STORE_BASE}/admin/products`,
    variants,
    shops: shopRows,
  });
}

type Patch = {
  isPublished?: boolean;
  featured?: boolean;
  webPrice?: number | null;
  webName?: string;
  webDescription?: string;
  webImages?: string[];
  webSkuImages?: Record<string, string>;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: { parentId?: string; shopId?: string; action?: string; patch?: Patch };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!b.parentId || !b.shopId) return NextResponse.json({ error: "ต้องระบุ parentId + shopId" }, { status: 400 });

  const sb = supabaseAdmin();

  // เพิ่มรุ่นเข้าร้าน (ปิดไว้ก่อน)
  if (b.action === "add") {
    const { data: exists } = await sb.from("store_listings").select("id").eq("shop_id", b.shopId).eq("parent_sku_id", b.parentId).maybeSingle();
    if (!exists) {
      const { error } = await sb.from("store_listings").insert({ shop_id: b.shopId, parent_sku_id: b.parentId, is_published: false });
      if (error) return NextResponse.json({ error: "เพิ่มเข้าร้านไม่สำเร็จ" }, { status: 500 });
      await writeAudit(sb, { action: "create", entityType: "store_listing", entityId: b.parentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { shopId: b.shopId } });
    }
    return NextResponse.json({ ok: true });
  }

  const p = b.patch ?? {};
  const row: Record<string, unknown> = { shop_id: b.shopId, parent_sku_id: b.parentId, updated_at: new Date().toISOString() };
  if (p.isPublished !== undefined) row.is_published = !!p.isPublished;
  if (p.featured !== undefined) row.featured = !!p.featured;
  if (p.webPrice !== undefined) row.web_price = p.webPrice == null ? null : Number(p.webPrice) || null;
  if (p.webName !== undefined) row.web_name = String(p.webName).slice(0, 200).trim() || null;
  if (p.webDescription !== undefined) row.web_description = String(p.webDescription).slice(0, 3000).trim() || null;
  if (p.webImages !== undefined) {
    const keys = (Array.isArray(p.webImages) ? p.webImages : []).filter((k) => typeof k === "string" && KEY_RE.test(k)).slice(0, 12);
    row.web_images = keys.length ? keys : null;
  }
  if (p.webSkuImages !== undefined) {
    const clean: Record<string, string> = {};
    for (const [skuId, key] of Object.entries(p.webSkuImages ?? {}).slice(0, 60)) {
      if (/^[0-9a-f-]{36}$/i.test(skuId) && typeof key === "string" && KEY_RE.test(key)) clean[skuId] = key;
    }
    row.web_sku_images = Object.keys(clean).length ? clean : null;
  }

  const { error } = await sb.from("store_listings").upsert(row, { onConflict: "shop_id,parent_sku_id" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, { action: "update", entityType: "store_listing", entityId: b.parentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { shopId: b.shopId, patch: p } });
  return NextResponse.json({ ok: true });
}
