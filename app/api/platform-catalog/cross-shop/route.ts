/**
 * เช็กข้ามร้าน — /api/platform-catalog/cross-shop (หน้าสินค้าบนแพลตฟอร์ม ?view=cross)
 *
 *  GET ?brand_id=  (products.platforms.view · อ่านอย่างเดียว ไม่ส่งอะไรขึ้นร้าน)
 *    → CrossShopResponse (lib/platform-cross-shop): ร้าน + แถวละ 1 Parent SKU × ช่องละ 1 ร้าน (สถานะ/ราคา/ชื่อ/รายละเอียด/สต๊อก/ตัวเลือก)
 *    &suggest=0   = ไม่เดาคู่ (เร็วกว่า ~3 เท่า) — หน้าเรียกแบบนี้ก่อนให้ตารางขึ้นเร็ว
 *    &part=maybe  = ตัวเดาคู่อย่างเดียว → { maybe: CrossMaybe } — หน้าเรียกตามหลังเติมช่อง "อาจมีแล้ว" (mergeCrossMaybe)
 *  ประกอบข้อมูลที่ lib/platform-cross-shop-server · ความพร้อมลงไม่อยู่ที่นี่ (หน้าเรียก /api/product-platforms/create-readiness ทีละแถวที่อยู่บนจอ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadCrossShop, loadCrossShopMaybe } from "@/lib/platform-cross-shop-server";
import type { CrossShopResponse } from "@/lib/platform-cross-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (request.nextUrl.searchParams.get("brand_id") ?? "").trim();
  const empty: CrossShopResponse = { brand: null, shops: [], rows: [], unmatched: {}, error: null };
  if (!brandId) return NextResponse.json({ ...empty, error: "ต้องเลือกแบรนด์ก่อน" }, { status: 400, headers: NO_STORE });
  const t0 = Date.now();
  const sp = request.nextUrl.searchParams;
  if (sp.get("part") === "maybe") {
    try {
      const maybe = await loadCrossShopMaybe(supabaseAdmin(), brandId);
      return NextResponse.json({ maybe, error: null }, { headers: { ...NO_STORE, "Server-Timing": `maybe;dur=${Date.now() - t0}` } });
    } catch (e) {
      console.error("[cross-shop maybe]", e);
      return NextResponse.json({ maybe: {}, error: "เดาคู่ไม่สำเร็จ" }, { status: 500, headers: NO_STORE });
    }
  }
  try {
    const data = await loadCrossShop(supabaseAdmin(), brandId, { suggest: sp.get("suggest") !== "0" });
    const body: CrossShopResponse = { ...data, error: null };
    return NextResponse.json(body, { headers: { ...NO_STORE, "Server-Timing": `load;dur=${Date.now() - t0}` } });
  } catch (e) {
    console.error("[cross-shop]", e);
    return NextResponse.json({ ...empty, error: "โหลดข้อมูลไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง" }, { status: 500, headers: NO_STORE });
  }
}

/**
 *  POST { parent_ids: string[] } (≤ 500 · products.platforms.view · อ่านอย่างเดียว)
 *    → { skus: { id, code, parent_sku_id, sale, fake }[] } SKU เปิดขายของรุ่นที่ติ๊ก — ป้อนหน้าต่าง "ใส่ราคาเต็ม" (FakePriceDialog)
 *    บันทึกไม่ได้ทำที่นี่: หน้าส่งต่อ POST /api/master-v2/skus/bulk-update (products.edit + audit) ทางเดิมของปุ่มรายรุ่น
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  let ids: string[] = [];
  try { const b = await request.json() as { parent_ids?: unknown }; ids = Array.isArray(b.parent_ids) ? b.parent_ids.filter((x): x is string => typeof x === "string" && !!x) : []; }
  catch { return NextResponse.json({ skus: [], error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers: NO_STORE }); }
  if (!ids.length) return NextResponse.json({ skus: [], error: "ยังไม่ได้เลือกสินค้า" }, { status: 400, headers: NO_STORE });
  if (ids.length > 500) return NextResponse.json({ skus: [], error: "เลือกได้ครั้งละไม่เกิน 500 รุ่น" }, { status: 400, headers: NO_STORE });
  const admin = supabaseAdmin();
  const out: { id: string; code: string; parent_sku_id: string; sale: number | null; fake: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("skus_v2").select("id, code, parent_sku_id, list_price, fake_price, is_active, sale_ok")
      .in("parent_sku_id", ids.slice(i, i + 200)).order("code", { ascending: true }).limit(5000);
    if (error) { console.error("[cross-shop skus]", error); return NextResponse.json({ skus: [], error: "โหลด SKU ไม่สำเร็จ" }, { status: 500, headers: NO_STORE }); }
    for (const s of (data ?? []) as { id: string; code: string; parent_sku_id: string; list_price: number | null; fake_price: number | null; is_active: boolean | null; sale_ok: boolean | null }[]) {
      if (s.is_active === false || s.sale_ok === false) continue;
      out.push({ id: s.id, code: s.code, parent_sku_id: s.parent_sku_id, sale: s.list_price != null ? Number(s.list_price) : null, fake: s.fake_price != null ? Number(s.fake_price) : null });
    }
  }
  return NextResponse.json({ skus: out, error: null }, { headers: NO_STORE });
}
