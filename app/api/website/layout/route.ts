/**
 * โครงหน้าแรกของเว็บร้าน (Page builder) — /api/website/layout
 *
 * GET ?shop=<slug>                        → โครงที่เผยแพร่ + ร่าง (ถ้ามี) + ชนิดบล็อกที่เพิ่มได้
 * PUT { shopId, blocks, mode:"draft" }    → บันทึกร่าง (เว็บจริงยังไม่เปลี่ยน)
 * PUT { shopId, blocks, mode:"publish" }  → เผยแพร่ (เว็บจริงเปลี่ยน + ล้างร่าง)
 * DELETE ?shopId=<id>                     → ละทิ้งร่าง
 *
 * shops.home_layout = ที่เผยแพร่ · shops.home_layout_draft = ร่าง (null = ไม่มี)
 * ⚠️ บล็อกชนิดที่ระบบไม่รู้จัก (ของร้านอื่น เช่น product-grid ของ Pixiedustie)
 *    จะถูกกรองออกตอน normalize จึงต้องแก้เฉพาะร้านที่ใช้ชนิดบล็อกชุดนี้เท่านั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeBlocks, defaultLayout, BLOCK_META } from "@/lib/website-blocks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, home_layout, home_layout_draft")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const s = shop as {
    id: string;
    name: string;
    slug: string;
    home_layout: unknown;
    home_layout_draft: unknown;
  };

  const { data: dom } = await sb.from("shop_domains").select("domain").eq("shop_id", s.id).limit(1).maybeSingle();
  const rawDomain = (dom as { domain: string } | null)?.domain ?? null;
  const siteUrl = rawDomain ? (rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`) : null;

  const publishedRaw = normalizeBlocks(s.home_layout);
  const hasDraft = s.home_layout_draft != null;

  return NextResponse.json({
    shop: { id: s.id, name: s.name, slug: s.slug, siteUrl },
    // ยังไม่เคยตั้ง → ส่งโครงเริ่มต้นให้แก้ต่อได้เลย
    published: publishedRaw.length ? publishedRaw : defaultLayout(),
    neverSet: publishedRaw.length === 0,
    draft: hasDraft ? normalizeBlocks(s.home_layout_draft) : null,
    hasDraft,
    blockTypes: Object.entries(BLOCK_META).map(([type, m]) => ({ type, ...m })),
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; blocks?: unknown; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const blocks = normalizeBlocks(body.blocks);
  const publish = body.mode === "publish";
  const sb = supabaseAdmin();

  if (!publish) {
    const { error } = await sb.from("shops").update({ home_layout_draft: blocks }).eq("id", body.shopId);
    if (error) return NextResponse.json({ error: "บันทึกร่างไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "draft", blocks });
  }

  const { error } = await sb
    .from("shops")
    .update({ home_layout: blocks, home_layout_draft: null })
    .eq("id", body.shopId);
  if (error) return NextResponse.json({ error: "เผยแพร่ไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "update",
    entityType: "shop_home_layout",
    entityId: body.shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { blocks: blocks.length },
  });

  return NextResponse.json({ ok: true, mode: "publish", blocks });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;

  const shopId = (new URL(request.url).searchParams.get("shopId") ?? "").trim();
  if (!shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb.from("shops").update({ home_layout_draft: null }).eq("id", shopId);
  if (error) return NextResponse.json({ error: "ละทิ้งร่างไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
