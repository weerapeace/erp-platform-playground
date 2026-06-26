/**
 * ลงขายขึ้นแพลตฟอร์ม — /api/product-platforms/publish (เฟส 2, pipeline ในบ้าน + mock connector)
 * POST { parent_sku_id, platform_id }      → ลงขาย 1 แพลตฟอร์ม
 * POST { parent_sku_id, all: true }         → ลงขายทุกแพลตฟอร์มที่ "พร้อม" (ข้ามตัวที่ไม่ครบ/ไม่มีร้าน เก็บเหตุผล)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { publishOne } from "@/lib/platform-publish";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { parent_sku_id?: string; platform_id?: string; all?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parentSkuId = (body.parent_sku_id ?? "").trim();
  if (!parentSkuId) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const admin = supabaseAdmin();
  const uid = user?.id ?? null;

  if (body.all) {
    // ทุกแพลตฟอร์มที่มีร่าง — ลองทีละตัว เก็บผล/เหตุผล
    const { data: drafts } = await admin.from("platform_listing_drafts").select("platform_id").eq("parent_sku_id", parentSkuId);
    const ids = ((drafts ?? []) as { platform_id: string }[]).map((d) => d.platform_id);
    const results: { platform_id: string; ok: boolean; error?: string; platform_product_id?: string }[] = [];
    for (const pid of ids) {
      try { const r = await publishOne(admin, parentSkuId, pid, uid); results.push({ platform_id: pid, ok: true, platform_product_id: r.platform_product_id }); }
      catch (e) { results.push({ platform_id: pid, ok: false, error: (e as Error).message }); }
    }
    return NextResponse.json({ results, error: null });
  }

  const platformId = (body.platform_id ?? "").trim();
  if (!platformId) return NextResponse.json({ error: "ต้องระบุ platform_id" }, { status: 400 });
  try {
    const r = await publishOne(admin, parentSkuId, platformId, uid);
    return NextResponse.json({ ok: true, ...r, error: null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
