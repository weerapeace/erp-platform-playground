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
import { writeAudit } from "@/lib/audit";
import {
  normalizeTheme,
  mergeTheme,
  FONT_CHOICES,
  RADIUS_CHOICES,
  LOGO_MODES,
  HEADER_BG,
  MENU_ALIGNS,
  CARD_PRESETS,
  IMAGE_RATIOS,
  CARD_HOVERS,
} from "@/lib/website-theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, theme, theme_draft")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const s = shop as { id: string; name: string; slug: string; theme: unknown; theme_draft: unknown };

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

  return NextResponse.json({ ok: true, mode: "publish", theme: normalizeTheme(merged), version: nextNo });
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
