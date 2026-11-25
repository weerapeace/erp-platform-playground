/**
 * แท็บ "โปรโมชั่น" ของหน้าภาพรวมการตลาด — /api/marketing/promos (สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 6 · แบบ A + ข้อ 1 ดึงรายการโปร · 2 ผลของแต่ละโปร · 3 แยกโค้ดส่วนลดร้าน · 4 ส่วนลดที่ Shopee ช่วยออก)
 * GET ?from=&to=&brand_id=
 *   → kpi · promos (ช่วงที่เลือก + ที่กำลังจะเริ่ม 14 วัน · ผลเทียบ 7 วันก่อน · โปรซ้อน) · daily (ยอด + Shopee ช่วยออก) · discount (โค้ดร้าน/Shopee ช่วยออก)
 * ข้อมูล: marketing_promotions (เติมโดย /api/cron/marketing-promos) · ยอด = มูลค่าสินค้าออเดอร์ Shopee (lib/platform-dashboard-calc)
 *   · ส่วนลด = รายได้ต่อออเดอร์ raw.shopee_income (lib/marketing-fees-server · รอบ 2) · สูตร = lib/marketing-promos-calc
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { countsAsSale } from "@/lib/platform-order-status";
import { loadOrderItems, loadPlatformOrders } from "@/lib/platform-sales-load";
import { bkkYmd, itemValueByOrder, monthToDate, orderValue, shiftYmd } from "@/lib/platform-dashboard-calc";
import { loadOrderIncome } from "@/lib/marketing-fees-server";
import { discountSplit, overlapCount, promoEffect, voucherCostEstimate } from "@/lib/marketing-promos-calc";
import type { PromoRow } from "@/lib/shopee-promos";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const bkkStart = (d: string) => new Date(Date.parse(`${d}T00:00:00+07:00`)).toISOString();
type DbPromo = PromoRow & { brand_id: string | null; updated_at: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const today = bkkYmd(Date.now()) as string;
  const brandId = (sp.get("brand_id") ?? "").trim() || null;
  let from = (sp.get("from") ?? "").trim(); let to = (sp.get("to") ?? "").trim();
  if (!isYmd(from)) from = monthToDate(today).from;
  if (!isYmd(to) || to > today) to = today;
  if (from > to) from = to;

  try {
    const [{ data: pf }, { data: br }] = await Promise.all([
      admin.from("erp_platforms").select("id").eq("code", "shopee").maybeSingle(),
      admin.from("brands").select("id, name"),
    ]);
    const spId = (pf as { id?: string } | null)?.id ?? null;
    const brandName = new Map(((br ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));

    // ── โปรที่ซ้อนกับช่วง + ที่กำลังจะเริ่มใน 14 วัน ──
    const horizon = bkkStart(shiftYmd(today, 15));
    const promos = await fetchAllPages<DbPromo>((a, b) => {
      let q = admin.from("marketing_promotions").select("kind, promo_id, name, code, status, start_at, end_at, usage_quantity, current_usage, discount_amount, percentage, reward_type, purpose, item_count, remind_count, click_count, brand_id, updated_at")
        .eq("platform", "shopee").lt("start_at", horizon).or(`end_at.is.null,end_at.gte.${bkkStart(from)}`);
      if (brandId) q = q.eq("brand_id", brandId);
      return q.order("start_at", { ascending: false }).range(a, b);
    });
    // ไม่เอาแฟลชเซลที่ลบแล้ว/ไม่มีสินค้า (ช่วงเวลาคัดจากคำถามแล้ว: ซ้อนช่วงที่เลือก หรือกำลังจะเริ่มใน 14 วัน)
    const visible = promos.filter((p) => p.status !== "deleted" && (p.kind !== "flash_sale" || (p.item_count ?? 0) > 0));

    // ── ยอดรายวันต่อแบรนด์ (Shopee) ตั้งแต่ก่อนโปรแรก 8 วัน ──
    const earliest = visible.reduce((m, p) => { const d = p.start_at ? bkkYmd(p.start_at) ?? m : m; return d < m ? d : m; }, from);
    const winFrom = shiftYmd(earliest < shiftYmd(today, -120) ? shiftYmd(today, -120) : earliest, -8);
    const orders = spId ? (await loadPlatformOrders(admin, { platformId: spId, brandId, fromYmd: winFrom })).filter(countsAsSale) : [];
    const items = await loadOrderItems(admin, orders.map((o) => o.id));
    const valBy = itemValueByOrder(items);
    const dailyByBrand = new Map<string, Map<string, number>>();
    const dailyAll = new Map<string, number>();
    for (const o of orders) {
      const d = bkkYmd(o.ordered_at ?? null); if (!d) continue;
      const v = orderValue(o, valBy);
      dailyAll.set(d, (dailyAll.get(d) ?? 0) + v);
      const b = brandId ?? o.brand_id ?? "";
      const m = dailyByBrand.get(b) ?? new Map<string, number>();
      m.set(d, (m.get(d) ?? 0) + v); dailyByBrand.set(b, m);
    }

    const rows = visible.map((p) => {
      const eff = promoEffect(p, dailyByBrand.get(p.brand_id ?? "") ?? dailyAll, today);
      return {
        ...p, brand_name: p.brand_id ? brandName.get(p.brand_id) ?? "" : "", ...eff,
        overlaps: overlapCount(p, visible), usagePct: p.usage_quantity ? (p.current_usage ?? 0) / p.usage_quantity : null,
        costEstimate: p.kind === "voucher" ? voucherCostEstimate(p) : null,
      };
    }).sort((a, b) => (b.start_at ?? "").localeCompare(a.start_at ?? ""));

    // ── ส่วนลด: โค้ดร้าน (เฉพาะใบที่แยกแล้ว) · Shopee ช่วยออก ──
    const inRange = orders.filter((o) => { const d = bkkYmd(o.ordered_at ?? null); return !!d && d >= from && d <= to; });
    const incomes = await loadOrderIncome(admin, inRange.map((o) => o.id));
    const known = inRange.map((o) => incomes.get(o.id)).filter((x): x is NonNullable<typeof x> => !!x && Array.isArray(x.lines) && x.lines.length > 0);
    const split = discountSplit(known as { fmt?: number; lines: { key: string; amount: number }[] }[]);
    const salesRange = inRange.reduce((s, o) => s + orderValue(o, valBy), 0);
    const salesKnown = inRange.filter((o) => incomes.get(o.id)?.lines?.length).reduce((s, o) => s + orderValue(o, valBy), 0);
    const salesV2 = inRange.filter((o) => (incomes.get(o.id) as { fmt?: number } | undefined)?.fmt === 2).reduce((s, o) => s + orderValue(o, valBy), 0);

    const fundedByDay = new Map<string, number>();
    for (const o of inRange) {
      const inc = incomes.get(o.id); const d = bkkYmd(o.ordered_at ?? null); if (!inc || !d) continue;
      fundedByDay.set(d, (fundedByDay.get(d) ?? 0) + (inc.lines.find((l) => l.key === "shopee_discount")?.amount ?? 0));
    }
    const daily: { date: string; sales: number; shopeeFunded: number }[] = [];
    for (let d = from; d <= to; d = shiftYmd(d, 1)) daily.push({ date: d, sales: (brandId ? dailyByBrand.get(brandId) : dailyAll)?.get(d) ?? 0, shopeeFunded: fundedByDay.get(d) ?? 0 });

    const inPeriod = rows.filter((r) => r.effect !== "upcoming");
    const kpi = {
      count: inPeriod.length,
      byKind: { voucher: inPeriod.filter((r) => r.kind === "voucher").length, discount: inPeriod.filter((r) => r.kind === "discount").length, flash_sale: inPeriod.filter((r) => r.kind === "flash_sale").length },
      voucherUses: inPeriod.filter((r) => r.kind === "voucher").reduce((s, r) => s + (r.current_usage ?? 0), 0),
      voucherQuota: inPeriod.filter((r) => r.kind === "voucher").reduce((s, r) => s + (r.usage_quantity ?? 0), 0),
      sellerVoucher: split.sellerVoucher, voucherCovered: split.voucherCovered, sellerVoucherPct: salesV2 > 0 ? split.sellerVoucher / salesV2 : null,
      shopeeFunded: split.shopeeFunded, shopeeFundedPct: salesKnown > 0 ? split.shopeeFunded / salesKnown : null, incomeOrders: split.orders, orders: inRange.length, sales: salesRange,
      worked: inPeriod.filter((r) => r.effect === "worked").length, failed: inPeriod.filter((r) => r.effect === "failed").length,
    };
    const { data: lastSync } = await admin.from("marketing_promotions").select("updated_at").eq("platform", "shopee").order("updated_at", { ascending: false }).limit(1).maybeSingle();

    const notes = [
      "ผลของโปร = ยอดเฉลี่ยต่อวันช่วงโปร เทียบ 7 วันก่อนเริ่ม (ยอดของร้านนั้นบน Shopee) · ได้ผล ≥ +15% · ไม่ได้ผล ≤ −10% · โปรยาวเกิน 31 วัน = ลดตลอด ไม่วัดผล",
      "ถ้ามีโปรอื่นซ้อนช่วงเดียวกัน แยกไม่ได้ว่าตัวไหนทำให้ขายดี — ดูคอลัมน์ “ซ้อน”",
      `โค้ดส่วนลดจากร้าน: แยกได้ ${split.voucherCovered.toLocaleString("th-TH")} จาก ${inRange.length.toLocaleString("th-TH")} ใบ (ใบใหม่แยกเอง · ใบเก่ายังรวมกับส่วนลดราคาปกติ)`,
      "เฉพาะ Shopee — Lazada / TikTok ยังไม่ดึงรายการโปร",
    ];
    if (!promos.length) notes.unshift("ยังไม่มีรายการโปร — ตัวดึงทำงานทุกเช้า 08:50 หรือกด “ดึงตอนนี้”");

    return NextResponse.json({ range: { from, to }, today, kpi, promos: rows, daily, lastSync: (lastSync as { updated_at?: string } | null)?.updated_at ?? null, notes, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/promos]", e);
    return NextResponse.json({ error: "โหลดข้อมูลโปรโมชั่นไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
