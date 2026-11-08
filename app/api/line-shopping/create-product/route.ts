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
import { linePrice } from "@/lib/platform-listing-builder";

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
    admin.from("parent_skus_v2").select("id, code, name_th, name_platform, description, platform_description, brand_id, weight_g").eq("id", parent_sku_id).maybeSingle(),
    admin.from("platform_listing_drafts").select("title, description, category_path, extra, image_keys, description_image_keys, platform_product_id").eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id).maybeSingle(),
    admin.from("skus_v2").select("id, code, color_th, color, list_price, fake_price, cover_image_r2_key, attribute_values").eq("parent_sku_id", parent_sku_id).eq("is_active", true).order("code"),
  ]);
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 400 });
  const p = parent as Record<string, unknown>;
  const d = (draft ?? {}) as Record<string, unknown>;
  if (d.platform_product_id) return NextResponse.json({ error: "สินค้านี้มีบน LINE แล้ว — ใช้ปุ่มส่ง update แทน" }, { status: 400 });
  // 🛡️ กันซ้ำชั้น 2 (บทเรียน JEAN08 ถูกสร้างซ้ำ 6 รายการ ก.ค. 2026): มีรายการบน LINE ที่จับคู่สินค้านี้อยู่แล้ว
  //    (เช่น ดึงสินค้าจากร้านแล้วจับคู่ แต่ร่างยังไม่มีรหัส) → ไม่สร้างซ้ำ
  {
    const { data: onShop } = await admin.from("platform_catalog_listings").select("external_product_id").eq("platform_id", platform_id).eq("matched_parent_sku_id", parent_sku_id).limit(1);
    const ex = ((onShop ?? []) as { external_product_id: string | null }[])[0];
    if (ex) return NextResponse.json({ error: `สินค้านี้มีบน LINE แล้ว (#${ex.external_product_id ?? "?"}) — ไม่สร้างซ้ำ` }, { status: 409 });
  }

  const brand_id = (p.brand_id as string) ?? null;
  if (!brand_id) return NextResponse.json({ error: "สินค้านี้ยังไม่มีแบรนด์ — ตั้งแบรนด์ก่อน (คีย์ LINE ผูกกับแบรนด์)" }, { status: 400 });
  const { data: brandRow } = await admin.from("brands").select("name").eq("id", brand_id).maybeSingle();
  const brandName = ((brandRow as { name?: string } | null)?.name ?? "").trim();
  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ error: "แบรนด์นี้ยังไม่ได้ใส่ API Key ของ LINE" }, { status: 400 });
  let apiKey: string; try { apiKey = await decryptSecret(stored); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้" }, { status: 400 }); }

  // ประกอบ payload
  const extra = (d.extra ?? {}) as Record<string, unknown>;
  const name = String(d.title || p.name_platform || p.name_th || "").trim();
  const categoryId = catIdOf(d.category_path);
  const imageKeys = Array.isArray(d.image_keys) ? d.image_keys as string[] : [];
  const skuRows = (skus ?? []) as { id: string; code: string; color_th: string | null; color: string | null; list_price: number | null; fake_price: number | null; cover_image_r2_key: string | null; attribute_values: Record<string, unknown> | null }[];

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
  // น้ำหนัก(kg): ที่กรอก · ว่าง = weight_g÷1000 · (บาร์โค้ดไม่ส่งตอน create — เลี่ยงชนกันข้าม variant · ตั้งทีหลังได้)
  const weightRaw = extra.weight ? Number(extra.weight) : (p.weight_g != null ? Number(p.weight_g) / 1000 : 0);
  const weightKg = Number.isFinite(weightRaw) ? Math.round(weightRaw * 100) / 100 : 0;   // LINE: น้ำหนัก ≤ 2 ตำแหน่งทศนิยม
  // ราคา LINE: price=fake_price (เต็ม) · instantDiscount=fake−sale · ตัวขายไม่มี → ดึงจากตัวสี · ไม่มีราคาเต็ม → ราคาขาย (linePrice)
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const fakeOf = (s: typeof skuRows[number]) => num(s.fake_price) || num(masterOf(s.code)?.fake_price);
  const saleOf = (s: typeof skuRows[number]) => num(s.list_price) || num(masterOf(s.code)?.list_price);
  // มิติตัวเลือก (LINE รองรับ option1 + option2): สี = มิติหลัก · ตัวเลือกที่ 2 = attribute_values.variant_option {name,value}
  const colorOf = (s: typeof skuRows[number]) => (s.color_th || s.color || "").trim();
  const voOf = (s: typeof skuRows[number]) => { const av = s.attribute_values; const vo = (av && typeof av === "object") ? (av as Record<string, unknown>).variant_option : null; return (vo && typeof vo === "object") ? vo as Record<string, unknown> : null; };
  const opt2Of = (s: typeof skuRows[number]) => { const vo = voOf(s); return vo ? String(vo.value ?? "").trim() : ""; };
  const opt2Name = (() => { for (const s of sellable) { const vo = voOf(s); const n = vo ? String(vo.name ?? "").trim() : ""; if (n) return n; } return "ตัวเลือก"; })();
  // รูปต่อสี (imageUrl ใส่ได้เฉพาะ option1 = สี): ใช้ปก "ตัวสี" (master) ก่อน แล้ว fallback ตัวขาย · LINE ต้อง 1:1 → เรียก r2-image แบบ square
  const sqImg = (k: string) => `${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}&w=800&sq=1&fmt=jpg`;
  const colorImg = new Map<string, string>();
  for (const s of skuRows) { const c = colorOf(s); if (!c || colorImg.has(c)) continue; const key = masterCodes.has(s.code) ? s.cover_image_r2_key : (s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null); if (key) colorImg.set(c, key); }
  // ค่าตัวเลือกเรียงตามลำดับพบครั้งแรก (index ต้องคงที่ เพราะ variant.options อ้าง index นี้)
  const distinctVals = (fn: (s: typeof skuRows[number]) => string) => { const out: string[] = []; const seen = new Set<string>(); for (const s of sellable) { const v = fn(s); if (v && !seen.has(v)) { seen.add(v); out.push(v); } } return out; };
  const dims: { name: string; vals: string[]; valOf: (s: typeof skuRows[number]) => string; img: boolean }[] = [];
  { const cv = distinctVals(colorOf); if (cv.length) dims.push({ name: "สี", vals: cv, valOf: colorOf, img: true }); }
  { const ov = distinctVals(opt2Of); if (ov.length) dims.push({ name: opt2Name, vals: ov, valOf: opt2Of, img: false }); }
  // เจ้าของต้องการ "ลงเป็นสินค้ามีตัวเลือกเสมอ แม้ SKU เดียว" → ถ้าไม่มีสี/ตัวเลือกเลย ใช้รหัส SKU เป็นค่าตัวเลือก
  if (!dims.length && sellable.length >= 1) dims.push({ name: "แบบ", vals: sellable.map((s) => s.code), valOf: (s) => s.code, img: false });
  const isVariant = dims.length > 0;   // สินค้ามีตัวเลือกเสมอ (LINE variant product) — ส่ง variantOptions + variant.options (index)
  const opt1 = dims[0]; const opt2 = dims[1];
  // ส่วนลด: create รับ instantDiscount "ระดับบนสุด" เท่านั้น → ใช้ค่าร่วมถ้าทุกตัวเท่ากัน ไม่งั้น 0 (ส่งส่วนลดต่อ SKU ทีหลังด้วยปุ่ม "ส่งราคา/ส่วนลด")
  // ราคา/ส่วนลดต่อตัวขาย = กฎกลาง linePrice (ไม่มีราคาเต็ม → ใช้ราคาขาย ไม่มีส่วนลด · เจ้าของตัดสิน 2026-11-08)
  const lpOf = (s: typeof skuRows[number]) => linePrice(fakeOf(s), saleOf(s));
  const discs = sellable.map((s) => lpOf(s)?.discount ?? 0);
  const topDiscount = discs.length && discs.every((d) => d === discs[0]) ? discs[0] : 0;
  const variants = sellable.map((s) => {
    const base: Record<string, unknown> = { sku: s.code, price: lpOf(s)?.price ?? 0, onHandNumber: stockOf.get(s.id) ?? 0 };
    if (weightKg > 0) base.weight = weightKg;
    // variant.options = array ของ index ชี้ค่าใน variantOptions (option1 ก่อน option2) เช่น [0] หรือ [0,1]
    if (opt1) { const i1 = Math.max(0, opt1.vals.indexOf(opt1.valOf(s))); base.options = opt2 ? [i1, Math.max(0, opt2.vals.indexOf(opt2.valOf(s)))] : [i1]; }
    return base;
  });

  // รูป: ใช้ที่เลือกในร่าง · ถ้าว่าง → ดึงปกตัวสี + ปกตัวขาย (สืบทอดจากตัวสี) อัตโนมัติ
  const autoKeys = imageKeys.length ? imageKeys : [...new Set([
    ...skuRows.filter((s) => masterCodes.has(s.code)).map((s) => s.cover_image_r2_key),
    ...sellable.map((s) => s.cover_image_r2_key || masterOf(s.code)?.cover_image_r2_key || null),
  ].filter(Boolean) as string[])];
  // รูปประกอบรายละเอียด (Description): LINE API ไม่รับ <img> ลิงก์ภายนอกในช่องรายละเอียด (400 "Invalid Description" แม้ HTML valid — รับเฉพาะรูปที่อัปผ่านตัวแก้ไข LINE เอง ซึ่ง API ไม่มี endpoint อัป) → รวมเข้าแกลเลอรีรูปสินค้าแทน
  const descImgKeys = Array.isArray(d.description_image_keys) ? d.description_image_keys as string[] : [];
  const galleryKeys = [...new Set([...autoKeys, ...descImgKeys])].slice(0, 7);   // LINE จำกัด ≤ 7 รูป (รูปหลักก่อน แล้วรูป Description เติมช่องที่เหลือ)
  const imageUrls = galleryKeys.map((k) => `${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}`);
  const descText = String(d.description || p.platform_description || p.description || "");

  // ตรวจครบก่อนส่ง
  const missing: string[] = [];
  if (!name) missing.push("ชื่อ");
  if (!categoryId) missing.push("หมวดหมู่ (เลือกจาก dropdown)");
  if (imageUrls.length === 0) missing.push("รูปสินค้า ≥ 1");
  if (variants.length === 0 || variants.every((v) => !v.price)) missing.push("ราคา SKU");
  if (missing.length) return NextResponse.json({ error: `ยังกรอกไม่ครบ: ${missing.join(", ")}` }, { status: 400 });

  const payload: Record<string, unknown> = {
    name, code: String(p.code ?? ""), categoryId: Number(categoryId), description: descText,
    brand: String(extra.brand || brandName || ""), imageUrls, variants, instantDiscount: topDiscount,
    // สินค้ามีตัวเลือกเสมอ → ส่ง variantOptions · imageUrl ต่อสีใส่ได้เฉพาะ option1 (สี) แบบ 1:1
    ...(isVariant && opt1 ? { variantOptions: {
      option1: { name: opt1.name, data: opt1.vals.map((v) => ({ value: v, ...(opt1.img && colorImg.get(v) ? { imageUrl: sqImg(colorImg.get(v)!) } : {}) })) },
      ...(opt2 ? { option2: { name: opt2.name, data: opt2.vals.map((v) => ({ value: v })) } } : {}),
    } } : {}),
  };

  // 🛡️ กันซ้ำชั้น 3: ล็อกระหว่างกำลังสร้าง (กดซ้ำ / 2 คนกดพร้อมกัน / ตัวช่วยลงสินค้ากับปุ่มในตัวจัดการ)
  //    ใช้ช่องเดิมของร่าง (last_sync_status = creating) ไม่ต้องแก้โครงตาราง · ล็อกค้างเกิน 3 นาที = ถือว่าหลุด ลองใหม่ได้
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id, platform_id }, { onConflict: "parent_sku_id,platform_id", ignoreDuplicates: true });
  const lockAt = new Date();
  const staleIso = new Date(lockAt.getTime() - 3 * 60 * 1000).toISOString();
  const { data: claimed } = await admin.from("platform_listing_drafts")
    .update({ last_sync_status: "creating", last_synced_at: lockAt.toISOString(), last_error: null })
    .eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id).is("platform_product_id", null)
    .or(`last_sync_status.is.null,last_sync_status.neq.creating,last_synced_at.lt.${staleIso}`)
    .select("id");
  if (!claimed?.length) return NextResponse.json({ error: "กำลังสร้างสินค้านี้บน LINE อยู่ (มีการกดไปแล้ว) — รอ 1-2 นาที แล้วกดดึงสินค้าจาก LINE เพื่อตรวจก่อนลองใหม่" }, { status: 409 });

  const res = await lineCreateProduct(apiKey, payload);
  if (!res.ok) {
    // ปลดล็อก + จดเหตุผล (ถ้า LINE สร้างไปแล้วแต่ตอบพลาด ให้ดึงสินค้าจาก LINE ก่อนลองใหม่ — ชั้น 2 จะกันซ้ำให้หลังจับคู่)
    await admin.from("platform_listing_drafts").update({ last_sync_status: "failed", last_error: String(res.error ?? "").slice(0, 500), last_synced_at: new Date().toISOString() })
      .eq("parent_sku_id", parent_sku_id).eq("platform_id", platform_id);
    return NextResponse.json({ ok: false, error: res.error, sent: { fields: Object.keys(payload), variants: variants.length, images: imageUrls.length } }, { status: 400 });
  }

  const productId = res.productId || "";
  const now = new Date().toISOString();
  // เก็บรหัสสินค้าในร่าง + สร้าง catalog listing (จับคู่ parent)
  await admin.from("platform_listing_drafts").upsert({ parent_sku_id, platform_id, platform_product_id: productId, last_sync_status: "created", last_synced_at: now, updated_by: user?.id ?? null, updated_at: now }, { onConflict: "parent_sku_id,platform_id" });
  if (productId) {
    const priceMin = Math.min(...variants.map((v) => Number(v.price) || 0).filter((n) => n > 0), Infinity);
    await admin.from("platform_catalog_listings").upsert({
      platform_id, brand_id, source: "api", external_product_id: productId, title: name, sku_code: String(p.code ?? ""),
      matched_parent_sku_id: parent_sku_id, price: Number.isFinite(priceMin) ? priceMin : null, last_imported_at: now, raw: { created_by_erp: true },
    }, { onConflict: "id", ignoreDuplicates: false });
  }
  await writeAudit(admin, { action: "create", entityType: "platform_catalog", entityId: productId || null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_create", parent_sku_id, brand_id, product_id: productId } });
  return NextResponse.json({ ok: true, product_id: productId, error: null });
}
