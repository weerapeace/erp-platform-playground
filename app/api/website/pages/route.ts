/**
 * จัดการ "หน้าเว็บ" ของร้าน (นอกเหนือจากหน้าแรก) — /api/website/pages
 *
 * GET    ?shop=<slug>                                → รายการหน้า + ชนิดบล็อก
 * GET    ?shop=<slug>&pageId=<id>                    → หน้าเดียว (พร้อมบล็อก + ร่าง)
 * POST   { shopId, slug, title }                     → สร้างหน้าใหม่
 * POST   { shopId, template: "help-center" }        → 🧭 สร้างชุดศูนย์ช่วยเหลือ (เฉพาะหน้าที่ยังไม่มี · เป็นร่าง) — lib/website-help-center.ts
 * PUT    { pageId, blocks?, seo?, title?, mode }     → บันทึกร่าง / เผยแพร่ (seo = ข้อมูลเสริมของหน้า: SEO 2 ภาษา · ชื่ออังกฤษ · กลุ่มศูนย์ช่วยเหลือ)
 * PUT    { pageId, sortOrder }                       → ย้ายลำดับ (เมนูซ้ายของศูนย์ช่วยเหลือเรียงตามนี้)
 * DELETE ?pageId=<id>                                → ลบหน้า (ห้ามลบหน้าแรก)
 *
 * ใช้ตาราง store_pages (มีอยู่เดิม): layout = เผยแพร่ · draft_layout = ร่าง
 * หน้าแรก (is_home) จัดที่แท็บ "หน้าแรก" แทน — API นี้จึงไม่แตะ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { issuePreviewKey } from "@/lib/storefront-preview-key";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { normalizeBlocks, blockTypesFor } from "@/lib/website-blocks";
import { readShopBetas } from "@/lib/website-site-info";
import { syncCanvasAssetUsages } from "@/lib/website-canvas-usage";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { normalizeTheme } from "@/lib/website-theme";
import { cleanPageMeta, HELP_CENTER_PAGES, buildHelpPage } from "@/lib/website-help-center";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * slug ที่ห้ามใช้ เพราะชนกับหน้าที่เว็บร้านเขียนไว้ในโค้ดตัวเอง
 * หน้าที่ฝังในโค้ดเว็บจะชนะหน้าที่มาจากที่นี่เสมอ → สร้างได้แต่เผยแพร่ไปก็ไม่ขึ้น เสียเวลาเปล่า
 * (about/contact/gallery/oem = หน้าที่เว็บ IG International มีอยู่แล้ว)
 */
const RESERVED = new Set([
  "shop", "product", "checkout", "quote", "api", "_next", "cart", "home", "blog", "review", "feeds",
  // contact = หน้าในโค้ดที่ "ยอมให้หน้าเว็บชื่อเดียวกันมาแทน" (ศูนย์ช่วยเหลือ · เหมือน privacy/track) จึงไม่อยู่ในรายการนี้
  "about", "gallery", "oem",
]);

const cleanSlug = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 60);

const text = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  const pageId = (url.searchParams.get("pageId") ?? "").trim();

  const sb = supabaseAdmin();
  // ธีมโหลดเฉพาะตอนเปิดหน้าเดียว (ใช้ค่าการ์ดของร้าน) — รายการหน้าไม่ต้องใช้
  const shop = await shopBySlug<{ id: string; name: string; slug: string; field_map: unknown; theme: unknown }>(sb, shopSlug, pageId ? "id, name, slug, field_map, theme" : "id, name, slug, field_map");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as unknown as { id: string; name: string; slug: string; field_map?: unknown; theme?: unknown };
  const categories = normalizeFieldMap(s.field_map).categories.map((c) => ({ key: c.key, label: c.label, parent: c.parent ?? null, imageKey: c.imageKey ?? null, icon: c.icon ?? "" }));

  const { data: dom } = await sb.from("shop_domains").select("domain").eq("shop_id", s.id).limit(1).maybeSingle();
  const rawDomain = (dom as { domain: string } | null)?.domain ?? null;
  const siteUrl = rawDomain ? (rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`) : null;

  // หน้าเดียว (สำหรับหน้าจอแก้ไข)
  if (pageId) {
    const { data: p } = await sb
      .from("store_pages")
      .select("id, slug, title, status, page_type, seo, layout, draft_layout, sort_order, updated_at")
      .eq("id", pageId)
      .eq("shop_id", s.id)
      .maybeSingle();
    if (!p) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });

    const row = p as Record<string, unknown>;
    return NextResponse.json({
      shop: { id: s.id, name: s.name, slug: s.slug, siteUrl, previewKey: siteUrl ? issuePreviewKey(s.slug) : null },
      page: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        status: row.status,
        /** static = หน้าเว็บ · post = 📝 บทความ (อยู่ที่ /blog/<slug>) */
        pageType: row.page_type === "post" ? "post" : "static",
        seo: cleanPageMeta(row.seo),
        published: normalizeBlocks(row.layout),
        draft: row.draft_layout != null ? normalizeBlocks(row.draft_layout) : null,
        hasDraft: row.draft_layout != null,
        updatedAt: row.updated_at,
      },
      // Section ทดลอง (meta.beta) โชว์ในคลังเฉพาะร้านที่เปิดสวิตช์ในแท็บข้อมูลร้าน
      blockTypes: blockTypesFor(await readShopBetas(sb, s.id)),
      categories,
      /** 🃏 การ์ดสินค้าของร้านที่เผยแพร่อยู่ (Section ตารางสินค้า ปิด "ใช้การ์ดตามค่ากลาง" → ก๊อปเป็นค่าเริ่ม) */
      themeCard: normalizeTheme(s.theme).card,
    });
  }

  // รายการหน้า (ไม่รวมหน้าแรก)
  const { data: pages } = await sb
    .from("store_pages")
    .select("id, slug, title, status, page_type, seo, layout, draft_layout, sort_order, updated_at")
    .eq("shop_id", s.id)
    .eq("is_home", false)
    .order("sort_order")
    .order("created_at");

  return NextResponse.json({
    shop: { id: s.id, name: s.name, slug: s.slug, siteUrl, previewKey: siteUrl ? issuePreviewKey(s.slug) : null },
    pages: ((pages ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      blocks: Array.isArray(p.layout) && (p.layout as unknown[]).length ? (p.layout as unknown[]).length : Array.isArray(p.draft_layout) ? (p.draft_layout as unknown[]).length : 0,
      hasDraft: p.draft_layout != null,
      help: cleanPageMeta(p.seo).help,
      pageType: p.page_type === "post" ? "post" : "static",
      publishAt: cleanPageMeta(p.seo).publishAt,
      sortOrder: Number(p.sort_order ?? 0),
      updatedAt: p.updated_at,
    })),
    // Section ทดลอง (meta.beta) โชว์ในคลังเฉพาะร้านที่เปิดสวิตช์ในแท็บข้อมูลร้าน
    blockTypes: blockTypesFor(await readShopBetas(sb, s.id)),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; slug?: string; title?: string; template?: string; pageType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // 🧭 ชุดศูนย์ช่วยเหลือ — สร้างเฉพาะหน้าที่ยังไม่มี (slug ซ้ำ = ข้าม ไม่ทับของเดิม) · เป็นร่างทั้งหมด (layout ว่าง · เนื้อหาอยู่ draft_layout)
  if (body.template === "help-center") {
    if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });
    const sb = supabaseAdmin();
    const { data: existing } = await sb.from("store_pages").select("slug, sort_order").eq("shop_id", body.shopId);
    const rows = (existing ?? []) as { slug: string; sort_order: number | null }[];
    const have = new Set(rows.map((r) => r.slug));
    let order = rows.reduce((m, r) => Math.max(m, Number(r.sort_order ?? 0)), 0);
    const created: string[] = [];
    const skipped: string[] = [];
    for (const t of HELP_CENTER_PAGES) {
      if (have.has(t.slug)) {
        skipped.push(t.slug);
        continue;
      }
      const pg = buildHelpPage(t);
      order += 1;
      const { data: row, error } = await sb
        .from("store_pages")
        .insert({ shop_id: body.shopId, slug: pg.slug, title: pg.title, page_type: "static", status: "draft", is_home: false, seo: pg.seo, layout: [], draft_layout: pg.blocks, sort_order: order })
        .select("id")
        .maybeSingle();
      if (error || !row) return NextResponse.json({ error: `สร้างหน้า /${t.slug} ไม่สำเร็จ`, created, skipped }, { status: 500 });
      created.push(t.slug);
      await writeAudit(sb, {
        action: "create",
        entityType: "store_page",
        entityId: (row as { id: string }).id,
        actorId: user?.id ?? null,
        actorName: user?.email ?? null,
        metadata: { slug: t.slug, title: t.title, template: "help-center" },
      });
    }
    return NextResponse.json({ ok: true, created, skipped });
  }

  const slug = cleanSlug(body.slug);
  const title = text(body.title, 120) || slug;
  if (!body.shopId || !slug) return NextResponse.json({ error: "ต้องระบุ shopId + slug" }, { status: 400 });
  if (RESERVED.has(slug))
    return NextResponse.json({ error: `ใช้ชื่อ "${slug}" ไม่ได้ เพราะชนกับหน้าของระบบ` }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: dup } = await sb
    .from("store_pages")
    .select("id")
    .eq("shop_id", body.shopId)
    .eq("slug", slug)
    .maybeSingle();
  if (dup) return NextResponse.json({ error: "มีหน้าที่ใช้ชื่อนี้อยู่แล้ว" }, { status: 409 });

  const { data: created, error } = await sb
    .from("store_pages")
    .insert({
      shop_id: body.shopId,
      slug,
      title,
      // 📝 บทความ (บล็อก /blog/<slug>) ใช้ตัวจัดหน้าเดียวกับหน้าเว็บ · ไม่ขึ้นเมนูอัตโนมัติ
      page_type: body.pageType === "post" ? "post" : "static",
      status: "draft",
      is_home: false,
      seo: {},
      layout: [],
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return NextResponse.json({ error: "สร้างหน้าไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "create",
    entityType: "store_page",
    entityId: (created as { id: string }).id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { slug, title },
  });

  return NextResponse.json({ ok: true, pageId: (created as { id: string }).id });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: {
    pageId?: string;
    blocks?: unknown;
    seo?: Record<string, unknown>;
    title?: string;
    mode?: string;
    sortOrder?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.pageId) return NextResponse.json({ error: "ต้องระบุ pageId" }, { status: 400 });

  const sb = supabaseAdmin();
  const publish = body.mode === "publish";
  const blocks = body.blocks !== undefined ? normalizeBlocks(body.blocks) : null;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = text(body.title, 120);
  // seo = ข้อมูลเสริมทั้งก้อน (SEO 2 ภาษา · ชื่ออังกฤษ · กลุ่มศูนย์ช่วยเหลือ) — lib/website-help-center.ts cleanPageMeta
  if (body.seo !== undefined) patch.seo = cleanPageMeta(body.seo);
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) patch.sort_order = Math.max(0, Math.min(100000, Math.round(body.sortOrder)));

  if (blocks) {
    if (publish) {
      patch.layout = blocks;
      patch.draft_layout = null;
      patch.status = "published";
    } else {
      patch.draft_layout = blocks;
    }
  }

  const { error } = await sb.from("store_pages").update(patch).eq("id", body.pageId);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  if (blocks) {
    // รูป/ของตกแต่งบนผืนผ้าใบ → บันทึกว่าถูกใช้ (คลังไฟล์กันลบของที่ยังใช้อยู่)
    const label = `หน้าเว็บ ${String(patch.title ?? "") || body.pageId}`;
    await syncCanvasAssetUsages(sb, { module: "website_page", recordId: body.pageId, recordLabel: label, field: publish ? "live" : "draft", blocks });
    if (publish) await syncCanvasAssetUsages(sb, { module: "website_page", recordId: body.pageId, recordLabel: label, field: "draft", blocks: [] });
  }

  if (publish && blocks) {
    // เก็บประวัติ (ตารางมีอยู่เดิม)
    const { data: last } = await sb
      .from("store_page_versions")
      .select("version_no")
      .eq("page_id", body.pageId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = Number((last as { version_no: number } | null)?.version_no ?? 0) + 1;
    await sb.from("store_page_versions").insert({
      page_id: body.pageId,
      version_no: nextNo,
      layout: blocks,
      actor: user?.email ?? null,
    });

    await writeAudit(sb, {
      action: "update",
      entityType: "store_page",
      entityId: body.pageId,
      actorId: user?.id ?? null,
      actorName: user?.email ?? null,
      metadata: { version: nextNo, blocks: blocks.length },
    });
  }

  // เผยแพร่ (โครงหรือชื่อ/SEO) → สั่งเว็บร้านล้างแคช
  let purged = false;
  if (publish) {
    const { data: pg } = await sb.from("store_pages").select("shop_id").eq("id", body.pageId).maybeSingle();
    const shopId = (pg as { shop_id: string } | null)?.shop_id;
    if (shopId) purged = await purgeStorefrontCache(sb, shopId);
  }

  return NextResponse.json({ ok: true, mode: publish ? "publish" : "draft", blocks: blocks ?? undefined, purged });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  const pageId = (new URL(request.url).searchParams.get("pageId") ?? "").trim();
  if (!pageId) return NextResponse.json({ error: "ต้องระบุ pageId" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: p } = await sb.from("store_pages").select("is_home, slug").eq("id", pageId).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });
  if ((p as { is_home: boolean }).is_home)
    return NextResponse.json({ error: "ลบหน้าแรกไม่ได้" }, { status: 400 });

  const { error } = await sb.from("store_pages").delete().eq("id", pageId);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "delete",
    entityType: "store_page",
    entityId: pageId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { slug: (p as { slug: string }).slug },
  });

  return NextResponse.json({ ok: true });
}
