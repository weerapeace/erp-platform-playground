/**
 * เปิด/ปิดการขายสินค้าบน LINE — /api/line-shopping/set-display
 *  POST { parent_sku_id, status: "onsale" | "hide" }  (products.platforms.edit)
 *   → สินค้าที่สร้างบน LINE แล้ว (มี platform_product_id) → POST /products/{id}/display-status/{status}
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineSetDisplay } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { parent_sku_id?: string; status?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parent_sku_id = (body.parent_sku_id ?? "").trim();
  const status = body.status === "hide" ? "hide" : "onsale";
  if (!parent_sku_id) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING" }, { status: 400 });

  const [{ data: parent }, { data: draft }] = await Promise.all([
    admin.from("parent_skus_v2").select("brand_id").eq("id", parent_sku_id).maybeSingle(),
    admin.from("platform_listing_drafts").select("platform_product_id").eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id).maybeSingle(),
  ]);
  const brand_id = (parent as { brand_id?: string } | null)?.brand_id ?? null;
  const productId = (draft as { platform_product_id?: string } | null)?.platform_product_id ?? null;
  if (!productId) return NextResponse.json({ error: "สินค้านี้ยังไม่ได้สร้างบน LINE" }, { status: 400 });
  if (!brand_id) return NextResponse.json({ error: "สินค้าไม่มีแบรนด์" }, { status: 400 });

  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้ใส่ API Key" }, { status: 400 });
  let apiKey: string; try { apiKey = await decryptSecret(stored); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้" }, { status: 400 }); }

  const res = await lineSetDisplay(apiKey, productId, status);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  await admin.from("platform_listing_drafts").update({ status: status === "onsale" ? "onsale" : "hidden", updated_at: new Date().toISOString() }).eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id);
  await writeAudit(admin, { action: "update", entityType: "platform_catalog", entityId: productId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_display", parent_sku_id, status } });
  return NextResponse.json({ ok: true, status, error: null });
}
