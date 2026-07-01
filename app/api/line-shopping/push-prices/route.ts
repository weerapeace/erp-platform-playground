/**
 * ส่งราคา ERP → LINE SHOPPING — /api/line-shopping/push-prices
 *  POST { brand_id, parent_sku_id? }  (products.platforms.edit)
 *   → สินค้า LINE ที่จับคู่ ERP แล้ว (platform_catalog_listings, source ใด ๆ, มี matched + raw.line.variants)
 *   → map แต่ละ variant (variantId, sku) → ราคาขายใน ERP (skus_v2.list_price) → PATCH /products/{id}/prices
 *   → คืนผลรายสินค้า (ok/ผิดพลาด+ข้อความจาก LINE) เพื่อยืนยัน/ปรับรูปแบบ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineUpdatePrices } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const asStr = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; parent_sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  if (!brand_id) return NextResponse.json({ error: "ต้องเลือกแบรนด์/ร้านก่อน" }, { status: 400 });
  const onlyParent = (body.parent_sku_id ?? "").trim();

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING" }, { status: 400 });

  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ error: "ยังไม่ได้ใส่ API Key ของแบรนด์นี้" }, { status: 400 });
  let apiKey: string;
  try { apiKey = await decryptSecret(stored); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้ (กุญแจหลักไม่ตรง/หาย?)" }, { status: 400 }); }

  // สินค้า LINE ที่จับคู่ ERP แล้ว
  let q = admin.from("platform_catalog_listings").select("external_product_id, title, matched_parent_sku_id, raw").eq("platform_id", platform_id).eq("brand_id", brand_id).not("matched_parent_sku_id", "is", null);
  if (onlyParent) q = q.eq("matched_parent_sku_id", onlyParent);
  const { data: listings } = await q;
  const rows = (listings ?? []) as { external_product_id: string; title: string | null; raw: Record<string, unknown> }[];
  if (rows.length === 0) return NextResponse.json({ ok: true, note: "ไม่มีสินค้าที่จับคู่ ERP แล้วให้ส่งราคา", results: [], error: null });

  // รวม sku ทั้งหมด → ดึงราคาขาย (list_price) จาก ERP
  const variantsOf = (r: { raw: Record<string, unknown> }): Record<string, unknown>[] => {
    const line = (r.raw?.line && typeof r.raw.line === "object") ? r.raw.line as Record<string, unknown> : {};
    return Array.isArray(line.variants) ? line.variants as Record<string, unknown>[] : [];
  };
  const allSkus = [...new Set(rows.flatMap((r) => variantsOf(r).map((v) => asStr(v.sku)).filter(Boolean) as string[]))];
  const priceOf = new Map<string, number>();
  if (allSkus.length) {
    const { data: skus } = await admin.from("skus_v2").select("code, list_price").in("code", allSkus);
    for (const s of ((skus ?? []) as Record<string, unknown>[])) { const p = Number(s.list_price); if (!Number.isNaN(p)) priceOf.set(String(s.code), p); }
  }

  // ยิงราคาไป LINE ทีละสินค้า
  const results: { product: string; ok: boolean; variants: number; error?: string }[] = [];
  let okCount = 0;
  for (const r of rows) {
    const items = variantsOf(r)
      .map((v) => ({ variantId: asStr(v.variantId), sku: asStr(v.sku) }))
      .filter((v) => v.variantId && v.sku && priceOf.has(v.sku))
      .map((v) => ({ variantId: v.variantId as string, price: priceOf.get(v.sku as string)! }));
    if (items.length === 0) { results.push({ product: r.title ?? r.external_product_id, ok: false, variants: 0, error: "ไม่พบราคาขายใน ERP สำหรับ SKU ของสินค้านี้" }); continue; }
    const res = await lineUpdatePrices(apiKey, r.external_product_id, items);
    if (res.ok) okCount++;
    results.push({ product: r.title ?? r.external_product_id, ok: res.ok, variants: items.length, error: res.ok ? undefined : res.error });
  }

  await writeAudit(admin, { action: "update", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_push_price", brand_id, products: rows.length, ok: okCount } });
  return NextResponse.json({ ok: true, total: rows.length, okCount, results, error: null });
}
