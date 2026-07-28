/**
 * ประวัติเวอร์ชันธีม — /api/website/theme/versions
 * GET  ?shop=<slug>            → รายการเวอร์ชันที่เคยเผยแพร่ (ใหม่→เก่า)
 * POST { shopId, versionNo }   → ดึงเวอร์ชันนั้นกลับมาเป็น "ร่าง" (ยังไม่เผยแพร่ทันที — ปลอดภัยกว่า)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeTheme } from "@/lib/website-theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();

  const { data: shop } = await sb.from("shops").select("id").eq("slug", shopSlug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const { data } = await sb
    .from("store_theme_versions")
    .select("version_no, theme, created_at")
    .eq("shop_id", (shop as { id: string }).id)
    .order("version_no", { ascending: false })
    .limit(30);

  const versions = ((data ?? []) as { version_no: number; theme: unknown; created_at: string }[]).map((v) => ({
    versionNo: v.version_no,
    createdAt: v.created_at,
    theme: normalizeTheme(v.theme),
  }));

  return NextResponse.json({ versions });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; versionNo?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId || !body.versionNo)
    return NextResponse.json({ error: "ต้องระบุ shopId + versionNo" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: v } = await sb
    .from("store_theme_versions")
    .select("theme")
    .eq("shop_id", body.shopId)
    .eq("version_no", body.versionNo)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });

  const theme = (v as { theme: unknown }).theme;
  // กู้มาเป็นร่างก่อน — ให้ผู้ใช้ตรวจแล้วค่อยกดเผยแพร่เอง
  const { error } = await sb.from("shops").update({ theme_draft: theme }).eq("id", body.shopId);
  if (error) return NextResponse.json({ error: "กู้คืนไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "update",
    entityType: "shop_theme",
    entityId: body.shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { restoredFromVersion: body.versionNo, asDraft: true },
  });

  return NextResponse.json({ ok: true, theme: normalizeTheme(theme) });
}
