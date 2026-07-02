import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST { platform, marketplace_item_id, internal_sku, listing_name? } → ผูกรหัส marketplace เข้ากับ SKU ระบบ
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "marketing.mapping.manage");
  if (denied) return denied;

  let body: { platform?: string; marketplace_item_id?: string; internal_sku?: string; listing_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 });
  }
  const platform = (body.platform || "shopee").trim();
  const marketplace_sku = String(body.marketplace_item_id ?? "").trim();
  const internal_sku = String(body.internal_sku ?? "").trim();
  if (!marketplace_sku || !internal_sku)
    return NextResponse.json({ data: null, error: "ต้องระบุรหัส marketplace และ SKU ระบบ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("marketplace_sku_mappings")
    .upsert(
      {
        platform,
        marketplace_sku,
        internal_sku,
        listing_name: body.listing_name ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,marketplace_sku" },
    )
    .select("id, platform, marketplace_sku, internal_sku")
    .single();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "marketing.mapping.set",
    entityType: "marketplace_sku_mappings",
    entityId: data?.id ?? null,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { platform, marketplace_sku, internal_sku },
  });

  return NextResponse.json({ data, error: null });
}

// DELETE ?platform=&item= → เลิกผูก
export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "marketing.mapping.manage");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const platform = (searchParams.get("platform") || "shopee").trim();
  const marketplace_sku = String(searchParams.get("item") ?? "").trim();
  if (!marketplace_sku) return NextResponse.json({ data: null, error: "ต้องระบุ item" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("marketplace_sku_mappings")
    .delete()
    .eq("platform", platform)
    .eq("marketplace_sku", marketplace_sku);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "marketing.mapping.unset",
    entityType: "marketplace_sku_mappings",
    entityId: null,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { platform, marketplace_sku },
  });

  return NextResponse.json({ data: { platform, marketplace_sku }, error: null });
}
