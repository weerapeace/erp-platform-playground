/**
 * 📤 ลงสินค้าบนแพลตฟอร์ม — ความพร้อมของสินค้าทั้งแบรนด์ ต่อร้าน 1 ร้าน (อ่านอย่างเดียว · ป้อนตารางกลาง)
 * GET ?platform_code=lazada&brand_id=<uuid> → { data, total, summary, platform, error }
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

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const brandId = (sp.get("brand_id") ?? "").trim();
  const admin = supabaseAdmin();
  const platform = await loadPlatformByCode(admin, sp.get("platform_code"));
  if (!platform) return NextResponse.json({ data: [], total: 0, error: "ไม่พบแพลตฟอร์ม (หรือปิดใช้งานอยู่)" }, { status: 400 });
  if (!brandId) return NextResponse.json({ data: [], total: 0, error: "เลือกแบรนด์ก่อน" }, { status: 400 });

  const parents = await fetchAllPages<{ id: string }>((from, to) =>
    admin.from("parent_skus_v2").select("id").eq("brand_id", brandId).eq("is_active", true).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to));
  const items = await loadListingContexts(admin, parents.map((p) => p.id), platform.id);

  const data = items.map((it) => readinessOf(platform.code, it, DEFAULT_PRICE_RULE))
    .sort((a, b) => (ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) || a.code.localeCompare(b.code));
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
