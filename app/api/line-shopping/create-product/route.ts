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
    admin.from("parent_skus_v2").select("id, code, name_th, name_platform, description, brand_id, weight_g").eq("id", parent_sku_id).maybeSingle(),
    admin.from("platform_listing_drafts").select("title, description, category_path, extra, image_keys, platform_product_id").eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id).maybeSingle(),
    admin.from("skus_v2").select("id, code, color_th, color, list_price, fake_price, cover_image_r2_key").eq("parent_sku_id", parent_sku_id).eq("is_active", true).order("code"),
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
  const skuRows = (skus ?? []) as { id: string; code: string; color_th: string | null; color: string | null; list_price: number | null; fake_price: number | null; cover_image_r2_key: string | null }[];

  // โครง 3 ชั้น: แยก "ตัวสี" (master) ออกจาก "ตัวขาย" (sellable) — ส่ง LINE เฉพาะตัวขาย
  // master = รหัสที่เป็นฐานของตัวขาย (WK42-01 เป็นฐานของ WK42-01D/N/G) · ตัวขายดึงราคา/รูปจากตัวสีเมื่อไม่มีของตัวเอง
  const baseOf = (code: string): string | null => { const m = code.match(/^(.*\d)[A-Za-z]+$/); return m ? m[1] : null; };
  const byCode = new Map(skuRows.map((s) => [s.code, s]));
  const masterCodes = new Set<string>();
  for (const s of skuRows) { const b = baseOf(s.code); if (b && byCode.has(b)) masterCodes.add(b); }
  const sellable = skuRows.filter((s) => !masterCodes.has(s.code));
  const masterOf = (code: string) => { const b = baseOf(code); return b ? byCode.get(b) : null; };

  // สต๊อกจริงต่อ SKU (พร้อมขาย = on_hand − reserved, รวมทุกคลัง) — เฉพาะตัวขาย
  const stockOf = new Map<string, number>();
  const skuIds = sellable.map((s) => s.id);
  if (skuIds.length) {
    const { data: bal } = await admin.from("erp_playground_stock_balances").select("product_id, qty_on_hand, qty_reserved").in("product_id", skuIds);
    for (const b of ((bal ?? []) as Record<string, unknown>[])) {
      const avail = (Number(b.qty_on_hand) || 0) - (Number(b.qty_reserved) || 0);
      stockOf.set(String(b.product_id), (stockOf.get(String(b.product_id)) ?? 0) + Math.max(0, avail));
    }
  }
  // บาร์โค้ด: ใช้ที่กรอก · ว่าง = รหัส Parent · น้ำหนัก(kg): ที่กรอก · ว่าง = weight_g÷1000
  const gtin = String(extra.barcode ?? "").trim() || String(p.code ?? "").trim();
  const weightRaw = extra.weight ? Number(extra.weight) : (p.weight_g != null ? Number(p.weight_g) / 1000 : 0);
  const weightKg = Number.isFinite(weightRaw) ? Math.round(weightRaw * 100) / 100 : 0;   // LINE: น้ำหนัก ≤ 2 ตำแหน่งทศนิยม
  // ราคา LINE: price=fake_price (เต็ม) · instantDiscount=fake−sale · ตัวขายไม่มี → ดึงจากตัวสี
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const fakeOf = (s: typeof skuRows[number]) => num(s.fake_price) || num(masterOf(s.code)?.fake_price);
  const saleOf = (s: typeof skuRows[number]) => num(s.list_price) || num(masterOf(s.code)?.list_price);
  const colors = [...new Set(sellable.map((s) => (s.color_th || s.color || "").trim()).filter(Boolean))];
  // หลายสี = "สินค้ามีตัวเลือก" (ส่ง variantOptions + options) · สีเดียว/ไม่มีสี = "สินค้าไม่มีตัวเลือก" (ไม่ส่ง — เลี่ยงปัญหา options invalid)
  const multiVariant = colors.length > 1;
  const variants = sellable.map((s) => {
    const fake = fakeOf(s); const sale = saleOf(s);
    const disc = (fake > 0 && sale > 0 && sale < fake) ? fake - sale : 0;
    const color = (s.color_th || s.color || "").trim();
    return { sku: s.code, price: fake, instantDiscount: disc, onHandNumber: stockOf.get(s.id) ?? 0,
      ...(multiVariant && color ? { options: { option1: { value: color } } } : {}),
      ...(weightKg > 0 ? { weight: weightKg } : {}), ...(gtin ? { gtin } : {}) };
  });

  // รูป: ใช้ที่เลือกในร่าง · ถ้าว่าง → ดึงปกตัวสี + ปกตัวขาย (สืบทอดจากตัวสี) อัตโนมัติ
  const autoKeys = imageKeys.length ? imageKeys : [...new Set([
    ...skuRows.filter((s) => masterCodes.has(s.code)).map((s) => s.cover_image_r2_key),
    ...sellable.map((s) => s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null),
  ].filter(Boolean) as string[])];
  const imageUrls = autoKeys.slice(0, 7).map((k) => `${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}`);   // LINE จำกัด ≤ 7 รูป

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
    // ส่ง variantOptions เฉพาะสินค้ามีหลายสี (multiVariant) · สีเดียว = สินค้าไม่มีตัวเลือก
    ...(multiVariant ? { variantOptions: { option1: { name: "สี", data: colors.map((c) => ({ value: c })) } } } : {}),
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
