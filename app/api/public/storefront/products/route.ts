/**
 * API สาธารณะสำหรับเว็บร้านค้าภายนอก — /api/public/storefront/products?shop=<slug>
 *
 * ใครเรียกได้: ทุกคน (ไม่ต้องล็อกอิน) — เว็บร้าน เช่น IG International ดึงไปแสดงหน้าเว็บ
 * ปลอดภัยเพราะ: ส่งเฉพาะสินค้าที่ "เผยแพร่แล้ว" (is_published) ของร้านนั้น
 * และเลือกเฉพาะฟิลด์ที่ตั้งใจให้ลูกค้าเห็น — ไม่มีต้นทุน/ข้อมูลภายใน/สต๊อกจริง
 * (pattern เดียวกับ /api/offer-sheets/public/[token] ที่เปิดสาธารณะโดยตั้งใจ)
 *
 * ค่าที่ส่ง = store_listings ที่กรอกทับ ถ้าเว้นว่างจะดึงจาก Parent SKU ตาม shops.field_map
 * (ดู lib/website-field-map.ts)
 *
 * ⚠️ ต่างจาก API อื่นในระบบ: route นี้ "ไม่มี guardApi" โดยเจตนา และมี CORS
 */
import { NextRequest, NextResponse } from "next/server";
import { commonLabelEn } from "@/lib/content-i18n";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeTheme } from "@/lib/website-theme";
import { loadProofCounts } from "@/lib/website-proof-db";
import {
  normalizeFieldMap,
  resolveProduct,
  attachNameRefs,
  nameRuleNeedsRefs,
  CHILD_SELECT,
  resolveComparePrice,
  type ParentRow,
  type ChildSku,
} from "@/lib/website-field-map";
import { cleanDetailOverrides } from "@/lib/website-detail-overrides";
import { loadParentWebFields, loadParentImageFields, resolveRelatedValues, productWebAttrs } from "@/lib/website-parent-fields";
import { normalizePersonalize } from "@/lib/website-personalize";
import { baseColor } from "@/lib/website-size-options";
import { productDimensions, bilingualDimensions, fitLabels, type FitItem, type DimensionRow } from "@/lib/product-fits";
import { fitNames, fitTargetOf, parseCompartments, withFitLines, type FitTarget } from "@/lib/fit-check";
import { readFitCheckShops, readSiteInfo } from "@/lib/website-site-info";
import { normalizeBanners } from "@/lib/website-banners";
import { SwatchIndex, swatchCss, rowToSwatchEntry, SWATCH_SELECT } from "@/lib/color-swatch";
import { normalizeCardColors, resolveCardColors } from "@/lib/website-card-colors";
import { normalizeHero, type HeroMedia } from "@/lib/website-hero";
import { dropFromRow, hiddenDropCodes, liveDropByCode } from "@/lib/website-new-drops";
import { rowToTone, tonesOfLabel, TONE_SELECT } from "@/lib/color-tone";
import { productSlug } from "@/lib/website-links";
import { badgeColorOf } from "@/lib/website-card-badges";
import { readCardBadges } from "@/lib/website-card-badges-db";
import { publicSizeGuide, resolveSizeGuide } from "@/lib/website-size-guides";
import { readSizeGuides } from "@/lib/website-size-guides-db";
import { loadTagCategoryResolver } from "@/lib/website-tag-categories-db";
import { withParentCategories } from "@/lib/website-category-tree";
import { findMaterialLinks, MATERIAL_SELECT, type MaterialRow } from "@/lib/product-materials";
import { cleanListingSeo, cleanRelatedCodes } from "@/lib/website-listing-patch";
import { ratingSummaries } from "@/lib/website-reviews-server";
import { storefrontCors, corsPreflight } from "@/lib/storefront-cors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// อ่านอย่างเดียว + เป็นข้อมูลที่ตั้งใจเผยแพร่อยู่แล้ว → อนุญาตทุกโดเมน แต่ห้ามส่ง cookie/credential
const CORS = storefrontCors("GET");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    // ⚠️ ห้ามแคชที่ขอบเครือข่าย (Vercel CDN) — ไม่งั้นเว็บร้านล้างแคชแล้วยังได้รายการสินค้าเก่าอีก ≤6 นาที
    // (เว็บร้านแคชเองด้วย tag 'site-config' และ ERP สั่งล้างหลังบันทึก/เผยแพร่อยู่แล้ว) — site/page ใช้ no-store เหมือนกัน
    headers: { ...CORS, "Cache-Control": "no-store" },
  });

/** สร้าง slug จากรหัสสินค้า (ใช้เป็น URL บนเว็บร้าน) — ของกลางที่ lib/website-links.ts (ตัวเลือกลิงก์ใช้สูตรเดียวกัน) */
const slugify = productSlug;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, status, field_map, theme")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const s = shop as { id: string; name: string; status: string; field_map: unknown; theme: unknown };
  if (s.status !== "active") return json({ shop: shopSlug, products: [] });

  const fieldMap = normalizeFieldMap(s.field_map);
  // 🆕 มาใหม่เป็นชุด: รุ่นในชุดที่ยังไม่ถึงเวลาเปิด (ตั้งซ่อน) = ไม่ส่งออกเว็บเลย · รุ่นในชุดที่เปิดอยู่ = แนบ newDrop (ป้าย "ใหม่" + Section)
  const { data: dropRows } = await sb.from("store_new_drops").select("id, start_at, end_at, codes, hide_until_start").eq("shop_id", s.id);
  const drops = ((dropRows ?? []) as Record<string, unknown>[]).map(dropFromRow);
  const dropHidden = hiddenDropCodes(drops);
  const dropLive = liveDropByCode(drops);

  const { data: listData } = await sb
    .from("store_listings")
    .select(
      "parent_sku_id, is_published, featured, sort_order, web_name, web_price, web_description, web_images, web_sku_images, web_details, web_personalize, web_banners, web_card_colors, web_hero, created_at, web_unit, web_category, web_categories, web_options, web_badge, web_stock_status, web_swatch, web_variant_off, web_size_guide, web_related, web_seo"
    )
    .eq("shop_id", s.id)
    .eq("is_published", true)
    .order("sort_order")
    .order("created_at");

  const rows = (listData ?? []) as Record<string, unknown>[];
  if (!rows.length) return json({ shop: shopSlug, shopName: s.name, count: 0, products: [] });

  const parentIds = rows.map((r) => r.parent_sku_id as string).filter(Boolean);

  // ดึงทุกคอลัมน์ แล้วค่อยคัดเฉพาะฟิลด์ที่อนุญาตให้ออกเว็บ (ทะเบียนฟิลด์ + บัญชีดำ) ก่อนส่ง — ต้นทุน/ข้อมูลภายในไม่หลุด
  const [{ data: parents }, { data: children }, parentFields, { data: swatchRows }, imageFieldDefs] = await Promise.all([
    sb.from("parent_skus_v2").select("*").in("id", parentIds),
    sb.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", parentIds).eq("is_active", true),
    loadParentWebFields(sb),
    // 🎨 ทะเบียนสีกลาง → จุดสีของแต่ละตัวเลือก (ดู lib/color-swatch.ts)
    sb.from("erp_color_dictionary").select(SWATCH_SELECT).eq("is_active", true),
    // 🖼 ฟิลด์รูปของ Parent SKU → แบนเนอร์เลือก "ฟิลด์รูปของ Parent SKU" ได้
    loadParentImageFields(sb),
  ]);
  // 📏 รายการกลาง "ใส่อะไรได้บ้าง" + ✅ "รายละเอียดเพิ่ม (ติ๊ก)" (ตารางเล็ก) → หัวข้อ "ขนาด" / ต่อท้าย "รายละเอียดสินค้า"
  const [{ data: fitRows }, { data: hlRows }, { data: toneRows }, cardBadges, { data: matRows }, sizeGuides] = await Promise.all([
    sb.from("product_fit_items").select("id, name, name_en, is_active, kind, width_cm, height_cm, depth_cm, is_soft, size_estimated, sort_order").eq("is_active", true).order("sort_order"),
    sb.from("product_highlight_items").select("id, name, name_en, is_active, variant_mode, variants").eq("is_active", true).order("sort_order"),
    // 🎨 โทนสี (ของกลาง) → ตัวเลือกแต่ละสีบอกว่าอยู่โทนไหน (ปุ่ม "กรองตามสี" บนเว็บ · ดู lib/color-tone.ts)
    sb.from("erp_color_tones").select(TONE_SELECT).eq("is_active", true).order("sort_order"),
    // 🏷 ป้ายบนการ์ดของร้าน (ชื่อ + สี) → badgeColor ของแต่ละสินค้า
    readCardBadges(sb, s.id),
    // 🧵 วัสดุ → ชื่อวัสดุในคำอธิบายลิงก์ไปหน้าวัสดุบนเว็บ (เฉพาะที่มีหน้าแล้ว · lib/product-materials)
    sb.from("product_materials").select(MATERIAL_SELECT).eq("is_active", true).order("sort_order"),
    // 📏 ตารางไซส์ของร้าน (ตั้งต่อหมวด · ทับรายรุ่นได้) — lib/website-size-guides
    readSizeGuides(sb, s.id),
  ]);
  const materials = (matRows ?? []) as MaterialRow[];
  const colorTones = ((toneRows ?? []) as Parameters<typeof rowToTone>[0][]).map(rowToTone);
  const fitCatalog = (fitRows ?? []) as FitItem[];
  // 📐 เช็คขนาด (เปิดต่อร้าน): ตุ๊กตา/ของที่มีขนาด × ช่องใส่ของของแต่ละรุ่น → บรรทัด "ใส่ได้" (lib/fit-check)
  const fitOn = (await readFitCheckShops(sb)).has(s.id);
  const fitTargets: FitTarget[] = fitOn ? ((fitRows ?? []) as Parameters<typeof fitTargetOf>[0][]).map((r) => fitTargetOf(r)).filter((x): x is FitTarget => !!x) : [];
  const fitTargetsEn: FitTarget[] = fitOn ? ((fitRows ?? []) as Parameters<typeof fitTargetOf>[0][]).map((r) => fitTargetOf(r, "en")).filter((x): x is FitTarget => !!x) : [];

  const highlightCatalog = (hlRows ?? []) as FitItem[];
  const swatches = new SwatchIndex(((swatchRows ?? []) as Parameters<typeof rowToSwatchEntry>[0][]).map(rowToSwatchEntry));
  const relatedValues = await resolveRelatedValues(sb, parentFields, (parents ?? []) as Record<string, unknown>[]);
  // 🧭 ชื่อคอลเลกชัน (ตัวกรอง "คอลเลกชัน" บนเว็บ)
  const collIds = [...new Set(((parents ?? []) as { collection_id?: string | null }[]).map((p) => p.collection_id).filter(Boolean))] as string[];
  const collName = new Map<string, string>();
  if (collIds.length) {
    const { data: colls } = await sb.from("collections").select("id, name").in("id", collIds);
    for (const c of (colls ?? []) as { id: string; name: string | null }[]) if (c.name?.trim()) collName.set(c.id, c.name.trim());
  }

  // กฎชื่อของร้าน "ลบแบรนด์/คอลเลกชัน" ต้องรู้ชื่อแบรนด์/คอลเลกชันก่อน
  if (nameRuleNeedsRefs(fieldMap)) await attachNameRefs(sb, (parents ?? []) as ParentRow[]);
  const parentById = new Map(((parents ?? []) as ParentRow[]).map((p) => [p.id, p]));
  // 👀🔥 ป้ายคนดู/ขายแล้ว (ธีมที่เผยแพร่ · theme.page.proof) — ส่งเฉพาะป้ายที่ร้านเปิด + ตัวเลขถึงขั้นต่ำ (lib/website-proof-db)
  const proofCounts = await loadProofCounts(sb, s.id, normalizeTheme(s.theme).page.proof, new Map([...parentById.values()].map((p) => [p.id, p.code ?? ""])));

  const kidsByParent = new Map<string, ChildSku[]>();
  for (const k of (children ?? []) as (ChildSku & { parent_sku_id: string })[]) {
    const arr = kidsByParent.get(k.parent_sku_id) ?? [];
    arr.push(k);
    kidsByParent.set(k.parent_sku_id, arr);
  }

  // แกลเลอรีของ Parent SKU (รูปปก + รูปเพิ่มเติม) — ⚙️ แบนเนอร์เลือก "รูปจากแกลเลอรี Parent SKU" ได้
  const parentGallery = new Map<string, string[]>();
  const { data: pAtt } = await sb
    .from("erp_playground_attachments")
    .select("entity_id, file_path, content_type, is_primary, sort_order")
    .eq("entity_type", "parent_skus_v2")
    .in("entity_id", parentIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  for (const a of (pAtt ?? []) as { entity_id: string; file_path: string | null; content_type: string | null }[]) {
    if (!a.file_path || (a.content_type && !a.content_type.startsWith("image/"))) continue;
    const arr = parentGallery.get(a.entity_id) ?? [];
    if (!arr.includes(a.file_path) && arr.length < 12) arr.push(a.file_path);
    parentGallery.set(a.entity_id, arr);
  }

  // อันดับขายดี (จากออเดอร์บนเว็บของร้านนี้ ไม่รวมยกเลิก) — ส่งเป็น "อันดับ" ไม่ส่งจำนวนจริง
  const salesRank = new Map<string, number>();
  // 🛍 ซื้อคู่กันบ่อย: รุ่นที่อยู่ในออเดอร์เดียวกันบ่อยสุด 3 อันดับ (ออเดอร์ล่าสุด 2,000 ใบ) — หน้าสินค้า "ซื้อคู่กันบ่อย"
  const boughtWith = new Map<string, string[]>();
  {
    const { data: orders } = await sb.from("store_orders").select("id").eq("shop_id", s.id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(2000);
    const orderIds = ((orders ?? []) as { id: string }[]).map((o) => o.id);
    if (orderIds.length) {
      const { data: items } = await sb.from("store_order_items").select("order_id, parent_code, qty").in("order_id", orderIds);
      const qtyByCode = new Map<string, number>();
      for (const it of (items ?? []) as { parent_code: string | null; qty: number | string | null }[]) {
        const c = (it.parent_code ?? "").toUpperCase();
        if (c) qtyByCode.set(c, (qtyByCode.get(c) ?? 0) + (Number(it.qty) || 0));
      }
      [...qtyByCode.entries()].sort((a, b) => b[1] - a[1]).forEach(([c], i) => salesRank.set(c, i + 1));
      const codesByOrder = new Map<string, Set<string>>();
      for (const it of (items ?? []) as { order_id: string; parent_code: string | null }[]) {
        const c = (it.parent_code ?? "").toUpperCase();
        if (!c) continue;
        const set = codesByOrder.get(it.order_id) ?? new Set<string>();
        set.add(c);
        codesByOrder.set(it.order_id, set);
      }
      const pair = new Map<string, Map<string, number>>();
      for (const set of codesByOrder.values()) {
        if (set.size < 2 || set.size > 12) continue;
        for (const a of set) for (const b of set) if (a !== b) {
          const m = pair.get(a) ?? new Map<string, number>();
          m.set(b, (m.get(b) ?? 0) + 1);
          pair.set(a, m);
        }
      }
      for (const [a, m] of pair) boughtWith.set(a, [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c]) => c));
    }
  }

  // ⭐ ดาวเฉลี่ยต่อรุ่น (ร้านเปิดรีวิว · เฉพาะรีวิวที่ขึ้นเว็บ · lib/website-reviews-server)
  //   ส่งเฉพาะร้านที่เปิด "โชว์ดาวบนการ์ด" (หน้าสินค้าดึงรีวิวเองแยกต่างหาก)
  const revInfo = await readSiteInfo(sb, s.id);
  const ratings = revInfo.reviews_enabled && revInfo.reviews_show_cards ? await ratingSummaries(sb, s.id) : new Map<string, { avg: number; count: number }>();

  // ชื่อหมวดใน ERP (ใช้จับคู่เป็นหมวดเว็บ)
  const catIds = [...new Set(((parents ?? []) as ParentRow[]).map((p) => p.category_id).filter(Boolean))] as string[];
  const catName = new Map<string, string>();
  if (catIds.length) {
    const { data: cats } = await sb.from("product_categories").select("id, name").in("id", catIds);
    for (const c of (cats ?? []) as { id: string; name: string }[]) catName.set(c.id, c.name);
  }

  // 🏷️ หมวดจากกฎแท็ก (ร้านไม่มีกฎ = ไม่ยิง query) — lib/website-tag-categories
  const tagCatsOf = await loadTagCategoryResolver(sb, fieldMap.category.tagRules, [...parentById.keys()]);

  // รูปเสิร์ฟผ่าน proxy สาธารณะของระบบ (/api/r2-image) — เว็บภายนอกใช้ URL นี้ได้เลย
  const origin = new URL(request.url).origin;
  const imageUrl = (key: string) => `${origin}/api/r2-image?key=${encodeURIComponent(key)}`;

  // 🌐 ภาษาอังกฤษของหน่วย/ชื่อชุดตัวเลือกที่ร้านตั้งไว้ (แท็บจับคู่ฟิลด์ · lib/content-i18n carryTranslations)
  const unitEn = String((fieldMap.unit as { default_en?: unknown }).default_en ?? "").trim();
  const optLabel = fieldMap.options.label || "แบบ/สี";
  const optLabelEn = String((fieldMap.options as { label_en?: unknown }).label_en ?? "").trim();
  const optLabel2En = String((fieldMap.options2 as { label_en?: unknown }).label_en ?? "").trim();

  const products = rows
    .map((l) => {
      const p = parentById.get(l.parent_sku_id as string);
      if (!p) return null;

      const kids = kidsByParent.get(p.id) ?? [];
      const cat = p.category_id ? catName.get(p.category_id) ?? null : null;
      const r = resolveProduct(fieldMap, p, kids, l, cat, tagCatsOf(p.id));

      const code = p.code ?? "";
      if (dropHidden.has(code.toUpperCase())) return null;
      const liveDrop = dropLive.get(code.toUpperCase());
      const detailOverrides = cleanDetailOverrides(l.web_details);
      // 🔤 ปั๊มชื่อ: ส่งเฉพาะรุ่นที่เปิดไว้ (รูปฉาก → URL · ไม่ได้เลือก = รูปแรกของสินค้า)
      // 🎨 ค่าแยกตามสี: คีย์ id SKU ลูก → รหัสตัวเลือกสีที่เว็บใช้ (options.items[].id ของสีเดียวกัน — สีเดียวมีหลาย SKU ไซส์ได้)
      const pz = l.web_personalize ? normalizePersonalize(l.web_personalize) : null;
      const optIdByColor = new Map((r.options?.items ?? []).map((it) => [it.label, it.id]));
      const optIdOfSku = (skuId: string) => {
        const kid = kids.find((k) => k.id === skuId);
        return (kid && optIdByColor.get(baseColor(kid as unknown as Parameters<typeof baseColor>[0]))) ?? `sku-${skuId.slice(0, 8)}`;
      };
      const personalize = pz?.enabled
        ? {
            ...pz,
            imageUrl: imageUrl(pz.imageKey ?? r.images[0] ?? p.cover_image_r2_key ?? ""),
            positions: pz.positions.filter((x) => x.enabled),
            // 🖼 ฉากพรีวิวเพิ่ม: รูป → URL (เว็บร้านสลับเป็นรูปมุมเดียวกันของสีที่เลือกเอง) · ตำแหน่งที่ไม่โชว์ = ตัดทิ้ง
            // 🎨 ฉากจำกัดสี: id SKU ลูก → รหัสตัวเลือกสี (ไม่จำกัด = ทุกสี)
            scenes: pz.scenes.map((sc) => ({ id: sc.id, label: sc.label, imageUrl: imageUrl(sc.imageKey), positions: sc.positions.filter((x) => x.show), colors: [...new Set(sc.colors.map(optIdOfSku))] })),
            colorOverrides: Object.fromEntries(Object.entries(pz.colorOverrides).map(([skuId, o]) => [optIdOfSku(skuId), o])),
          }
        : null;
      const attrs = productWebAttrs(p as unknown as Record<string, unknown>, parentFields, relatedValues);
      return {
        id: p.id,
        code,
        slug: slugify(code),
        /** 🆕 อยู่ในชุดมาใหม่ที่เปิดอยู่ (ป้าย "ใหม่" ถึง endAt · Section แหล่ง "ชุดมาใหม่") */
        newDrop: liveDrop ? { id: liveDrop.id, startAt: liveDrop.startAt, endAt: liveDrop.endAt } : undefined,
        name: r.name,
        description: r.description,
        // 🌐 ภาษาอังกฤษ (เว็บหน้า /en สลับ <key>_en ให้เอง · ว่าง = ไม่ส่ง → ใช้ไทย)
        ...(r.name_en ? { name_en: r.name_en } : {}),
        ...(r.description_en ? { description_en: r.description_en } : {}),
        /** 🧵 วัสดุที่พูดถึงในคำอธิบาย (ไทย/อังกฤษ) หรือฟิลด์สเปกที่ส่งออกเว็บ (เช่น Description/วัสดุ) + มีหน้าวัสดุแล้ว → เว็บทำคำเหล่านั้นเป็นลิงก์ /materials/<slug> · ไม่มี = ไม่ส่ง */
        ...(() => {
          const links = findMaterialLinks([r.description, r.description_en, ...Object.values(attrs)], materials);
          return links.length ? { materialLinks: links } : {};
        })(),
        /** ราคาเป็น "บาท" (ไม่ใช่สตางค์) */
        price: r.price,
        /** ราคาเต็ม (ขีดฆ่า) — fake_price ของ Parent SKU หรือของ SKU ลูก · ส่งเฉพาะเมื่อสูงกว่าราคาขาย (resolveComparePrice) */
        comparePrice: resolveComparePrice(p.fake_price, kids, r.price),
        /** ราคาแต่ละตัวเลือกไม่เท่ากัน (ราคามาจาก SKU ลูก + ไม่ได้กรอกราคาเว็บทับ) → การ์ดโชว์ "เริ่มต้น ฿…" ได้ · price = ราคาต่ำสุด */
        priceVaries: r.priceVaries,
        /**
         * 💰 ราคาต่อตัวเลือก (บาท) { "sku-xxxxxxxx" | "sku-xxxxxxxx|opt2-yyyyyyyy": { price, compare? } } — เฉพาะเมื่อราคาไม่เท่ากัน
         * เว็บเปลี่ยนราคาตามที่เลือก + ตะกร้าใช้ราคานี้ · ออเดอร์คิดซ้ำฝั่งเซิร์ฟเวอร์ด้วยสูตรเดียวกัน (skuUnitPrice)
         */
        ...(r.variantPrices ? { variantPrices: r.variantPrices } : {}),
        /**
         * 📏 ตารางไซส์ของรุ่นนี้ (เฉพาะรุ่นที่มีไซส์) — ป๊อปตาราง + ช่วงใต้ปุ่มไซส์ (fitColumn) + ตัวช่วยแนะนำไซส์ (rows[].min/max)
         * ทับรายรุ่น (web_size_guide) ชนะ ไม่งั้นตามหมวด (หมวดย่อยชนะหมวดแม่)
         */
        ...(() => {
          if (!r.options2 || !sizeGuides.length) return {};
          const g = resolveSizeGuide(sizeGuides, r.categories, fieldMap.categories, l.web_size_guide);
          return g ? { sizeGuide: publicSizeGuide(g) } : {};
        })(),
        /** 🔗 สินค้าที่เกี่ยวข้องที่เลือกเองรายรุ่น (รหัสรุ่น เรียงตามที่เลือก · กฎ "📌 เลือกเองรายรุ่น" ของธีม) — ไม่ได้เลือก = ไม่ส่ง */
        ...(() => {
          const own = String(p.code ?? "").toUpperCase();
          const codes = cleanRelatedCodes(l.web_related).filter((c) => c !== own);
          return codes.length ? { related: codes } : {};
        })(),
        /** 🔎 SEO รายสินค้า (ชื่อ/คำอธิบายใน Google · *_en = หน้า /en) — ไม่ได้ตั้ง = ไม่ส่ง */
        ...(() => {
          const seo = cleanListingSeo(l.web_seo);
          return seo ? { seo } : {};
        })(),
        /** วันที่ขึ้นร้านนี้ (ป้าย "ใหม่" อัตโนมัติ) */
        listedAt: typeof l.created_at === "string" ? l.created_at : null,
        unit: r.unit,
        // 🌐 หน่วยภาษาอังกฤษ: ที่ตั้งในแท็บจับคู่ฟิลด์ชนะ (เฉพาะหน่วยตั้งต้น) · ไม่ตั้ง = คำมาตรฐาน (ใบ → pc)
        ...(() => {
          const en = (!String(l.web_unit ?? "").trim() && unitEn) || commonLabelEn(r.unit);
          return en ? { unit_en: en } : {};
        })(),
        category: r.category,
        /** 📂 ทุกหมวดที่อยู่ (หลายหมวดได้ · ตัวแรก = category) + หมวดแม่ของหมวดย่อย (สินค้าในหมวดย่อยขึ้นในหน้าหมวดแม่ด้วย) — หน้าร้านกรองหมวดด้วยรายการนี้ */
        categories: withParentCategories(fieldMap.categories, r.categories),
        badge: String(l.web_badge ?? "").trim(),
        /** 🏷 สีป้าย (ตามรายการป้ายของร้าน · ป้ายนอกรายการ = ไม่ส่ง → สีป้ายปกติของธีม) */
        badgeColor: badgeColorOf(cardBadges, l.web_badge as string | null) ?? undefined,
        stock: String(l.web_stock_status ?? "in").trim() || "in",
        swatch: String(l.web_swatch ?? "").trim(),
        // รูปต่อสี (r2 key → URL) ให้เว็บสลับรูปใหญ่ตอนเลือกสี
        // image = รูปแรก · images = ทั้งชุดของสีนั้น (เลือกไว้ในแท็บ 🛍 เว็บไซต์) → เว็บโชว์เฉพาะชุดนี้เมื่อเลือกสี
        // swatch = ค่า CSS background ของจุดสี — ที่กรอกเองในหน้าจัดการชนะ · ไม่งั้นหาจากทะเบียนสีกลาง (ยังไม่ตั้ง = ไม่ส่ง เว็บใช้รูปเล็กแทน)
        options: r.options
          ? {
              ...r.options,
              // 🌐 ชื่อชุดตัวเลือกภาษาอังกฤษ (ตั้งในแท็บจับคู่ฟิลด์ · ไม่ตั้ง = คำมาตรฐาน สี → Colour)
              ...(() => {
                const en = (r.options.label === optLabel && optLabelEn) || commonLabelEn(r.options.label);
                return en ? { label_en: en } : {};
              })(),
              items: r.options.items.map((it) => {
                const spec = it.swatch ? null : swatches.resolve(it.label);
                // 🌐 ชื่อสีภาษาอังกฤษ: ช่อง Color ของ SKU (แก้ได้ในแถวสีของแท็บ 🛍) → ไม่มี = ทะเบียนสีกลาง (กรมท่า → Navy · สีผสมแปลทีละคำ)
                const labelEn = it.label_en || swatches.english(it.label);
                return {
                  ...it,
                  ...(labelEn ? { label_en: labelEn } : {}),
                  swatch: it.swatch || (spec ? swatchCss(spec, (k) => `${imageUrl(k)}&w=96`) : undefined),
                  image: it.image ? imageUrl(it.image) : undefined,
                  images: it.images?.length ? it.images.map(imageUrl) : undefined,
                  // 🎨 โทนของสีนี้ (key) — สีผสมได้หลายโทน · ไม่อยู่โทนไหน = [] (ตัวกรองสีหาไม่เจอ)
                  tones: tonesOfLabel(it.label, colorTones).map((t) => t.key),
                };
              }),
            }
          : null,
        /**
         * 📐 ตัวเลือกกลุ่มที่ 2 เช่น ไซส์ (null = สินค้าชิ้นนี้มีตัวเลือกชั้นเดียว) — เว็บเก่าที่ยังไม่รู้จักจะข้ามไปเอง
         * items[].colors = สีที่มีไซส์นี้ (ไม่อยู่ในรายการ = เว็บขีดฆ่า) · free = สีที่ไม่ต้องเลือกไซส์ (lib/website-size-options)
         */
        options2: r.options2
          ? (() => {
              // 🌐 ชื่อชุด: ชื่อที่ร้านตั้งเอง → คำแปลที่ร้านตั้ง · ชื่อจาก SKU (ไซส์ / แบบพิมพ์) → คำมาตรฐาน
              const en = (r.options2.label === fieldMap.options2.label && optLabel2En) || commonLabelEn(r.options2.label);
              return {
                ...r.options2,
                ...(en ? { label_en: en } : {}),
                items: r.options2.items.map((it) => {
                  const itEn = commonLabelEn(it.label);
                  return itEn ? { ...it, label_en: itEn } : it;
                }),
              };
            })()
          : r.options2,
        featured: Boolean(l.featured),
        /** ฟิลด์สเปกจาก Parent SKU (วัสดุ/ขนาด/น้ำหนัก…) สำหรับหัวข้อ "ฟิลด์จาก Parent SKU" ในชุดรายละเอียดสินค้า */
        attrs,
        /** 📏 หัวข้อ "ขนาด": ใส่ได้ + แถว ซม./นิ้ว (เว็บเลือกเองว่าจะต่อนิ้วไหม ตามธีม) · มี `_en` คู่ให้หน้า /en — ไม่มีข้อมูล = ไม่ส่ง */
        dimensions: (() => {
          const comps = fitOn ? parseCompartments((p as { compartments?: unknown }).compartments) : null;
          const row = p as unknown as DimensionRow & { fits?: unknown };
          return bilingualDimensions(
            withFitLines(productDimensions(row, fitCatalog), comps, fitTargets),
            withFitLines(productDimensions(row, fitCatalog, "en"), comps, fitTargetsEn, "en"),
          );
        })(),
        /** 📐 ช่องใส่ของ (ขนาดด้านใน ซม.) — เฉพาะร้านที่เปิดเช็คขนาด + รุ่นที่วัดแล้ว · Section "เช็คขนาด" ใช้คิดขนาดที่ลูกค้าพิมพ์เอง */
        fitBoxes: (() => { const c = fitOn ? parseCompartments((p as { compartments?: unknown }).compartments) : null; return c?.length ? c : undefined; })(),
        /**
         * 🧭 ตัวกรอง "ใส่อะไรได้": ชื่อที่คำนวณได้ (ไม่มีจำนวน — "Labubu" รวมเป็นตัวเลือกเดียว) + ที่ติ๊กเอง
         * ส่งเฉพาะเมื่อมีของที่คำนวณได้ (ไม่มี = เว็บใช้ dimensions.fits ตามเดิม)
         */
        ...(() => {
          const names = fitOn ? fitNames(parseCompartments((p as { compartments?: unknown }).compartments), fitTargets) : [];
          return names.length ? { fitNames: names, fitManual: fitLabels((p as { fits?: unknown }).fits, fitCatalog) } : {};
        })(),
        /** ✅ รายละเอียดเพิ่ม (ติ๊กใน Parent SKU) — เว็บต่อท้ายหัวข้อ "รายละเอียดสินค้า" เป็น "- ข้อความ" · ไม่มี = ไม่ส่ง */
        highlights: (() => { const h = fitLabels((p as { highlights?: unknown }).highlights, highlightCatalog); return h.length ? h : undefined; })(),
        images: r.images.map(imageUrl),
        /** รูปปก + แกลเลอรีของ Parent SKU (แยกจาก images ที่อาจมาจาก SKU ลูก) */
        parentImages: [...new Set([...(p.cover_image_r2_key ? [p.cover_image_r2_key] : []), ...(parentGallery.get(p.id) ?? [])])].map(imageUrl),
        /** คอลเลกชันใน ERP (id) — ใช้จับกลุ่มสินค้าที่เกี่ยวข้อง */
        collection: p.collection_id ?? null,
        /** ชื่อคอลเลกชัน — ตัวกรอง "คอลเลกชัน" */
        collectionName: p.collection_id ? collName.get(p.collection_id) ?? null : null,
        /** อันดับขายดีบนเว็บ (1 = ขายดีสุด) — ไม่มี = ยังไม่เคยขาย */
        salesRank: salesRank.get(code.toUpperCase()) ?? null,
        /** 👀🔥 { viewers: คนดูวันนี้, sold: ขายแล้ว } — มีเฉพาะป้ายที่ร้านเปิดและถึงขั้นต่ำ */
        proof: proofCounts.get(code.toUpperCase()),
        /** ⭐ ดาวเฉลี่ย + จำนวนรีวิว (ยังไม่มีรีวิว/ร้านปิดรีวิว = ไม่ส่ง) */
        rating: ratings.get(code.toUpperCase()),
        /** 🛍 ซื้อคู่กันบ่อย (รหัสรุ่น · จากออเดอร์จริง · ยังไม่มี = ไม่ส่ง) */
        boughtWith: boughtWith.get(code.toUpperCase()),
        /** จับคู่รายละเอียดหน้าเว็บเฉพาะรุ่น { itemId: { show, text } } — ไม่มี = ตามชุดรายละเอียดกลางของธีม */
        detailOverrides: Object.keys(detailOverrides).length ? detailOverrides : undefined,
        /** ปั๊มชื่อ (null = รุ่นนี้ปั๊มไม่ได้) */
        personalize,
        /** 🎴 การ์ดสินค้า: id ตัวเลือกที่โชว์เป็นจุดสี (เรียงตามที่ตั้ง · [] = ไม่โชว์) + สีหลัก (รูปแรกบนการ์ด) — ไม่มี = ทุกสีตามลำดับเดิม */
        ...(() => {
          const cc = resolveCardColors(r.options?.items ?? [], normalizeCardColors(l.web_card_colors));
          return { cardColors: cc.show, cardMain: cc.main };
        })(),
        /** 🖼 ฟิลด์รูปของ Parent SKU { fieldKey: URL } — เฉพาะช่องที่มีรูป (แบนเนอร์ source=field ใช้) */
        imageFields: (() => {
          const out: Record<string, string> = {};
          for (const f of imageFieldDefs) {
            const v = (p as unknown as Record<string, unknown>)[f.column];
            if (typeof v === "string" && v.trim()) out[f.key] = /^https?:\/\//.test(v) ? v : v.startsWith("/") ? `${origin}${v}` : imageUrl(v.trim());
          }
          return Object.keys(out).length ? out : undefined;
        })(),
        /** 🖼 แบนเนอร์หน้าสินค้าเฉพาะรุ่น (เฉพาะที่มีรูป) — ไม่มี = เว็บใช้แบนเนอร์กลางของธีม */
        banners: (() => {
          const bs = normalizeBanners(l.web_banners).filter((b) => b.imageKey).map((b) => ({ ...b, imageUrl: imageUrl(b.imageKey as string) }));
          return bs.length ? bs : undefined;
        })(),
        /** 🎬 รูปเปิดหน้าสินค้า (ภาพแรกเต็มช่อง) { desktop, mobile: {kind, url, poster} } — ไม่มี = ใช้รูปสินค้า · รูปย่อเป็น webp (คอม 2000 / มือถือ 1080) */
        hero: (() => {
          const h = normalizeHero(l.web_hero);
          if (!h) return undefined;
          const out = (m: HeroMedia | null, w: number) =>
            m ? { kind: m.kind, url: m.kind === "image" ? `${imageUrl(m.key)}&w=${w}` : imageUrl(m.key), poster: m.posterKey ? `${imageUrl(m.posterKey)}&w=${w}` : null } : null;
          // 🎨 Hero รายสี → คีย์เป็นรหัสตัวเลือกสีที่เว็บใช้ ("sku-" + 8 ตัวแรกของ id SKU ลูก · ตรงกับ options.items[].id)
          const byOption = h.sku
            ? Object.fromEntries(Object.entries(h.sku).map(([skuId, p]) => [`sku-${skuId.slice(0, 8)}`, { desktop: out(p.desktop, 2000), mobile: out(p.mobile, 1080) }]))
            : undefined;
          return { desktop: out(h.desktop, 2000), mobile: out(h.mobile, 1080), ...(byOption ? { byOption } : {}) };
        })(),
      };
    })
    .filter(Boolean);

  return json({ shop: shopSlug, shopName: s.name, count: products.length, products });
}
