/**
 * 📈 สินค้าที่ขายได้บนแพลตฟอร์ม — GET /api/platform-sales/report
 *   ?month=YYYY-MM                → ทั้งเดือน + ยอดรายวันของเดือน (daily)
 *   ?date=YYYY-MM-DD              → วันเดียว (+ prev = ยอดวันก่อนหน้า ไว้เทียบ)
 *   &platform_id= &brand_id=      → กรอง
 * สิทธิ์: platform_orders.view
 *
 * ตัวนับอยู่ที่ของกลาง lib/platform-sales/server (ใช้ร่วมกับรายงานอัตโนมัติรายวัน → ตัวเลขตรงกัน)
 * คืน products ในรูป SoldProduct (lib/sold-products) → ใช้ตารางกลาง SoldProductsTable ได้เลย (customer = ร้าน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isMonthKey, thisMonth } from "@/lib/month";
import { dayBoundsTh, isDateKey, lineDisplayName, loadPlatformSales, monthBoundsTh, thaiDate } from "@/lib/platform-sales/server";
import type { SoldProduct } from "@/lib/sold-products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const date = isDateKey(sp.get("date")) ? String(sp.get("date")) : null;
  const month = isMonthKey(sp.get("month")) ? String(sp.get("month")) : (date ? date.slice(0, 7) : thisMonth());
  const filters = { platformId: (sp.get("platform_id") ?? "").trim() || undefined, brandId: (sp.get("brand_id") ?? "").trim() || undefined };
  const admin = supabaseAdmin();

  try {
    const sales = await loadPlatformSales(admin, { ...filters, range: date ? dayBoundsTh(date) : monthBoundsTh(month) });
    // วันเดียว: ยอดวันก่อนหน้าไว้เทียบ (เฉพาะตัวเลขรวม)
    const prev = date ? (await loadPlatformSales(admin, { ...filters, range: dayBoundsTh(thaiDate(`${date}T12:00:00+07:00`, -1)) })).summary : null;
    const products: SoldProduct[] = sales.lines.map((l) => ({
      customer: l.shop, customer_code: null, sku: l.code, name: lineDisplayName(l), unit: "ชิ้น", qty: l.qty, amt: l.amt, image: l.image,
    }));
    return NextResponse.json({
      month, date,
      platforms: sales.platforms, brands: sales.brands,
      summary: sales.summary,
      prev: prev ? { orders: prev.orders, qty: prev.qty, amount: prev.amount } : null,
      by_shop: sales.by_shop,
      daily: date ? [] : sales.daily,
      products,
      error: null,
    });
  } catch (e) {
    console.error("[platform-sales/report]", e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่" }, { status: 500 });
  }
}
