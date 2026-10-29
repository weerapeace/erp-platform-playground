/**
 * ตั้งค่าธีมเว็บร้าน — /api/website/theme
 *
 * GET ?shop=<slug>                        → ธีมที่เผยแพร่ + ร่างที่ค้างอยู่ (ถ้ามี) + ตัวเลือก
 * PUT { shopId, theme, mode:"draft" }     → บันทึกร่าง (เว็บจริงยังไม่เปลี่ยน)
 * PUT { shopId, theme, mode:"publish" }   → เผยแพร่ (เว็บจริงเปลี่ยน + เก็บเวอร์ชัน + ล้างร่าง)
 *   👷 พนักงานที่แก้ได้บางหัวข้อ (lib/website-access designAccess) ส่ง pages: [หัวข้อที่แก้] มาด้วย
 *      → บันทึกเฉพาะค่าของหัวข้อนั้นทับร่างในระบบ (ไม่ทับงานคนอื่น/หัวข้อที่ไม่มีสิทธิ์) · เผยแพร่ได้เมื่อมี website.design.publish
 *        (เผยแพร่เฉพาะหัวข้อของตัวเอง — ร่างหัวข้ออื่นยังค้างเป็นร่าง)
 * DELETE ?shopId=<id>                     → ละทิ้งร่าง กลับไปใช้ตัวที่เผยแพร่ (ต้องแก้ได้ทุกหัวข้อ)
 *
 * shops.theme = ตัวที่เผยแพร่แล้ว · shops.theme_draft = ร่าง (null = ไม่มีร่างค้าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { issuePreviewKey } from "@/lib/storefront-preview-key";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardDesignEdit, guardWebsite } from "@/lib/website-api-guard";
import { isDesignTopic } from "@/lib/website-access";
import { applyDesignPages, DESIGN_PAGES } from "@/lib/website-design-nav";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { loadParentWebFields, loadParentImageFields, PARENT_FIELD_GROUP_LABEL } from "@/lib/website-parent-fields";
import { writeAudit, writeAuditFor } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { resolveThemeSchedules } from "@/lib/website-theme-schedule-db";
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
  const denied = await guardWebsite(request, "view");
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
  // ⏰ งานตั้งเวลาที่ถึงเวลาแล้ว → เผยแพร่ก่อนโชว์ (lib/website-theme-schedule-db)
  if ((await resolveThemeSchedules(sb, s.id)).published) {
    const { data: fresh } = await sb.from("shops").select("theme, theme_draft").eq("id", s.id).maybeSingle();
    if (fresh) Object.assign(s, fresh);
    await purgeStorefrontCache(sb, s.id);
  }

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
    shop: { id: s.id, name: s.name, slug: s.slug, siteUrl, previewKey: siteUrl ? issuePreviewKey(s.slug) : null },
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
      /** 📜 หน้าสินค้า › นโยบาย: จำนวนวันขอคืน/เปลี่ยน (ข้อมูลร้าน › การคืนสินค้า) */
      returnsDays: siteInfo.returns_days,
      /** 💳 แท็บหน้าชำระเงิน: ช่องทางจ่ายที่เปิดอยู่ (เตือนเมื่อเปิดพร้อมเพย์แต่ยังไม่มีเลข = ลูกค้าไม่เห็น) */
      payInfo: { cod: siteInfo.pay_cod, promptpay: siteInfo.pay_promptpay, promptpayNumber: Boolean(siteInfo.promptpay_number?.trim()) },
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

type Admin = ReturnType<typeof supabaseAdmin>;
type Actor = { id: string; email?: string | null } | null;

/** เผยแพร่: เก็บเวอร์ชันถัดไป + audit + สั่งเว็บร้านล้างแคช (ธีมใหม่ขึ้นเว็บจริงทันที) */
async function recordPublish(sb: Admin, shopId: string, theme: unknown, user: Actor, meta: Record<string, unknown>) {
  const { data: last } = await sb
    .from("store_theme_versions")
    .select("version_no")
    .eq("shop_id", shopId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNo = Number((last as { version_no: number } | null)?.version_no ?? 0) + 1;
  await sb.from("store_theme_versions").insert({ shop_id: shopId, version_no: nextNo, theme });
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_theme",
    entityId: shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { version: nextNo, ...meta },
  });
  const purged = await purgeStorefrontCache(sb, shopId);
  return { version: nextNo, purged };
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  // 🔐 แก้ได้ทุกหัวข้อ (แบบเดิม) หรือ บางหัวข้อ (พนักงาน)
  const { denied, access } = await guardDesignEdit(request);
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; theme?: unknown; mode?: string; note?: string; pages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const publish = body.mode === "publish";
  const sb = supabaseAdmin();

  // 👷 บางหัวข้อ: คัดเฉพาะค่าของหัวข้อที่แก้ (และมีสิทธิ์) ไปทับร่าง/ตัวที่เผยแพร่ในระบบ
  if (!access.full) {
    const pages = [...new Set((Array.isArray(body.pages) ? body.pages : []).filter(isDesignTopic))];
    if (!pages.length) return NextResponse.json({ error: "ไม่มีหัวข้อที่แก้ — แก้ค่าในหัวข้อที่ได้รับสิทธิ์ก่อนบันทึก" }, { status: 400 });
    const notAllowed = pages.filter((p) => !access.topics.includes(p));
    if (notAllowed.length)
      return NextResponse.json({ error: `ไม่มีสิทธิ์แก้หัวข้อ ${notAllowed.map((p) => `"${DESIGN_PAGES[p].label}"`).join(", ")} — ขอสิทธิ์ได้ที่ผู้ดูแลระบบ` }, { status: 403 });
    if (publish && !access.publish) return NextResponse.json({ error: "เผยแพร่ได้เฉพาะหัวหน้า — กด “ส่งให้หัวหน้าตรวจ” แทน" }, { status: 403 });

    const { data: cur } = await sb.from("shops").select("theme, theme_draft").eq("id", body.shopId).maybeSingle();
    if (!cur) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
    const c = cur as { theme: unknown; theme_draft: unknown };
    const incoming = normalizeTheme(body.theme);
    const pub = normalizeTheme(c.theme);
    const draft = c.theme_draft != null ? normalizeTheme(c.theme_draft) : null;
    const meta = { pages, limited: true, note: body.note ?? null };

    if (!publish) {
      const next = mergeTheme(c.theme, applyDesignPages(draft ?? pub, incoming, pages));
      const { error } = await sb.from("shops").update({ theme_draft: next }).eq("id", body.shopId);
      if (error) return NextResponse.json({ error: "บันทึกร่างไม่สำเร็จ" }, { status: 500 });
      await writeAudit(sb, { action: "update", entityType: "shop_theme", entityId: body.shopId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { op: "draft", ...meta } });
      return NextResponse.json({ ok: true, mode: "draft", theme: normalizeTheme(next), pages });
    }

    // เผยแพร่เฉพาะหัวข้อของตัวเอง — ร่างหัวข้ออื่น (ของคนอื่น) ยังค้างเป็นร่าง
    const nextPub = mergeTheme(c.theme, applyDesignPages(pub, incoming, pages));
    const nextDraftRaw = draft ? mergeTheme(c.theme, applyDesignPages(draft, incoming, pages)) : null;
    const nextDraft = nextDraftRaw && JSON.stringify(normalizeTheme(nextDraftRaw)) !== JSON.stringify(normalizeTheme(nextPub)) ? nextDraftRaw : null;
    const { error } = await sb.from("shops").update({ theme: nextPub, theme_draft: nextDraft }).eq("id", body.shopId);
    if (error) return NextResponse.json({ error: "เผยแพร่ไม่สำเร็จ" }, { status: 500 });
    const { version, purged } = await recordPublish(sb, body.shopId, nextPub, user, meta);
    return NextResponse.json({ ok: true, purged, mode: "publish", theme: normalizeTheme(nextPub), draft: nextDraft ? normalizeTheme(nextDraft) : null, version, pages });
  }

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

  const { version, purged } = await recordPublish(sb, body.shopId, merged, user, { note: body.note ?? null });
  return NextResponse.json({ ok: true, purged, mode: "publish", theme: normalizeTheme(merged), version });
}

/** ละทิ้งร่าง (ทั้งก้อน — ต้องแก้ได้ทุกหัวข้อ · พนักงานบางหัวข้อแค่โหลดใหม่ฝั่งจอ) */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;

  const shopId = (new URL(request.url).searchParams.get("shopId") ?? "").trim();
  if (!shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb.from("shops").update({ theme_draft: null }).eq("id", shopId);
  if (error) return NextResponse.json({ error: "ละทิ้งร่างไม่สำเร็จ" }, { status: 500 });
  await writeAuditFor(request, sb, { action: "update", entityType: "shop_theme", entityId: shopId, metadata: { op: "discard_draft" } });
  return NextResponse.json({ ok: true });
}
