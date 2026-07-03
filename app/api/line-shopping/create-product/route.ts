/**
 * สร้างสินค้าใหม่บน LINE SHOPPING — /api/line-shopping/create-product
 *  POST { parent_sku_id }  (products.platforms.edit)
 *   → ประกอบข้อมูลจากร่าง (title/หมวด/รูป/แบรนด์) + SKU (ราคา/สี) → POST /products (สร้างใหม่)
 *   → เก็บ platform_product_id ในร่าง + สร้าง catalog listing (จับคู่ parent) · Create-1: ยังไม่ส่งสต๊อก/น้ำหนักเต็ม
 * หมายเหตุ: เขียนสร้างสินค้าจริงบนร้าน LINE — payload อาจต้องปรับตาม error จาก API (ทดสอบทีละตัว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineCreateProduct } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const baseUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
const catIdOf = (path: unknown): string | null => { const s = String(path ?? "").trim(); if (!s) return null; if (s.includes(" · ")) return s.split(" · ")[0].trim() || null; const m = s.match(/^(\d+)\b/); return m ? m[1] : null; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { parent_sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parent_sku_id = (body.parent_sku_id ?? "").trim();
  if (!parent_sku_id) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING" }, { status: 400 });

  const [{ data: parent }, { data: draft }, { data: skus }] = await Promise.all([
    admin.from("parent_skus_v2").select("id, code, name_th, name_platform, description, brand_id").eq("id", parent_sku_id).maybeSingle(),
    admin.from("platform_listing_drafts").select("title, description, category_path, extra, image_keys, platform_product_id").eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id).maybeSingle(),
    admin.from("skus_v2").select("code, color_th, color, list_price").eq("parent_sku_id", parent_sku_id).eq("is_active", true).order("code"),
  ]);
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 400 });
  const p = parent as Record<string, unknown>;
  const d = (draft ?? {}) as Record<string, unknown>;
  if (d.platform_product_id) return NextResponse.json({ error: "สินค้านี้มีบน LINE แล้ว — ใช้ปุ่มส่ง update แทน" }, { status: 400 });

  const brand_id = (p.brand_id as string) ?? null;
  if (!brand_id) return NextResponse.json({ error: "สินค้านี้ยังไม่มีแบรนด์ — ตั้งแบรนด์ก่อน (คีย์ LINE ผูกกับแบรนด์)" }, { status: 400 });
  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้ใส่ API Key ของ LINE" }, { status: 400 });
  let apiKey: string; try { apiKey = await decryptSecret(stored); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้" }, { status: 400 }); }

  // ประกอบ payload
  const extra = (d.extra ?? {}) as Record<string, unknown>;
  const name = String(d.title || p.name_platform || p.name_th || "").trim();
  const categoryId = catIdOf(d.category_path);
  const imageKeys = Array.isArray(d.image_keys) ? d.image_keys as string[] : [];
  const imageUrls = imageKeys.map((k) => `${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}`);
  const skuRows = (skus ?? []) as { code: string; color_th: string | null; color: string | null; list_price: number | null }[];
  const variants = skuRows.map((s) => ({ sku: s.code, price: Number(s.list_price) || 0, onHandNumber: 0, ...(extra.weight ? { weight: Number(extra.weight) } : {}) }));
  const colors = [...new Set(skuRows.map((s) => (s.color_th || s.color || "").trim()).filter(Boolean))];

  // ตรวจครบก่อนส่ง
  const missing: string[] = [];
  if (!name) missing.push("ชื่อ");
  if (!categoryId) missing.push("หมวดหมู่ (เลือกจาก dropdown)");
  if (imageUrls.length === 0) missing.push("รูปสินค้า ≥ 1");
  if (variants.length === 0 || variants.every((v) => !v.price)) missing.push("ราคา SKU");
  if (missing.length) return NextResponse.json({ error: `ยังกรอกไม่ครบ: ${missing.join(", ")}` }, { status: 400 });

  const payload: Record<string, unknown> = {
    name, code: String(p.code ?? ""), categoryId: Number(categoryId), description: String(d.description || ""),
    brand: String(extra.brand || ""), imageUrls, variants, instantDiscount: 0,
    ...(colors.length ? { variantOptions: [{ name: "สี", options: colors }] } : {}),
  };

  const res = await lineCreateProduct(apiKey, payload);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error, sent: { fields: Object.keys(payload), variants: variants.length, images: imageUrls.length } }, { status: 400 });

  const productId = res.productId || "";
  const now = new Date().toISOString();
  // เก็บรหัสสินค้าในร่าง + สร้าง catalog listing (จับคู่ parent)
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id, platform_id, platform_product_id: productId, last_sync_status: "created", last_synced_at: now, updated_by: user?.id ?? null, updated_at: now }, { onConflict: "parent_sku_id,platform_id" });
  if (productId) {
    const priceMin = Math.min(...variants.map((v) => v.price).filter((n) => n > 0), Infinity);
    await admin.from("platform_catalog_listings").upsert({
      platform_id, brand_id, source: "api", external_product_id: productId, title: name, sku_code: String(p.code ?? ""),
      matched_parent_sku_id: parent_sku_id, price: Number.isFinite(priceMin) ? priceMin : null, last_imported_at: now, raw: { created_by_erp: true },
    }, { onConflict: "id", ignoreDuplicates: false });
  }
  await writeAudit(admin, { action: "create", entityType: "platform_catalog", entityId: productId || null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_create", parent_sku_id, brand_id, product_id: productId } });
  return NextResponse.json({ ok: true, product_id: productId, error: null });
}
