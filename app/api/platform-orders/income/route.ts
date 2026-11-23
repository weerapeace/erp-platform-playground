/**
 * 💰 รายได้จริงของ 1 ออเดอร์ — GET /api/platform-orders/income?id=<order>[&fresh=1] (สิทธิ์ platform_orders.view)
 * หน้ารายละเอียดออเดอร์แบบ Zort (เจ้าของเลือก 2026-11-23 ข้อ 3): ผู้ซื้อจ่าย · ส่วนลด · ค่าธรรมเนียม · เงินที่ร้านได้
 *   Shopee = v2.payment.get_escrow_detail (lib/shopee shopeeGetEscrowDetail) · จำผลไว้ใน raw.shopee_income 6 ชม. (ลดการเรียก Shopee)
 *   Lazada / TikTok / ช่องทางอื่น = ยังไม่รองรับ (บอกเหตุผล)
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { shopeeErrorText, shopeeGetEscrowDetail, type ShopeeIncome } from "@/lib/shopee";
import { getPlatformId, shopeeTokenOrReason } from "../../shopee/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_MS = 6 * 3600_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const id = (sp.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "ไม่ได้ระบุออเดอร์" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data } = await admin.from("platform_orders").select("id, platform_id, brand_id, external_order_id, source, raw").eq("id", id).maybeSingle();
  const o = data as { id: string; platform_id: string | null; brand_id: string | null; external_order_id: string | null; source: string | null; raw: Record<string, unknown> | null } | null;
  if (!o) return NextResponse.json({ ok: false, error: "ไม่พบออเดอร์" }, { status: 404 });

  const spId = await getPlatformId(admin, "shopee");
  if (!spId || o.platform_id !== spId || !o.brand_id || !o.external_order_id) {
    return NextResponse.json({ ok: true, supported: false, reason: "รายได้จริงต่อออเดอร์ตอนนี้ดึงได้เฉพาะ Shopee (Lazada / TikTok ตามมาทีหลัง)" });
  }
  const cached = o.raw?.shopee_income as (ShopeeIncome & { at?: string }) | undefined;
  if (cached?.at && sp.get("fresh") !== "1" && Date.now() - Date.parse(cached.at) < CACHE_MS) {
    return NextResponse.json({ ok: true, supported: true, income: cached, cached: true });
  }
  const tok = await shopeeTokenOrReason(admin, o.brand_id, spId, null);
  if (!tok.ok) return NextResponse.json({ ok: true, supported: false, reason: tok.reason, ...(cached ? { income: cached } : {}) });
  try {
    const income = await shopeeGetEscrowDetail(tok.accessToken, tok.shopId, o.external_order_id);
    const saved = { ...income, at: new Date().toISOString() };
    await admin.from("platform_orders").update({ raw: { ...(o.raw ?? {}), shopee_income: saved } }).eq("id", o.id);
    return NextResponse.json({ ok: true, supported: true, income: saved });
  } catch (e) {
    return NextResponse.json({ ok: true, supported: true, error: shopeeErrorText(e), ...(cached ? { income: cached } : {}) });
  }
}
