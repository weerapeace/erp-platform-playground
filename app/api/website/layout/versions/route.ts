/**
 * ประวัติเวอร์ชันของหน้าแรก — /api/website/layout/versions
 * GET  ?shop=<slug>            → รายการเวอร์ชันที่เคยเผยแพร่ (ใหม่→เก่า)
 * POST { shopId, versionNo }   → ดึงเวอร์ชันนั้นกลับมาเป็น "ร่าง" (ยังไม่เผยแพร่ทันที)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeBlocks } from "@/lib/website-blocks";
import { toWebVersion, VERSION_LIST_LIMIT, type WebVersionRow } from "@/lib/website-versions";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();

  const shop = await shopBySlug(sb, shopSlug);
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const { data } = await sb
    .from("store_home_versions")
    .select("version_no, layout, actor, created_at")
    .eq("shop_id", (shop as { id: string }).id)
    .order("version_no", { ascending: false })
    .limit(VERSION_LIST_LIMIT);

  return NextResponse.json({ versions: ((data ?? []) as WebVersionRow[]).map(toWebVersion) }, { headers: { "Cache-Control": "no-store" } });
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
    .from("store_home_versions")
    .select("layout")
    .eq("shop_id", body.shopId)
    .eq("version_no", body.versionNo)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });

  const blocks = normalizeBlocks((v as { layout: unknown }).layout);
  const { error } = await sb.from("shops").update({ home_layout_draft: blocks }).eq("id", body.shopId);
  if (error) return NextResponse.json({ error: "กู้คืนไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "update",
    entityType: "shop_home_layout",
    entityId: body.shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { restoredFromVersion: body.versionNo, asDraft: true },
  });

  return NextResponse.json({ ok: true, blocks });
}
