/**
 * เลิกเชื่อมสินค้ากับแพลตฟอร์ม — /api/product-platforms/unlink
 *  POST { parent_sku_id, platform_id }  (products.platforms.edit)
 *   → ล้าง platform_product_id/สถานะซิงก์บน "ร่าง" + ปลดจับคู่ catalog listing ของ parent นี้
 *   → ไม่ได้ลบสินค้าจริงบนแพลตฟอร์ม — แค่ให้ระบบ "ลืมการเชื่อม" เพื่อกด "สร้างสินค้าใหม่" ได้อีกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { parent_sku_id?: string; platform_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parent_sku_id = String(body.parent_sku_id ?? "").trim();
  const platform_id = String(body.platform_id ?? "").trim();
  if (!parent_sku_id || !platform_id) return NextResponse.json({ error: "ต้องมี parent_sku_id + platform_id" }, { status: 400 });

  const admin = supabaseAdmin();
  // อ่านรหัสสินค้าบนแพลตฟอร์มก่อนล้าง (ไว้ audit)
  const { data: draft } = await admin.from("platform_listing_drafts")
    .select("platform_product_id").eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id).maybeSingle();
  const productId = (draft as { platform_product_id?: string } | null)?.platform_product_id ?? null;

  // ล้างการเชื่อมบนร่าง (ไม่แตะสินค้าจริงบนแพลตฟอร์ม)
  const { error } = await admin.from("platform_listing_drafts")
    .update({ platform_product_id: null, last_sync_status: null, last_error: null, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ปลดจับคู่ catalog listing ที่ชี้มาสินค้านี้ (ถ้ามี)
  await admin.from("platform_catalog_listings")
    .update({ matched_parent_sku_id: null }).eq("platform_id", platform_id).eq("matched_parent_sku_id", parent_sku_id);

  await writeAudit(admin, { action: "update", entityType: "platform_listing_draft", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { parent_sku_id, platform_id, unlinked_product_id: productId } });
  return NextResponse.json({ ok: true, error: null });
}
