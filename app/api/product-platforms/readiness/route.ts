/**
 * 📤 ลงสินค้าบนแพลตฟอร์ม — ความพร้อมของสินค้าทั้งแบรนด์ ต่อร้าน 1 ร้าน (อ่านอย่างเดียว · ป้อนตารางกลาง)
 * GET ?platform_code=lazada&brand_id=<uuid> → { data, total, summary, platform, error }
 * GET ?platform_code=…&parent_sku_ids=a,b,c (≤200) → เฉพาะสินค้าที่เลือก + data[].on_shop (มีรายการบนร้านจับคู่อยู่แล้ว) — ตัวช่วยลงสินค้า
 * สถานะ: ลงแล้ว · พร้อมลง · เตรียมแล้ว·ขาดข้อมูล · ยังไม่เตรียม (+ "ถ้าเตรียมตอนนี้" พร้อมไหม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { loadListingContexts } from "@/lib/product-listing-context";
import { DEFAULT_PRICE_RULE } from "@/lib/platform-listing-builder";
import { loadPlatformByCode, readinessOf, hasRealConnector } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const ORDER = ["missing", "ready", "new", "listed"];
const PICK_MAX = 200;

/** สินค้าที่มีรายการบนร้านนี้จับคู่อยู่แล้ว (เช่น นำเข้าจากไฟล์/ดึงจากร้านแล้วจับคู่) — ร่างอาจยังไม่มีรหัสบนร้าน */
async function onShopSet(admin: ReturnType<typeof supabaseAdmin>, platformId: string, parentIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < parentIds.length; i += 100) {
    const { data } = await admin.from("platform_catalog_listings").select("matched_parent_sku_id").eq("platform_id", platformId).in("matched_parent_sku_id", parentIds.slice(i, i + 100));
    for (const r of (data ?? []) as { matched_parent_sku_id: string | null }[]) if (r.matched_parent_sku_id) out.add(r.matched_parent_sku_id);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const brandId = (sp.get("brand_id") ?? "").trim();
  // ตัวช่วยลงสินค้า: ตรวจเฉพาะสินค้าที่เลือก (≤200) ไม่ต้องคิดทั้งแบรนด์ + บอกว่ามีบนร้านแล้วไหม (on_shop) กันลงซ้ำ
  const pickIds = [...new Set((sp.get("parent_sku_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, PICK_MAX);
  const admin = supabaseAdmin();
  const platform = await loadPlatformByCode(admin, sp.get("platform_code"));
  if (!platform) return NextResponse.json({ data: [], total: 0, error: "ไม่พบแพลตฟอร์ม (หรือปิดใช้งานอยู่)" }, { status: 400 });
  if (!brandId && !pickIds.length) return NextResponse.json({ data: [], total: 0, error: "เลือกแบรนด์ก่อน" }, { status: 400 });

  const parentIds = pickIds.length ? pickIds : (await fetchAllPages<{ id: string }>((from, to) =>
    admin.from("parent_skus_v2").select("id").eq("brand_id", brandId).eq("is_active", true).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to))).map((p) => p.id);
  const [items, onShop] = await Promise.all([
    loadListingContexts(admin, parentIds, platform.id),
    pickIds.length ? onShopSet(admin, platform.id, pickIds) : Promise.resolve(null),
  ]);

  const data = items.map((it) => {
    const r = readinessOf(platform.code, it, DEFAULT_PRICE_RULE);
    return onShop ? { ...r, on_shop: onShop.has(r.id) } : r;
  }).sort((a, b) => (ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) || a.code.localeCompare(b.code));
  const summary = {
    total: data.length,
    listed: data.filter((r) => r.status === "listed").length,
    ready: data.filter((r) => r.status === "ready").length,
    missing: data.filter((r) => r.status === "missing").length,
    new: data.filter((r) => r.status === "new").length,
    new_ready_now: data.filter((r) => r.status === "new" && r.ready_now).length,
    no_category: data.filter((r) => !r.platform_category).length,
  };
  return NextResponse.json({
    data, total: data.length, summary,
    platform: { ...platform, can_publish: hasRealConnector(platform) },
    error: null,
  });
}
