/**
 * จัดการ "หน้าเว็บ" ของร้าน (นอกเหนือจากหน้าแรก) — /api/website/pages
 *
 * GET    ?shop=<slug>                                → รายการหน้า + ชนิดบล็อก
 * GET    ?shop=<slug>&pageId=<id>                    → หน้าเดียว (พร้อมบล็อก + ร่าง)
 * POST   { shopId, slug, title }                     → สร้างหน้าใหม่
 * PUT    { pageId, blocks?, seo?, title?, mode }     → บันทึกร่าง / เผยแพร่
 * DELETE ?pageId=<id>                                → ลบหน้า (ห้ามลบหน้าแรก)
 *
 * ใช้ตาราง store_pages (มีอยู่เดิม): layout = เผยแพร่ · draft_layout = ร่าง
 * หน้าแรก (is_home) จัดที่แท็บ "หน้าแรก" แทน — API นี้จึงไม่แตะ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeBlocks, BLOCK_META } from "@/lib/website-blocks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * slug ที่ห้ามใช้ เพราะชนกับหน้าที่เว็บร้านเขียนไว้ในโค้ดตัวเอง
 * หน้าที่ฝังในโค้ดเว็บจะชนะหน้าที่มาจากที่นี่เสมอ → สร้างได้แต่เผยแพร่ไปก็ไม่ขึ้น เสียเวลาเปล่า
 * (about/contact/gallery/oem = หน้าที่เว็บ IG International มีอยู่แล้ว)
 */
const RESERVED = new Set([
  "shop", "product", "checkout", "quote", "api", "_next", "cart", "home",
  "about", "contact", "gallery", "oem",
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
  const { data: shop } = await sb.from("shops").select("id, name, slug").eq("slug", shopSlug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  const { data: dom } = await sb.from("shop_domains").select("domain").eq("shop_id", s.id).limit(1).maybeSingle();
  const rawDomain = (dom as { domain: string } | null)?.domain ?? null;
  const siteUrl = rawDomain ? (rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`) : null;

  // หน้าเดียว (สำหรับหน้าจอแก้ไข)
  if (pageId) {
    const { data: p } = await sb
      .from("store_pages")
      .select("id, slug, title, status, seo, layout, draft_layout, sort_order, updated_at")
      .eq("id", pageId)
      .eq("shop_id", s.id)
      .maybeSingle();
    if (!p) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });

    const row = p as Record<string, unknown>;
    return NextResponse.json({
      shop: { id: s.id, name: s.name, slug: s.slug, siteUrl },
      page: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        status: row.status,
        seo: (row.seo ?? {}) as Record<string, string>,
        published: normalizeBlocks(row.layout),
        draft: row.draft_layout != null ? normalizeBlocks(row.draft_layout) : null,
        hasDraft: row.draft_layout != null,
        updatedAt: row.updated_at,
      },
      blockTypes: Object.entries(BLOCK_META).map(([type, m]) => ({ type, ...m })),
    });
  }

  // รายการหน้า (ไม่รวมหน้าแรก)
  const { data: pages } = await sb
    .from("store_pages")
    .select("id, slug, title, status, layout, draft_layout, sort_order, updated_at")
    .eq("shop_id", s.id)
    .eq("is_home", false)
    .order("sort_order")
    .order("created_at");

  return NextResponse.json({
    shop: { id: s.id, name: s.name, slug: s.slug, siteUrl },
    pages: ((pages ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      blocks: Array.isArray(p.layout) ? (p.layout as unknown[]).length : 0,
      hasDraft: p.draft_layout != null,
      updatedAt: p.updated_at,
    })),
    blockTypes: Object.entries(BLOCK_META).map(([type, m]) => ({ type, ...m })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; slug?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
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
      page_type: "static",
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
    seo?: { title?: string; description?: string };
    title?: string;
    mode?: string;
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
  if (body.seo !== undefined)
    patch.seo = { title: text(body.seo?.title, 160), description: text(body.seo?.description, 320) };

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

  return NextResponse.json({ ok: true, mode: publish ? "publish" : "draft", blocks: blocks ?? undefined });
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
