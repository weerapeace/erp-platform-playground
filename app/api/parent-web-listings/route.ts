/**
 * จัดการสินค้าบนเว็บร้านออนไลน์ของ Parent SKU — /api/parent-web-listings
 * ใช้ในแท็บ "🛍 เว็บไซต์" ของ Parent SKU (drawer + หน้าเต็ม) — แก้ได้เลยในแท็บ (แผน A)
 *
 * GET  ?parentId=  → รุ่น + ทุกร้าน (ขึ้น/ราคา/ชื่อ/รูป override + จับคู่รายละเอียดหน้าเว็บ)
 *                    + SKU ลูก (สต๊อก + รูปปก + แกลเลอรีรูปของ SKU ให้เลือกเป็นรูปเว็บรายสี) + ยอดขายเว็บ
 * POST { parentId, shopId, action:"add" }      → เพิ่มรุ่นเข้าร้านนั้น (ปิดไว้ก่อน)
 * POST { parentId, shopId, patch:{...} }        → แก้ override ของร้านนั้น (store_listings) แล้วสั่งเว็บร้านล้างแคช
 * POST { parentId, shopId, action:"nameRule", nameRule:{removeBrand?,removeCollection?,removeCode?,removeParens?,removeParenMarks?} }
 *                                               → กฎชื่อของร้าน (shops.field_map.name — ใช้ทุกสินค้าในร้าน)
 * GET คืน autoName ต่อร้าน = ชื่อที่เว็บใช้จริงเมื่อเว้นช่องชื่อว่าง (resolveName ตัวเดียวกับเว็บ)
 *     + ขายบนเว็บ (หมวด/หน่วย/สต๊อก/ป้าย/ตัวเลือกกรอกเอง/สีตัวอย่าง) + ค่าอัตโนมัติ + ที่ลูกค้าเห็นจริง + สิ่งที่ต้องแก้ (ของกลาง computeListingDisplay)
 * ⭐ ตัวตั้งค่าเว็บของสินค้า (components/parent-web-listings) ใช้ API นี้ทั้งในแท็บ 🛍 ของ Parent SKU และ drawer หน้า "สินค้าบนเว็บ"
 *    → ฟิลด์ที่บันทึกได้ = ชุดเดียวกับ /api/website/listings (ของกลาง lib/website-listing-patch)
 *
 * web_sku_images = { [skuId]: string[] }  รูปเว็บของสีนั้น (หลายรูปได้) — ค่าเก่าเป็น string เดี่ยว ยังอ่านได้
 * web_details    = { [detailItemId]: { show?: boolean, text?: string } }  ทับ "ชุดรายละเอียดสินค้า" ของธีมเฉพาะรุ่นนี้
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin (store_* อยู่ DB เดียวกัน) + writeAudit + purgeStorefrontCache
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeTheme } from "@/lib/website-theme";
import { normalizeBanners } from "@/lib/website-banners";
import { normalizeCardColors } from "@/lib/website-card-colors";
import { normalizeHero } from "@/lib/website-hero";
import { productPageUrl } from "@/lib/website-links";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { loadParentWebFields } from "@/lib/website-parent-fields";
import { buildLinkedRows } from "@/lib/website-listing-linked";
import { PRODUCT_SPEC_FIELDS } from "@/lib/website-theme";
import {
  normalizeFieldMap,
  resolveName,
  attachNameRefs,
  PARENT_SELECT,
  NAME_RULE_FLAGS,
  NAME_RULE_EXCLUSIVE,
  type ParentRow,
  type NameRuleFlag,
} from "@/lib/website-field-map";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { cleanDetailOverrides } from "@/lib/website-detail-overrides";
import { normalizePersonalize } from "@/lib/website-personalize";
import { listingPatchToRow, toKeyList, type ListingPatch } from "@/lib/website-listing-patch";
import { computeListingDisplay } from "@/lib/website-listing-display";
import { readFitCheckShops, readSiteInfo } from "@/lib/website-site-info";
import { parseCompartments } from "@/lib/fit-check";
import { CHILD_SELECT, type ChildSku } from "@/lib/website-field-map";
import { SwatchIndex, rowToSwatchEntry, SWATCH_SELECT } from "@/lib/color-swatch";

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
  const [{ data: parent }, { data: listings }, { data: shops }, { data: children }, parentFields, siteUrls, { data: mapKids }, { data: swatchRows }] = await Promise.all([
    sb.from("parent_skus_v2").select(PARENT_SELECT).eq("id", parentId).maybeSingle(),
    sb.from("store_listings").select("*").eq("parent_sku_id", parentId),
    sb.from("shops").select("id, name, slug, is_default, theme, theme_draft, field_map").order("is_default", { ascending: false }),
    sb.from("skus_v2").select("id, code, color, list_price, cover_image_r2_key").eq("parent_sku_id", parentId).eq("is_active", true).eq("sale_ok", true).gt("list_price", 0).order("code"),
    loadParentWebFields(sb),
    loadShopSiteUrls(sb),
    // SKU ลูกแบบที่เว็บใช้ (คำนวณราคา/รูป/สีที่ลูกค้าเห็นจริง) + ทะเบียนสีกลาง (จุดสี)
    sb.from("skus_v2").select(CHILD_SELECT).eq("parent_sku_id", parentId).eq("is_active", true),
    sb.from("erp_color_dictionary").select(SWATCH_SELECT).eq("is_active", true),
  ]);
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const code = (parent as { code: string }).code;
  // ชื่อแบรนด์/คอลเลกชัน → ไว้คำนวณ "ชื่อที่เว็บจะใช้จริง" ตามกฎชื่อของแต่ละร้าน + โชว์เป็นป้ายบนปุ่มกฎ
  const parentRow = parent as unknown as ParentRow;
  await attachNameRefs(sb, [parentRow]);
  const kids = (children ?? []) as Record<string, unknown>[];
  const webKids = (mapKids ?? []) as ChildSku[];
  const swatches = new SwatchIndex(((swatchRows ?? []) as Parameters<typeof rowToSwatchEntry>[0][]).map(rowToSwatchEntry));
  const catId = (parentRow as { category_id?: string | null }).category_id ?? null;
  const catName = catId ? (((await sb.from("product_categories").select("name").eq("id", catId).maybeSingle()).data as { name?: string } | null)?.name ?? null) : null;
  const kidIds = kids.map((k) => k.id as string);

  // สต๊อก + แกลเลอรีรูปของ SKU ลูก (รูปภาพเพิ่มเติมที่อัปโหลดไว้ในหน้า SKU) — ให้เลือกเป็นรูปเว็บรายสีได้
  const [{ data: stockRows }, { data: attRows }] = kidIds.length
    ? await Promise.all([
        sb.from("sku_stock_balances").select("sku_id, qty_on_hand").in("sku_id", kidIds),
        sb
          .from("erp_playground_attachments")
          .select("entity_id, file_path, is_primary, sort_order, content_type")
          .eq("entity_type", "skus_v2")
          .in("entity_id", kidIds)
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];
  const stock = new Map<string, number>();
  for (const s of (stockRows ?? []) as { sku_id: string; qty_on_hand: number | string | null }[]) {
    stock.set(s.sku_id, Number(s.qty_on_hand) || 0);
  }
  const gallery = new Map<string, string[]>();
  for (const a of (attRows ?? []) as { entity_id: string; file_path: string | null; content_type: string | null }[]) {
    if (!a.file_path || !KEY_RE.test(a.file_path)) continue;
    if (a.content_type && !a.content_type.startsWith("image/")) continue;
    const arr = gallery.get(a.entity_id) ?? [];
    if (!arr.includes(a.file_path)) arr.push(a.file_path);
    gallery.set(a.entity_id, arr);
  }
  const variants = kids.map((k, i) => {
    const cover = (k.cover_image_r2_key as string | null) ?? null;
    const extra = gallery.get(k.id as string) ?? [];
    return {
      id: k.id as string,
      code: (k.code as string) ?? "",
      label: ((k.color as string | null) ?? "").trim() || `แบบ ${i + 1}`,
      price: Number(k.list_price) || 0,
      qty: stock.get(k.id as string) ?? 0,
      erpImageKey: cover,
      /** รูปทั้งหมดของ SKU นี้ (ปกก่อน แล้วรูปเพิ่มเติม) */
      gallery: [...new Set([...(cover ? [cover] : []), ...extra])],
    };
  });

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
  const fitShops = await readFitCheckShops(sb);
  // 🔗 ข้อมูลที่เชื่อม: ชื่อฟิลด์ (ทะเบียน → ชุดสเปก) + ค่าส่งของแต่ละร้าน
  const fieldLabelMap = new Map<string, string>([...PRODUCT_SPEC_FIELDS.map((f) => [f.key, f.label] as const), ...parentFields.map((f) => [f.key, f.label] as const)]);
  const fieldLabel = (k: string) => fieldLabelMap.get(k) ?? k;
  const shipByShop = new Map(
    await Promise.all(((shops ?? []) as { id: string }[]).map(async (s) => {
      const info = await readSiteInfo(sb, s.id);
      return [s.id, { flat: info.shipping_flat, freeMin: info.free_shipping_min }] as const;
    }))
  );
  type ShopRow = { id: string; name: string; slug: string; is_default: boolean; theme: unknown; theme_draft: unknown; field_map: unknown };
  const shopRows = ((shops ?? []) as ShopRow[]).map((s) => {
    const l = listingByShop.get(s.id);
    const rawSku = l?.web_sku_images && typeof l.web_sku_images === "object" && !Array.isArray(l.web_sku_images) ? (l.web_sku_images as Record<string, unknown>) : {};
    const webSkuImages: Record<string, string[]> = {};
    for (const [skuId, v] of Object.entries(rawSku)) {
      const keys = toKeyList(v);
      if (keys.length) webSkuImages[skuId] = keys;
    }

    // "ชุดรายละเอียดสินค้า" ของธีมร้านนี้ (ฉบับร่างถ้ามี) → ให้หน้าจอโชว์ว่าแต่ละหัวข้อค่ากลางเป็นอย่างไรกับรุ่นนี้
    const theme = normalizeTheme(s.theme_draft ?? s.theme);
    const fieldMap = normalizeFieldMap(s.field_map);
    const catLabel = new Map(fieldMap.categories.map((c) => [c.key, c.label]));
    const detailItems = theme.product.detailItems.map((it) => {
      let defaultLabel: string;
      if (!it.enabled) defaultLabel = "ปิดอยู่ (ค่ากลาง)";
      else if (it.applyTo === "categories") defaultLabel = `เฉพาะหมวด: ${it.categories.map((c) => catLabel.get(c) ?? c).join(", ") || "—"}`;
      else if (it.applyTo === "products") defaultLabel = it.products.includes(code.toUpperCase()) ? "เลือกรายรุ่น · รุ่นนี้รวมอยู่" : "เลือกรายรุ่น · รุ่นนี้ไม่รวม";
      else defaultLabel = "ทุกสินค้า";
      return { id: it.id, label: it.label, source: it.source, enabled: it.enabled, defaultLabel };
    });

    // 👁 ค่าอัตโนมัติ + ที่ลูกค้าเห็นจริง + สิ่งที่ต้องแก้ (ของกลาง — ตัวเดียวกับหน้า "สินค้าบนเว็บ")
    const view = computeListingDisplay({ fieldMap, parent: parentRow, kids: webKids, listing: l ?? null, categoryName: catName, swatches, siteUrl: siteUrls.get(s.id) ?? null, code, fitCheck: fitShops.has(s.id) });

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
      /** ชื่อที่เว็บร้านนี้ใช้จริงถ้าเว้นช่องชื่อว่าง (ตามกฎชื่อของร้าน — ตัวเดียวกับเว็บจริง) */
      autoName: resolveName(fieldMap, parentRow),
      /** กฎชื่อของร้าน (ใช้กับทุกสินค้าในร้าน) */
      nameRule: Object.fromEntries(NAME_RULE_FLAGS.map((f) => [f, !!fieldMap.name[f]])) as Record<NameRuleFlag, boolean>,
      webDescription: (l?.web_description as string | null) ?? "",
      webImages: Array.isArray(l?.web_images) ? (l!.web_images as string[]).filter((k) => typeof k === "string") : [],
      webSkuImages,
      webDetails: cleanDetailOverrides(l?.web_details),
      /** 🔤 ปั๊มชื่อ (null = ยังไม่เคยตั้ง → UI ใช้ค่าเริ่มต้นปิดอยู่) */
      webPersonalize: l?.web_personalize ? normalizePersonalize(l.web_personalize) : null,
      /** 🖼 แบนเนอร์หน้าสินค้าเฉพาะรุ่น (ว่าง = ใช้แบนเนอร์กลางของธีม) */
      webBanners: normalizeBanners(l?.web_banners),
      /** 🎴 สีที่โชว์บนการ์ด + สีหลัก (ว่าง = ทุกสีตามลำดับเดิม) */
      webCardColors: normalizeCardColors(l?.web_card_colors),
      /** 🎬 รูปเปิดหน้าสินค้า (Hero) คอม/มือถือ (null = ใช้รูปสินค้า) */
      webHero: normalizeHero(l?.web_hero),
      detailItems,
      // 🛒 ขายบนเว็บ (ชุดเดียวกับหน้า "สินค้าบนเว็บ")
      webUnit: (l?.web_unit as string | null) ?? "",
      webCategories: Array.isArray(l?.web_categories) ? (l!.web_categories as string[]) : null,
      categories: view.categories,
      webBadge: (l?.web_badge as string | null) ?? "",
      webStockStatus: (l?.web_stock_status as string | null) ?? "",
      webSwatch: (l?.web_swatch as string | null) ?? "",
      webOptions: (l?.web_options as unknown) ?? null,
      /** หมวดของร้านนี้ (แท็บ 📂 หมวดหมู่) */
      shopCategories: fieldMap.categories.map((c) => ({ key: c.key, label: c.label, icon: c.icon ?? "" })),
      /** ค่าที่เว็บใช้อัตโนมัติถ้าไม่กรอกทับ */
      auto: { price: view.mapped.price, unit: view.mapped.unit, description: view.mapped.description },
      display: view.display,
      issues: l ? view.issues : [],
      /** 🔗 หน้าเว็บดึงอะไรมาจากไหน + ค่าตอนนี้ (lib/website-listing-linked) */
      linked: buildLinkedRows({
        fieldMap,
        parent: parentRow as unknown as Record<string, unknown>,
        code,
        autoName: resolveName(fieldMap, parentRow),
        listing: l ?? null,
        auto: { price: view.mapped.price, description: view.mapped.description },
        imageCount: view.display.imageCount,
        categories: view.categories,
        detailItems: theme.product.detailItems,
        detailOverrides: cleanDetailOverrides(l?.web_details),
        fieldLabel,
        shipping: shipByShop.get(s.id) ?? { flat: 0, freeMin: 0 },
      }),
      soldQty: soldByShop.get(s.id) ?? 0,
      /** 📐 ร้านนี้เปิดเช็คขนาด */
      fitCheck: fitShops.has(s.id),
      // 🌐 โดเมนจริงของร้าน (shop_domains) · ยังไม่ตั้งโดเมน = ลิงก์แบบเดิม
      productUrl: productPageUrl(siteUrls.get(s.id) ?? null, code) ?? productUrlFor(code, s.slug, s.is_default),
    };
  });

  const webFields = parentFields.map((f) => ({ key: f.key, label: f.label }));
  return NextResponse.json({
    webFields,
    code,
    parentName: displayName(parent as { name_platform?: string | null; name_th?: string | null; code?: string | null }),
    erpDescription:
      ((parent as { platform_description?: string | null }).platform_description ?? "").trim() ||
      ((parent as { description?: string | null }).description ?? "").trim() ||
      null,
    /** แบรนด์/คอลเลกชัน/รหัสของรุ่นนี้ — โชว์บนปุ่มกฎชื่อให้เห็นว่าจะลบคำไหน */
    nameRefs: { brand: parentRow.brand_name ?? null, collection: parentRow.collection_name ?? null, code },
    adminUrl: `${STORE_BASE}/admin/products`,
    /** 📐 ช่องใส่ของ (null = ยังไม่วัด · [] = ไม่มีช่อง) + ขนาดภายนอก (ไว้เตือนตัวเลขแปลก) */
    compartments: parseCompartments((parent as { compartments?: unknown }).compartments),
    outer: {
      w: (parent as { size_length_cm?: unknown }).size_length_cm ?? null,
      h: (parent as { size_height_cm?: unknown }).size_height_cm ?? null,
      d: (parent as { size_thickness_cm?: unknown }).size_thickness_cm ?? null,
    },
    variants,
    shops: shopRows,
  });
}

type Patch = ListingPatch;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: { parentId?: string; shopId?: string; action?: string; patch?: Patch; nameRule?: Record<string, unknown> };
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

  // กฎชื่อของร้าน (ลบแบรนด์/คอลเลกชัน/รหัส/วงเล็บ) — เก็บที่ shops.field_map.name ใช้กับทุกสินค้าในร้าน
  if (b.action === "nameRule") {
    const flags = (b.nameRule ?? {}) as Partial<Record<NameRuleFlag, unknown>>;
    const { data: shop } = await sb.from("shops").select("field_map").eq("id", b.shopId).maybeSingle();
    if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
    const raw = ((shop as { field_map: unknown }).field_map ?? {}) as Record<string, unknown>;
    const before = normalizeFieldMap(raw).name;
    const name: Record<string, unknown> = { ...before };
    for (const f of NAME_RULE_FLAGS) if (typeof flags[f] === "boolean") name[f] = flags[f];
    // กฎคู่ที่เปิดพร้อมกันไม่ได้ (ลบข้อความในวงเล็บ ↔ ลบแค่วงเล็บ) — เปิดอันไหน ปิดอีกอัน
    for (const f of NAME_RULE_FLAGS) { const other = NAME_RULE_EXCLUSIVE[f]; if (flags[f] === true && other) name[other] = false; }
    const { error } = await sb.from("shops").update({ field_map: { ...raw, name } }).eq("id", b.shopId);
    if (error) return NextResponse.json({ error: "บันทึกกฎชื่อไม่สำเร็จ" }, { status: 500 });
    await writeAudit(sb, { action: "update", entityType: "shop_field_map", entityId: b.shopId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { field: "name", before, after: name, from: "parent_web_tab", parentId: b.parentId } });
    const purged = await purgeStorefrontCache(sb, b.shopId);
    return NextResponse.json({ ok: true, purged });
  }

  const p = b.patch ?? {};
  // ของกลาง: ฟิลด์ชุดเดียวกับ /api/website/listings (ขายบนเว็บ + รูป/สี/รูปเปิด + ปั๊มชื่อ/แบนเนอร์/รายละเอียด)
  const row: Record<string, unknown> = { shop_id: b.shopId, parent_sku_id: b.parentId, updated_at: new Date().toISOString(), ...listingPatchToRow(p) };

  const { error } = await sb.from("store_listings").upsert(row, { onConflict: "shop_id,parent_sku_id" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, { action: "update", entityType: "store_listing", entityId: b.parentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { shopId: b.shopId, patch: p } });
  // เว็บร้านแคชรายการสินค้าไว้ → สั่งล้างให้เห็นผลทันที (ล้มเหลว = เว็บอัปเดตเองใน ≤60 วิ)
  const purged = await purgeStorefrontCache(sb, b.shopId);
  return NextResponse.json({ ok: true, purged });
}
