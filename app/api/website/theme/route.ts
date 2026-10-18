/**
 * ตั้งค่าธีมเว็บร้าน — /api/website/theme
 *
 * GET ?shop=<slug>                        → ธีมที่เผยแพร่ + ร่างที่ค้างอยู่ (ถ้ามี) + ตัวเลือก
 * PUT { shopId, theme, mode:"draft" }     → บันทึกร่าง (เว็บจริงยังไม่เปลี่ยน)
 * PUT { shopId, theme, mode:"publish" }   → เผยแพร่ (เว็บจริงเปลี่ยน + เก็บเวอร์ชัน + ล้างร่าง)
 * DELETE ?shopId=<id>                     → ละทิ้งร่าง กลับไปใช้ตัวที่เผยแพร่
 *
 * shops.theme = ตัวที่เผยแพร่แล้ว · shops.theme_draft = ร่าง (null = ไม่มีร่างค้าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { loadParentWebFields, loadParentImageFields, PARENT_FIELD_GROUP_LABEL } from "@/lib/website-parent-fields";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { readSiteInfo } from "@/lib/website-site-info";
import { shippingAutoPreview } from "@/lib/website-content-sources";
import { dropStatus } from "@/lib/website-new-drops";
import {
  normalizeTheme,
  mergeTheme,
  FONT_CHOICES,
  RADIUS_CHOICES,
  LOGO_MODES,
  HEADER_BG,
  MENU_ALIGNS,
  CARD_PRESETS,
  PRODUCT_LAYOUTS,
  PRODUCT_TITLE_STYLES,
  PRODUCT_IMAGE_BGS,
  PRODUCT_SECTIONS,
  PRODUCT_GALLERY_STYLES,
  PRODUCT_DETAILS_STYLES,
  PRODUCT_DETAILS_OPEN,
  PRODUCT_SPEC_FIELDS,
  DETAIL_SOURCES,
  IMAGE_RATIOS,
  CARD_HOVERS, PART_CHOICES } from "@/lib/website-theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, theme, theme_draft, field_map")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const s = shop as { id: string; name: string; slug: string; theme: unknown; theme_draft: unknown; field_map: unknown };

  // รายการสินค้าบนเว็บ (รหัส+ชื่อ) ไว้ให้เลือก "ใช้กับรุ่นไหน" ในชุดรายละเอียดสินค้า
  const { data: listRows } = await sb.from("store_listings").select("parent_sku_id").eq("shop_id", s.id).limit(500);
  const parentIds = ((listRows ?? []) as { parent_sku_id: string }[]).map((r) => r.parent_sku_id).filter(Boolean);
  const { data: parentRows } = parentIds.length
    ? await sb.from("parent_skus_v2").select("code, name_th").in("id", parentIds)
    : { data: [] as { code: string; name_th: string | null }[] };
  const webProducts = ((parentRows ?? []) as { code: string; name_th: string | null }[])
    .filter((r) => r.code)
    .map((r) => ({ code: r.code, name: r.name_th ?? "" }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // เวอร์ชันล่าสุด (ไว้โชว์ "บันทึกล่าสุดเมื่อ...")
  const [{ data: last }, { data: dom }] = await Promise.all([
    sb
      .from("store_theme_versions")
      .select("version_no, created_at")
      .eq("shop_id", s.id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("shop_domains").select("domain").eq("shop_id", s.id).limit(1).maybeSingle(),
  ]);

  // ฟิลด์ Parent SKU ที่ให้เลือกโชว์บนเว็บ (ทุกฟิลด์จากทะเบียน ยกเว้นต้นทุน/ข้อมูลภายใน)
  const [parentFields, imageFields, siteInfo, { data: dropRows }] = await Promise.all([
    loadParentWebFields(sb),
    loadParentImageFields(sb),
    readSiteInfo(sb, s.id),
    // 🆕 ชุดมาใหม่ของร้าน → ตัวจัดเมนู "หน้ามาใหม่" เลือกชุดเองได้
    sb.from("store_new_drops").select("id, title, start_at, end_at").eq("shop_id", s.id).order("start_at", { ascending: false }).limit(100),
  ]);
  const newDrops = ((dropRows ?? []) as { id: string; title: string; start_at: string; end_at: string | null }[]).map((d) => ({
    id: d.id,
    title: d.title,
    status: dropStatus({ startAt: d.start_at, endAt: d.end_at }),
  }));
  const hasDraft = s.theme_draft != null;
  const rawDomain = (dom as { domain: string } | null)?.domain ?? null;
  const siteUrl = rawDomain ? (rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`) : null;

  return NextResponse.json({
    shop: { id: s.id, name: s.name, slug: s.slug, siteUrl },
    published: normalizeTheme(s.theme),
    draft: hasDraft ? normalizeTheme(s.theme_draft) : null,
    hasDraft,
    lastVersion: last ?? null,
    choices: {
      fonts: FONT_CHOICES,
      radius: RADIUS_CHOICES,
      logoModes: LOGO_MODES,
      headerBg: HEADER_BG,
      menuAligns: MENU_ALIGNS,
      cardPresets: CARD_PRESETS,
      productLayouts: PRODUCT_LAYOUTS,
      productTitleStyles: PRODUCT_TITLE_STYLES,
      productImageBgs: PRODUCT_IMAGE_BGS,
      productSections: PRODUCT_SECTIONS,
      productGalleryStyles: PRODUCT_GALLERY_STYLES,
      productDetailsStyles: PRODUCT_DETAILS_STYLES,
      productDetailsOpen: PRODUCT_DETAILS_OPEN,
      partChoices: PART_CHOICES,
      detailSources: DETAIL_SOURCES,
      /** 📚 คลังแหล่งข้อมูล: บรรทัดอัตโนมัติของ "การจัดส่ง & ชำระเงิน" ตามข้อมูลร้านตอนนี้ (โชว์ 🔒 ในป๊อป) */
      shippingAuto: shippingAutoPreview(siteInfo),
      specFields: parentFields.map((f) => ({ key: f.key, label: f.label, group: f.group })),
      fieldGroups: PARENT_FIELD_GROUP_LABEL,
      /** ฟิลด์รูปของ Parent SKU (แบนเนอร์เลือก "ฟิลด์รูปของ Parent SKU") */
      imageFields: imageFields.map((f) => ({ key: f.key, label: f.label })),
      // label_en = ชื่ออังกฤษของหมวด (ตัวจัดเมนู: ลิงก์หมวดที่ไม่ได้ตั้งชื่อเองบอกว่าจะโชว์อะไรบน /en)
      categories: normalizeFieldMap(s.field_map).categories.map((c) => ({ key: c.key, label: c.label, parent: c.parent ?? null, label_en: String((c as { label_en?: unknown }).label_en ?? "") })),
      products: webProducts,
      newDrops,
      imageRatios: IMAGE_RATIOS,
      cardHovers: CARD_HOVERS,
    },
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; theme?: unknown; mode?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const publish = body.mode === "publish";
  const sb = supabaseAdmin();

  const { data: current } = await sb
    .from("shops")
    .select("theme")
    .eq("id", body.shopId)
    .maybeSingle();
  const merged = mergeTheme((current as { theme: unknown } | null)?.theme, body.theme);

  if (!publish) {
    // บันทึกร่างเท่านั้น — เว็บจริงยังไม่เปลี่ยน
    const { error } = await sb.from("shops").update({ theme_draft: merged }).eq("id", body.shopId);
    if (error) return NextResponse.json({ error: "บันทึกร่างไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "draft", theme: normalizeTheme(merged) });
  }

  // เผยแพร่ → เว็บจริงเปลี่ยน + ล้างร่าง
  const { error } = await sb
    .from("shops")
    .update({ theme: merged, theme_draft: null })
    .eq("id", body.shopId);
  if (error) return NextResponse.json({ error: "เผยแพร่ไม่สำเร็จ" }, { status: 500 });

  const { data: last } = await sb
    .from("store_theme_versions")
    .select("version_no")
    .eq("shop_id", body.shopId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNo = Number((last as { version_no: number } | null)?.version_no ?? 0) + 1;
  await sb.from("store_theme_versions").insert({ shop_id: body.shopId, version_no: nextNo, theme: merged });

  await writeAudit(sb, {
    action: "update",
    entityType: "shop_theme",
    entityId: body.shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { version: nextNo, note: body.note ?? null },
  });

  // สั่งเว็บร้านล้างแคช → ธีมใหม่ขึ้นเว็บจริงทันที
  const purged = await purgeStorefrontCache(sb, body.shopId);

  return NextResponse.json({ ok: true, purged, mode: "publish", theme: normalizeTheme(merged), version: nextNo });
}

/** ละทิ้งร่าง */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;

  const shopId = (new URL(request.url).searchParams.get("shopId") ?? "").trim();
  if (!shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb.from("shops").update({ theme_draft: null }).eq("id", shopId);
  if (error) return NextResponse.json({ error: "ละทิ้งร่างไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
