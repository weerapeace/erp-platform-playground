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
  const onlyParent = (body.parent_sku_id ?? "").trim();

  const admin = supabaseAdmin();
  // แบรนด์: ส่งมาตรง ๆ (โหมดหลายสินค้า) หรือหาจาก parent (โหมดสินค้าเดียว — กดจากตัวจัดการ)
  let brand_id = (body.brand_id ?? "").trim();
  if (!brand_id && onlyParent) {
    const { data: par } = await admin.from("parent_skus_v2").select("brand_id").eq("id", onlyParent).maybeSingle();
    brand_id = ((par as { brand_id?: string } | null)?.brand_id ?? "").trim();
  }
  if (!brand_id) return NextResponse.json({ error: "ต้องเลือกแบรนด์/ร้าน หรือระบุสินค้าที่มีแบรนด์" }, { status: 400 });
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
  const rows = (listings ?? []) as { external_product_id: string; title: string | null; matched_parent_sku_id: string; raw: Record<string, unknown> }[];
  if (rows.length === 0) return NextResponse.json({ ok: true, note: "ไม่มีสินค้าที่จับคู่ ERP แล้วให้ส่งราคา", results: [], error: null });

  // รวม sku ทั้งหมด → ดึง fake_price (เต็ม) + list_price (ขาย) จาก ERP
  const variantsOf = (r: { raw: Record<string, unknown> }): Record<string, unknown>[] => {
    const line = (r.raw?.line && typeof r.raw.line === "object") ? r.raw.line as Record<string, unknown> : {};
    return Array.isArray(line.variants) ? line.variants as Record<string, unknown>[] : [];
  };
  const baseOf = (code: string): string | null => { const m = code.match(/^(.*\d)[A-Za-z]+$/); return m ? m[1] : null; };
  const allSkus = [...new Set(rows.flatMap((r) => variantsOf(r).map((v) => asStr(v.sku)).filter(Boolean) as string[]))];
  // โหลดราคาของตัวขาย + ตัวสี (base) เผื่อสืบทอด · ส่ง LINE: price=fake, instantDiscount=fake−sale
  const lookupCodes = [...new Set([...allSkus, ...(allSkus.map(baseOf).filter(Boolean) as string[])])];
  const fakeOf = new Map<string, number>(); const saleOf = new Map<string, number>();
  if (lookupCodes.length) {
    const { data: skus } = await admin.from("skus_v2").select("code, fake_price, list_price").in("code", lookupCodes);
    for (const s of ((skus ?? []) as Record<string, unknown>[])) {
      const f = Number(s.fake_price); if (Number.isFinite(f) && f > 0) fakeOf.set(String(s.code), f);
      const l = Number(s.list_price); if (Number.isFinite(l) && l > 0) saleOf.set(String(s.code), l);
    }
  }
  const resolve = (m: Map<string, number>, sku: string): number | null => { const own = m.get(sku); if (own != null) return own; const b = baseOf(sku); const mv = b ? m.get(b) : undefined; return mv ?? null; };

  // ยิงราคาไป LINE ทีละสินค้า
  const results: { product: string; ok: boolean; variants: number; error?: string }[] = [];
  let okCount = 0;
  for (const r of rows) {
    // variant ของ LINE ใช้ฟิลด์ id (ตัวเลข) เป็นตัวระบุ · sku ไว้จับคู่ราคา ERP
    const items = variantsOf(r)
      .map((v) => ({ variantId: asStr(v.id ?? v.variantId), sku: asStr(v.sku) }))
      .filter((v): v is { variantId: string; sku: string } => !!(v.variantId && v.sku))
      .map((v) => ({ variantId: v.variantId, fake: resolve(fakeOf, v.sku), sale: resolve(saleOf, v.sku) }))
      .filter((v) => v.fake != null && v.fake > 0)   // ต้องมีราคาเต็ม (Fake) ถึงส่ง (กันส่งราคา 0)
      .map((v) => ({ variantId: v.variantId, price: v.fake as number, instantDiscount: (v.sale != null && v.sale < (v.fake as number)) ? (v.fake as number) - v.sale : 0 }));
    if (items.length === 0) { results.push({ product: r.title ?? r.external_product_id, ok: false, variants: 0, error: "ไม่พบ variant id หรือราคาเต็ม (Fake) ของ SKU ใน ERP" }); continue; }
    const res = await lineUpdatePrices(apiKey, r.external_product_id, items);
    if (res.ok) okCount++;
    results.push({ product: r.title ?? r.external_product_id, ok: res.ok, variants: items.length, error: res.ok ? undefined : res.error });
  }

  await writeAudit(admin, { action: "update", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_push_price", brand_id, parent_sku_id: onlyParent || null, products: rows.length, ok: okCount } });
  return NextResponse.json({ ok: true, total: rows.length, okCount, results, error: null });
}
