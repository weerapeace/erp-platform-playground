/**
 * ตั้งค่าธีมเว็บร้าน — /api/website/theme
 * GET ?shop=<slug>            → ธีมปัจจุบัน + ตัวเลือกฟอนต์/ความมน
 * PUT { shopId, theme }       → บันทึก (merge เข้ากับ shops.theme เดิม ไม่ลบคีย์ของร้านที่มีอยู่)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + writeAudit + lib/website-theme
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeTheme, mergeTheme, FONT_CHOICES, RADIUS_CHOICES } from "@/lib/website-theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, theme")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const s = shop as { id: string; name: string; slug: string; theme: unknown };
  return NextResponse.json({
    shop: { id: s.id, name: s.name, slug: s.slug },
    theme: normalizeTheme(s.theme),
    fontChoices: FONT_CHOICES,
    radiusChoices: RADIUS_CHOICES,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; theme?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: current } = await sb.from("shops").select("theme").eq("id", body.shopId).maybeSingle();
  const merged = mergeTheme((current as { theme: unknown } | null)?.theme, body.theme);

  const { error } = await sb.from("shops").update({ theme: merged }).eq("id", body.shopId);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });

  // เก็บประวัติไว้ย้อนกลับได้ (ตารางมีอยู่แล้ว)
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
    metadata: { version: nextNo },
  });

  return NextResponse.json({ ok: true, theme: normalizeTheme(merged), version: nextNo });
}
