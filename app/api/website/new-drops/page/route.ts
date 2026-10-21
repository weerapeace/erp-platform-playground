/**
 * 🧱 จัดหน้าของชุดมาใหม่ (/new/<ชุด>) — /api/website/new-drops/page
 *
 * GET    ?shop=<slug>&id=<dropId>          → ชุด + Section (ร่าง/เผยแพร่ · ยังไม่จัด = โครงตั้งต้น) + ชนิด Section + ข้อมูลตัวจัดหน้า
 * PUT    { id, blocks, mode:"draft"|"publish" } → บันทึกร่าง / เผยแพร่ (เผยแพร่ = audit + ล้างแคชเว็บร้าน)
 * DELETE ?id=<dropId>                      → กลับไปใช้หน้าตาเดิม (ล้างทั้งที่เผยแพร่และร่าง · audit + ล้างแคช)
 *
 * เก็บที่ store_new_drops.layout / draft_layout (lib/website-drop-page) · ใช้ตัวจัดหน้า 3 แผงตัวเดียวกับแท็บ "หน้าเว็บ"
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
import { defaultDropPageBlocks } from "@/lib/website-drop-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DropRow = { id: string; shop_id: string; title: string; start_at: string; layout: unknown; draft_layout: unknown; updated_at: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุชุด" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, name, slug, field_map, theme").eq("slug", shopSlug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as unknown as { id: string; name: string; slug: string; field_map?: unknown; theme?: unknown };

  const { data: d } = await sb.from("store_new_drops").select("id, shop_id, title, start_at, layout, draft_layout, updated_at").eq("id", id).eq("shop_id", s.id).maybeSingle();
  if (!d) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const row = d as DropRow;

  const { data: dom } = await sb.from("shop_domains").select("domain").eq("shop_id", s.id).limit(1).maybeSingle();
  const rawDomain = (dom as { domain: string } | null)?.domain ?? null;
  const siteUrl = rawDomain ? (rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`) : null;

  const published = Array.isArray(row.layout) ? normalizeBlocks(row.layout) : null;
  return NextResponse.json({
    shop: { id: s.id, name: s.name, slug: s.slug, siteUrl, previewKey: siteUrl ? issuePreviewKey(s.slug) : null },
    drop: {
      id: row.id,
      title: row.title,
      startAt: row.start_at,
      /** ยังไม่เคยเผยแพร่หน้า (เว็บใช้หน้าตาเดิม) */
      custom: published != null,
      published: published ?? defaultDropPageBlocks(),
      draft: row.draft_layout != null ? normalizeBlocks(row.draft_layout) : null,
      hasDraft: row.draft_layout != null,
      updatedAt: row.updated_at,
    },
    blockTypes: blockTypesFor(await readShopBetas(sb, s.id)),
    categories: normalizeFieldMap(s.field_map).categories.map((c) => ({ key: c.key, label: c.label, parent: c.parent ?? null, imageKey: c.imageKey ?? null, icon: c.icon ?? "" })),
    themeCard: normalizeTheme(s.theme).card,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; blocks?: unknown; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุชุด" }, { status: 400 });
  if (body.blocks === undefined) return NextResponse.json({ error: "ไม่มี Section ให้บันทึก" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: d } = await sb.from("store_new_drops").select("id, shop_id, title").eq("id", body.id).maybeSingle();
  if (!d) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const row = d as { id: string; shop_id: string; title: string };

  const publish = body.mode === "publish";
  const blocks = normalizeBlocks(body.blocks);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), ...(publish ? { layout: blocks, draft_layout: null } : { draft_layout: blocks }) };
  const { error } = await sb.from("store_new_drops").update(patch).eq("id", row.id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });

  // รูป/ของตกแต่งบนผืนผ้าใบ → บันทึกว่าถูกใช้ (คลังไฟล์กันลบของที่ยังใช้อยู่)
  const label = `หน้าชุดมาใหม่ ${row.title}`;
  await syncCanvasAssetUsages(sb, { module: "website_drop_page", recordId: row.id, recordLabel: label, field: publish ? "live" : "draft", blocks });
  if (publish) await syncCanvasAssetUsages(sb, { module: "website_drop_page", recordId: row.id, recordLabel: label, field: "draft", blocks: [] });

  let purged = false;
  if (publish) {
    await writeAudit(sb, {
      action: "update",
      entityType: "store_new_drop",
      entityId: row.id,
      actorId: user?.id ?? null,
      actorName: user?.email ?? null,
      metadata: { page: "publish", blocks: blocks.length, title: row.title },
    });
    purged = await purgeStorefrontCache(sb, row.shop_id);
  }
  return NextResponse.json({ ok: true, mode: publish ? "publish" : "draft", blocks, purged });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุชุด" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: d } = await sb.from("store_new_drops").select("id, shop_id, title").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const row = d as { id: string; shop_id: string; title: string };
  const { error } = await sb.from("store_new_drops").update({ layout: null, draft_layout: null, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  for (const field of ["live", "draft"] as const) {
    await syncCanvasAssetUsages(sb, { module: "website_drop_page", recordId: row.id, recordLabel: `หน้าชุดมาใหม่ ${row.title}`, field, blocks: [] });
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "store_new_drop",
    entityId: row.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { page: "reset", title: row.title },
  });
  const purged = await purgeStorefrontCache(sb, row.shop_id);
  return NextResponse.json({ ok: true, purged });
}
