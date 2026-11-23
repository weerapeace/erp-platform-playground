/**
 * 💰 รายได้จริงของ 1 ออเดอร์ — GET /api/platform-orders/income?id=<order>[&fresh=1] (สิทธิ์ platform_orders.view)
 * หน้ารายละเอียดออเดอร์แบบ Zort (เจ้าของเลือก 2026-11-23 ข้อ 3): ผู้ซื้อจ่าย · ส่วนลด · ค่าธรรมเนียม · เงินที่ร้านได้
 *   Shopee = v2.payment.get_escrow_detail (lib/shopee shopeeGetEscrowDetail) · จำผลไว้ใน raw.shopee_income 6 ชม.
 *   Lazada = /finance/transaction/details/get (lib/lazada lazGetOrderTransactions → lib/lazada-orders lazIncomeOf) · จำใน raw.lazada_income
 *            ยังไม่ตัดรอบ (ไม่มีรายการ) = จำแค่ 1 ชม. แล้วถามใหม่ · 2026-11-23 เจ้าของกด "Do it here"
 *   TikTok / ช่องทางอื่น = ยังไม่รองรับ (บอกเหตุผล)
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { shopeeErrorText, shopeeGetEscrowDetail, type ShopeeIncome } from "@/lib/shopee";
import { lazErrorText, lazGetOrderTransactions } from "@/lib/lazada";
import { lazIncomeOf, type LazIncome } from "@/lib/lazada-orders";
import { getPlatformId, shopeeTokenOrReason } from "../../shopee/shared";
import { lazTokenOrReason } from "../../lazada/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const CACHE_MS = 6 * 3600_000;
const CACHE_EMPTY_MS = 3600_000;
const NOT_SETTLED = "Lazada ยังไม่ลงค่าธรรมเนียมของออเดอร์นี้ (มักลงหลังส่งสำเร็จและตัดรอบ) — กลับมาดูใหม่ภายหลัง";
type Row = { id: string; platform_id: string | null; brand_id: string | null; external_order_id: string | null; source: string | null; ordered_at: string | null; raw: Record<string, unknown> | null };

/** วันที่แบบ YYYY-MM-DD ตามเวลาไทย */
const bkkDate = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const id = (sp.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "ไม่ได้ระบุออเดอร์" }, { status: 400 });
  const fresh = sp.get("fresh") === "1";
  const admin = supabaseAdmin();
  const { data } = await admin.from("platform_orders").select("id, platform_id, brand_id, external_order_id, source, ordered_at, raw").eq("id", id).maybeSingle();
  const o = data as Row | null;
  if (!o) return NextResponse.json({ ok: false, error: "ไม่พบออเดอร์" }, { status: 404 });
  if (!o.brand_id || !o.external_order_id) return NextResponse.json({ ok: true, supported: false, reason: "ออเดอร์นี้ไม่ได้มาจากร้านค้าบนแพลตฟอร์ม" });
  const brandId = o.brand_id, orderNo = o.external_order_id;

  const [spId, lzId] = await Promise.all([getPlatformId(admin, "shopee"), getPlatformId(admin, "lazada")]);
  const save = async (key: string, value: Record<string, unknown>) => {
    await admin.from("platform_orders").update({ raw: { ...(o.raw ?? {}), [key]: value } }).eq("id", o.id);
  };

  // ── Shopee ──
  if (spId && o.platform_id === spId) {
    const cached = o.raw?.shopee_income as (ShopeeIncome & { at?: string }) | undefined;
    if (cached?.at && !fresh && Date.now() - Date.parse(cached.at) < CACHE_MS) return NextResponse.json({ ok: true, supported: true, income: cached, cached: true });
    const tok = await shopeeTokenOrReason(admin, brandId, spId, null);
    if (!tok.ok) return NextResponse.json({ ok: true, supported: false, reason: tok.reason, ...(cached ? { income: cached } : {}) });
    try {
      const saved = { ...(await shopeeGetEscrowDetail(tok.accessToken, tok.shopId, orderNo)), at: new Date().toISOString() };
      await save("shopee_income", saved);
      return NextResponse.json({ ok: true, supported: true, income: saved });
    } catch (e) {
      return NextResponse.json({ ok: true, supported: true, error: shopeeErrorText(e), ...(cached ? { income: cached } : {}) });
    }
  }

  // ── Lazada ──
  if (lzId && o.platform_id === lzId) {
    const cached = o.raw?.lazada_income as (LazIncome & { at?: string }) | undefined;
    const ttl = cached && cached.rows > 0 ? CACHE_MS : CACHE_EMPTY_MS;
    if (cached?.at && !fresh && Date.now() - Date.parse(cached.at) < ttl) {
      return NextResponse.json({ ok: true, supported: true, income: cached, cached: true, ...(cached.rows ? {} : { reason: NOT_SETTLED }) });
    }
    const tok = await lazTokenOrReason(admin, brandId, lzId, null);
    if (!tok.ok) return NextResponse.json({ ok: true, supported: false, reason: tok.reason, ...(cached ? { income: cached } : {}) });
    const ordered = o.ordered_at ? Date.parse(o.ordered_at) : Date.now() - 7 * 86_400_000;
    try {
      const rows = await lazGetOrderTransactions(tok.gateway, tok.accessToken, orderNo, bkkDate(ordered - 86_400_000), bkkDate(Date.now()));
      const saved = { ...lazIncomeOf(rows, orderNo), at: new Date().toISOString() };
      await save("lazada_income", saved);
      return NextResponse.json({ ok: true, supported: true, income: saved, ...(saved.rows ? {} : { reason: NOT_SETTLED }) });
    } catch (e) {
      console.warn("[platform-orders/income] lazada", orderNo, e instanceof Error ? e.message : e);
      return NextResponse.json({ ok: true, supported: true, error: lazErrorText(e), ...(cached ? { income: cached } : {}) });
    }
  }

  return NextResponse.json({ ok: true, supported: false, reason: "รายได้จริงต่อออเดอร์ตอนนี้ดึงได้เฉพาะ Shopee และ Lazada (TikTok ต้องเปิดสิทธิ์การเงินในแอป TikTok ก่อน)" });
}
