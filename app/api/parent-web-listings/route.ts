/**
 * จัดการสินค้าบนเว็บร้านออนไลน์ของ Parent SKU — /api/parent-web-listings
 * ใช้ในแท็บ "🛍 เว็บไซต์" ของ Parent SKU (drawer + หน้าเต็ม) — แก้ได้เลยในแท็บ (แผน A)
 *
 * GET  ?parentId=  → รุ่น + ทุกร้าน (ขึ้น/ราคา/ชื่อ/รูป override + จับคู่รายละเอียดหน้าเว็บ)
 *                    + SKU ลูก (สต๊อก + รูปปก + แกลเลอรีรูปของ SKU ให้เลือกเป็นรูปเว็บรายสี) + ยอดขายเว็บ
 * POST { parentId, shopId, action:"add" }      → เพิ่มรุ่นเข้าร้านนั้น (ปิดไว้ก่อน)
 * POST { parentId, shopId, patch:{...} }        → แก้ override ของร้านนั้น (store_listings) แล้วสั่งเว็บร้านล้างแคช
 * POST { parentId, action:"skuFields", items:[{ skuId, colorTh?, colorEn?, price? }] }
 *                                               → ✏️ แก้ชื่อสี ไทย/อังกฤษ + ราคาขาย ที่ SKU ใน ERP จริง (lib/website-sku-fields · สิทธิ์ฟิลด์ + audit + การ์ดสีตาม)
 * POST { parentId, shopId, action:"nameRule", nameRule:{removeBrand?,removeCollection?,removeCode?,removeParens?,removeParenMarks?} }
 *                                               → กฎชื่อของร้าน (shops.field_map.name — ใช้ทุกสินค้าในร้าน)
 * GET คืน autoName ต่อร้าน = ชื่อที่เว็บใช้จริงเมื่อเว้นช่องชื่อว่าง (resolveName ตัวเดียวกับเว็บ)
 *     + ขายบนเว็บ (หมวด/หน่วย/สต๊อก/ป้าย/ตัวเลือกกรอกเอง/สีตัวอย่าง) + ค่าอัตโนมัติ + ที่ลูกค้าเห็นจริง + สิ่งที่ต้องแก้ (ของกลาง computeListingDisplay)
 * ⭐ ตัวตั้งค่าเว็บของสินค้า (components/parent-web-listings) ใช้ API นี้ทั้งในแท็บ 🛍 ของ Parent SKU และ drawer หน้า "สินค้าบนเว็บ"
 *    → ฟิลด์ที่บันทึกได้ = ชุดเดียวกับ /api/website/listings (ของกลาง lib/website-listing-patch)
 *
 * web_sku_images = { [skuId]: string[] }  รูปเว็บของสีนั้น (หลายรูปได้) — ค่าเก่าเป็น string เดี่ยว ยังอ่านได้
 * web_details    = { [detailItemId]: { show?: boolean, text?: string } }  ทับ "ชุดรายละเอียดสินค้า" ของธีมเฉพาะรุ่นนี้
 * web_variant_off = [skuId]  📐 คู่ สี×ไซส์ ที่ปิดไว้บนเว็บร้านนั้น (GET ส่ง sizeGrid = ตาราง สี×ไซส์ จาก SKU ลูก · lib/website-size-options)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin (store_* อยู่ DB เดียวกัน) + writeAudit + purgeStorefrontCache
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeTheme } from "@/lib/website-theme";
import { normalizeBanners } from "@/lib/website-banners";
import { isEmptyCardColors, normalizeCardColors, renameCardColor } from "@/lib/website-card-colors";
import { normalizeHero } from "@/lib/website-hero";
import { parseSkuFieldsInput, planSkuFields, type SkuFieldsRow } from "@/lib/website-sku-fields";
import { getFieldAccess } from "@/lib/field-permissions";
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
import { cleanListingSeo, cleanRelatedCodes, listingPatchToRow, toKeyList, type ListingPatch } from "@/lib/website-listing-patch";
import { computeListingDisplay } from "@/lib/website-listing-display";
import { readFitCheckShops, readSiteInfo } from "@/lib/website-site-info";
import { parseCompartments } from "@/lib/fit-check";
import { CHILD_SELECT, sortKids, type ChildSku } from "@/lib/website-field-map";
import { SwatchIndex, rowToSwatchEntry, swatchCss, SWATCH_SELECT } from "@/lib/color-swatch";
import { baseColor, baseColorEn, buildSizeGrid, cleanVariantOff, variantOf } from "@/lib/website-size-options";
import { resolveSizeGuide } from "@/lib/website-size-guides";
import { readSizeGuidesMany } from "@/lib/website-size-guides-db";
import { categoryPathLabel } from "@/lib/website-category-tree";
import { loadTagContext } from "@/lib/website-tag-categories-db";
import { tagRuleCategories } from "@/lib/website-tag-categories";

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
    // SKU ที่ใช้งานทุกตัว = ชุดเดียวกับที่เว็บโชว์ (เดิมกรองราคา > 0 → รุ่นที่ยังไม่ตั้งราคา SKU ไม่มีแถวให้แก้เลย)
    sb.from("skus_v2").select("id, code, color, color_th, list_price, cover_image_r2_key, attribute_values").eq("parent_sku_id", parentId).eq("is_active", true).order("code"),
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
  // 📐 SKU ไซส์ (มี variant_option) ไม่ต้องมีแถวรูปของตัวเอง — เว็บใช้รูปของตัวหลักของสีนั้น (แถวรูปจะได้ไม่ซ้ำสีละหลายแถว)
  const allKids = (children ?? []) as (Record<string, unknown> & { id: string; code: string | null; color: string | null; color_th: string | null })[];
  const baseColors = new Set(allKids.filter((k) => !variantOf(k)).map((k) => baseColor(k)));
  const kids = allKids.filter((k) => !variantOf(k) || !baseColors.has(baseColor(k)));
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
    const label = baseColor(k);
    return {
      id: k.id as string,
      code: (k.code as string) ?? "",
      /** ชื่อสีที่เว็บโชว์ (ไทยก่อน) — ตัวเดียวกับเว็บ (lib/website-size-options baseColor) */
      label: label || `แบบ ${i + 1}`,
      /** ✏️ ค่าดิบใน SKU ให้แก้ในแถวสี: สี (ไทย) = color_th · ชื่ออังกฤษ = color (ช่อง Color) */
      colorTh: String(k.color_th ?? "").trim(),
      colorEn: String(k.color ?? "").trim(),
      /** 🌐 ชื่ออังกฤษที่เว็บใช้ตอนนี้ (ช่อง Color ถ้าเป็นอังกฤษ → ไม่งั้นทะเบียนสีกลาง · ว่าง = ใช้ชื่อไทย) */
      labelEn: baseColorEn(k) || (label ? swatches.english(label) : ""),
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
  // 📏 ตารางไซส์ของแต่ละร้าน (เลือกทับรายรุ่นได้ · อัตโนมัติ = ตามหมวด)
  const guidesByShop = await readSizeGuidesMany(sb, ((shops ?? []) as { id: string }[]).map((s) => s.id));
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
  // 🏷️ แท็กของรุ่นนี้ (คิดหมวดจากกฎแท็กของแต่ละร้าน) — โหลดเฉพาะเมื่อมีร้านตั้งกฎไว้
  const anyTagRules = ((shops ?? []) as ShopRow[]).some((s) => Object.keys(normalizeFieldMap(s.field_map).category.tagRules).length > 0);
  const tagCtx = anyTagRules ? await loadTagContext(sb, [parentRow.id]) : null;
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
    const tagCategories = tagCtx ? tagRuleCategories(fieldMap.category.tagRules, tagCtx.tagsOf(parentRow.id), tagCtx.depthOf) : undefined;
    const view = computeListingDisplay({ fieldMap, parent: parentRow, kids: webKids, listing: l ?? null, categoryName: catName, swatches, siteUrl: siteUrls.get(s.id) ?? null, code, fitCheck: fitShops.has(s.id), tagCategories });

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
      /** 📐 คู่ สี×ไซส์ ที่ปิดไว้บนเว็บร้านนี้ (id SKU ไซส์) + ร้านเปิดใช้ตัวเลือกชุดที่ 2 อยู่ไหม (แท็บ ⚙️ จับคู่ฟิลด์) */
      webVariantOff: cleanVariantOff(l?.web_variant_off),
      options2On: fieldMap.options2.source === "variant_option",
      /** 📏 ตารางไซส์: ที่เลือกทับ ("" = อัตโนมัติ · "none" · id) + รายการของร้าน + ตารางที่ใช้อัตโนมัติตามหมวด */
      webSizeGuide: typeof l?.web_size_guide === "string" ? (l.web_size_guide as string) : "",
      /** 🔗 สินค้าที่เกี่ยวข้องที่เลือกเองรายรุ่น (รหัสรุ่น) — [] = ใช้กฎกลางของธีม */
      webRelated: cleanRelatedCodes(l?.web_related),
      webSeo: cleanListingSeo(l?.web_seo),
      sizeGuides: (guidesByShop.get(s.id) ?? []).map((g) => ({ id: g.id, name: g.name })),
      autoSizeGuide: resolveSizeGuide(guidesByShop.get(s.id) ?? [], view.categories, fieldMap.categories, null)?.name ?? null,
      /** หมวดของร้านนี้ (แท็บ 📂 หมวดหมู่) */
      shopCategories: fieldMap.categories.map((c) => ({ key: c.key, label: categoryPathLabel(fieldMap.categories, c.key), icon: c.icon ?? "" })),
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
  // 📐 ตาราง สี×ไซส์ (เหมือนกันทุกร้าน — ร้านต่างกันแค่คู่ที่ปิดไว้ webVariantOff) · null = รุ่นนี้ไม่มี SKU ไซส์
  const grid = buildSizeGrid(sortKids(webKids));
  const sizeGrid = grid
    ? {
        ...grid,
        colors: grid.colors.map((c) => {
          const spec = swatches.resolve(c.label);
          return { ...c, swatch: spec ? swatchCss(spec, (k) => `/api/r2-image?key=${encodeURIComponent(k)}&w=64`) : null };
        }),
      }
    : null;
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
    sizeGrid,
    shops: shopRows,
  });
}

type Patch = ListingPatch;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: { parentId?: string; shopId?: string; action?: string; patch?: Patch; nameRule?: Record<string, unknown>; items?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // ✏️ แก้ชื่อสี (ไทย/อังกฤษ) + ราคาขาย ของ SKU ลูก จากแถวสี — แก้ที่ SKU ใน ERP จริง (ไม่ผูกร้าน)
  if (b.action === "skuFields") {
    if (!b.parentId) return NextResponse.json({ error: "ต้องระบุ parentId" }, { status: 400 });
    return saveSkuFields(request, supabaseAdmin(), b.parentId, b.items, user);
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

/**
 * ✏️ action "skuFields" — { parentId, items:[{ skuId, colorTh?, colorEn?, price? }] }
 * สี (ไทย) → color_th · ชื่ออังกฤษ → color (ช่อง Color) · ราคา → list_price — ของกลาง lib/website-sku-fields (กฎ + SKU ไซส์ตาม + กันชื่อซ้ำ)
 * เคารพสิทธิ์ระดับฟิลด์ของ skus_v2 (ทะเบียนฟิลด์กลาง) · audit ค่าเก่า/ใหม่ทีละ SKU · ชื่อในการตั้งค่าการ์ดทุกร้านเปลี่ยนตาม · ล้างแคชเว็บร้าน
 */
async function saveSkuFields(
  request: NextRequest,
  sb: ReturnType<typeof supabaseAdmin>,
  parentId: string,
  rawItems: unknown,
  user: { id: string; email?: string | null } | null
): Promise<NextResponse> {
  const inputs = parseSkuFieldsInput(rawItems);
  if (typeof inputs === "string") return NextResponse.json({ error: inputs }, { status: 400 });

  const { data: rows, error: loadErr } = await sb
    .from("skus_v2")
    .select("id, code, color, color_th, list_price, attribute_values")
    .eq("parent_sku_id", parentId)
    .eq("is_active", true);
  if (loadErr) return NextResponse.json({ error: "โหลด SKU ไม่สำเร็จ" }, { status: 500 });
  const plan = planSkuFields((rows ?? []) as SkuFieldsRow[], inputs);
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 400 });
  if (!plan.updates.length) return NextResponse.json({ ok: true, updated: 0 });

  // สิทธิ์ระดับฟิลด์ (ของกลาง) — ช่องที่ role นี้แก้ไม่ได้ = ไม่บันทึกเลยทั้งชุด (ไม่บันทึกครึ่ง ๆ)
  const access = await getFieldAccess(request, sb, "skus_v2");
  const blocked = [...new Set(plan.updates.flatMap((u) => Object.keys(u.patch)))].filter((c) => access.readonlyCols.includes(c));
  if (blocked.length) {
    const names: Record<string, string> = { color_th: "สี (ไทย)", color: "ชื่อสีอังกฤษ", list_price: "ราคาขาย" };
    return NextResponse.json({ error: `คุณไม่มีสิทธิ์แก้ ${blocked.map((c) => names[c] ?? c).join(", ")} ของ SKU` }, { status: 403 });
  }

  for (const u of plan.updates) {
    const { error } = await sb.from("skus_v2").update(u.patch).eq("id", u.id).eq("parent_sku_id", parentId);
    if (error) return NextResponse.json({ error: `บันทึก ${u.code} ไม่สำเร็จ` }, { status: 500 });
    await writeAudit(sb, {
      action: "update",
      entityType: "skus_v2",
      entityId: u.id,
      actorId: user?.id ?? null,
      actorName: user?.email ?? null,
      metadata: { via: "web_listing_color_row", parent_sku_id: parentId, sku_code: u.code, changes: u.changes },
    });
  }

  // ชื่อสีที่เว็บโชว์เปลี่ยน → ชื่อในการตั้งค่าการ์ด (สีที่โชว์/สีหลัก) ทุกร้านเปลี่ยนตาม ไม่งั้นสีนั้นหลุดจากการ์ด
  const { data: lst } = await sb.from("store_listings").select("shop_id, web_card_colors").eq("parent_sku_id", parentId);
  const listings = (lst ?? []) as { shop_id: string; web_card_colors: unknown }[];
  if (plan.renames.length) {
    for (const l of listings) {
      const cur = normalizeCardColors(l.web_card_colors);
      const next = plan.renames.reduce((cc, r) => renameCardColor(cc, r.from, r.to), cur);
      if (next === cur) continue;
      await sb.from("store_listings").update({ web_card_colors: isEmptyCardColors(next) ? null : next }).eq("shop_id", l.shop_id).eq("parent_sku_id", parentId);
      await writeAudit(sb, { action: "update", entityType: "store_listing", entityId: parentId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { shopId: l.shop_id, kind: "card_colors_rename", renames: plan.renames } });
    }
  }
  // เว็บร้านที่ขายรุ่นนี้ล้างแคช → เห็นชื่อ/ราคาใหม่ทันที (ล้มเหลว = อัปเดตเองใน ≤60 วิ)
  const shopIds = [...new Set(listings.map((l) => l.shop_id))];
  const purged = (await Promise.all(shopIds.map((id) => purgeStorefrontCache(sb, id)))).every(Boolean);
  return NextResponse.json({ ok: true, updated: plan.updates.length, renames: plan.renames, purged });
}
