/**
 * แท็บ "คนเข้าร้าน" ของหน้าภาพรวมการตลาด — /api/marketing/traffic (สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 4 · แบบ A + ข้อ 1-4)
 * GET ?from=&to=&brand_id=
 *   → kpi (คนดู · กดถูกใจใหม่ · รีวิวใหม่ · อัตราซื้อ · ดาวเฉลี่ย) · funnel (เห็นโฆษณา → คลิก → เข้าดูสินค้า → ซื้อ) · daily · items (+ป้าย) · lowRated · dataStart
 * ข้อมูล: marketing_item_stats (ยอดสะสม เก็บทุกคืนโดย /api/cron/marketing-traffic) · marketing_ads_daily (Shopee ระดับร้าน)
 *   · ชิ้นที่ขาย = ออเดอร์ Shopee ที่นับเป็นยอดขาย (platform_order_items.raw.item_id) — ไม่ใช้ยอดขายสะสมของ Shopee
 * สูตร = lib/marketing-traffic-calc (pure + เทสต์)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { r2ImageUrl } from "@/lib/r2-image";
import { countsAsSale } from "@/lib/platform-order-status";
import { loadPlatformOrders } from "@/lib/platform-sales-load";
import { bkkYmd, monthToDate, shiftYmd } from "@/lib/platform-dashboard-calc";
import { dailyDeltas, flagItems } from "@/lib/marketing-traffic-calc";
import { loadItemSnaps, loadListingNames } from "@/lib/marketing-traffic-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

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
    const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "shopee").maybeSingle();
    const spId = (pf as { id?: string } | null)?.id ?? null;
    const [snaps, firstRow, adsRows, orders] = await Promise.all([
      loadItemSnaps(admin, { fromYmd: from, toYmd: to, brandId }),
      admin.from("marketing_item_stats").select("date").eq("platform", "shopee").order("date", { ascending: true }).limit(1).maybeSingle(),
      fetchAllPages<{ date: string; impressions: number; clicks: number }>((a, b) => {
        let q = admin.from("marketing_ads_daily").select("date, impressions, clicks").eq("platform", "shopee").eq("level", "shop").gte("date", from).lte("date", to);
        if (brandId) q = q.eq("brand_id", brandId);
        return q.order("id", { ascending: true }).range(a, b);
      }),
      spId ? loadPlatformOrders(admin, { platformId: spId, brandId, fromYmd: from, toYmd: to }) : Promise.resolve([]),
    ]);
    const dataStart = (firstRow.data as { date?: string } | null)?.date ?? null;

    // ── ยอดรายวันต่อสินค้า (เฉพาะวันในช่วง) ──
    const days = dailyDeltas(snaps).filter((d) => d.date >= from && d.date <= to);
    const viewDays = [...new Set(days.map((d) => d.date))].sort();

    // ── ชิ้นที่ขายต่อสินค้า (ออเดอร์ Shopee ที่นับเป็นยอดขาย · เฉพาะวันที่มีข้อมูลคนดู เพื่อให้อัตราซื้อเทียบกันได้) ──
    const viewDaySet = new Set(viewDays);
    const saleOrders = orders.filter(countsAsSale).filter((o) => viewDaySet.has(bkkYmd(o.ordered_at ?? null) ?? ""));
    const unitsByItem = new Map<string, number>();
    const ids = saleOrders.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 200) {
      const got = await fetchAllPages<{ qty: number | null; item_id: string | null }>((a, b) =>
        admin.from("platform_order_items").select("qty, item_id:raw->>item_id").in("order_id", ids.slice(i, i + 200)).order("id", { ascending: true }).range(a, b));
      for (const r of got) if (r.item_id) unitsByItem.set(String(r.item_id), (unitsByItem.get(String(r.item_id)) ?? 0) + (Number(r.qty) || 0));
    }

    // ── รวมต่อสินค้า ──
    const agg = new Map<string, { item_id: string; views: number; likes: number; newReviews: number }>();
    for (const d of days) { const g = agg.get(d.item_id) ?? { item_id: d.item_id, views: 0, likes: 0, newReviews: 0 }; g.views += d.views; g.likes += d.likes; g.newReviews += d.comments; agg.set(d.item_id, g); }
    const lastDate = snaps.reduce((m, s) => (s.date > m ? s.date : m), "");
    const latest = new Map(snaps.filter((s) => s.date === lastDate).map((s) => [s.item_id, s]));
    for (const id of unitsByItem.keys()) if (!agg.has(id) && latest.has(id)) agg.set(id, { item_id: id, views: 0, likes: 0, newReviews: 0 });
    const flagged = flagItems([...agg.values()].map((g) => ({ ...g, units: unitsByItem.get(g.item_id) ?? 0, rating: latest.get(g.item_id)?.rating ?? null })));
    const names = await loadListingNames(admin, flagged.map((r) => r.item_id));
    // รูป + รหัสรุ่นจากรุ่นที่จับคู่
    const parentIds = [...new Set([...names.values()].map((x) => x.parentId).filter((x): x is string => !!x))];
    const parentInfo = new Map<string, { code: string; image: string | null }>();
    for (let i = 0; i < parentIds.length; i += 200) {
      const { data } = await admin.from("parent_skus_v2").select("id, code, cover_image_r2_key").in("id", parentIds.slice(i, i + 200));
      for (const p of (data ?? []) as { id: string; code: string | null; cover_image_r2_key: string | null }[]) parentInfo.set(p.id, { code: p.code ?? "", image: r2ImageUrl(p.cover_image_r2_key, 120) });
    }
    const items = flagged.map((r) => {
      const nm = names.get(r.item_id); const p = nm?.parentId ? parentInfo.get(nm.parentId) : undefined;
      const snap = latest.get(r.item_id);
      return { ...r, title: nm?.title || `สินค้า ${r.item_id}`, code: p?.code ?? "", image: p?.image ?? null, parentId: nm?.parentId ?? null, totalReviews: snap?.comments ?? 0, totalLikes: snap?.likes ?? 0 };
    }).sort((a, b) => b.views - a.views || b.units - a.units);

    // ── KPI + ช่องทางลูกค้า ──
    const views = days.reduce((s, d) => s + d.views, 0);
    const units = [...unitsByItem.values()].reduce((s, u) => s + u, 0);
    const rated = [...latest.values()].filter((s) => s.rating != null && s.comments > 0);
    const ratingAvg = rated.length ? rated.reduce((s, x) => s + (x.rating as number) * x.comments, 0) / rated.reduce((s, x) => s + x.comments, 0) : null;
    const adsIn = adsRows.filter((r) => viewDaySet.has(r.date));
    const funnel = [
      { key: "impressions", label: "เห็นโฆษณา", value: adsIn.reduce((s, r) => s + (Number(r.impressions) || 0), 0) },
      { key: "clicks", label: "คลิกโฆษณา", value: adsIn.reduce((s, r) => s + (Number(r.clicks) || 0), 0) },
      { key: "views", label: "เข้าดูสินค้า", value: views },
      { key: "units", label: "ซื้อ (ชิ้น)", value: units },
    ];
    const prevFrom = shiftYmd(from, -viewDays.length), prevTo = shiftYmd(from, -1);
    const prevViews = viewDays.length ? dailyDeltas(await loadItemSnaps(admin, { fromYmd: prevFrom, toYmd: prevTo, brandId })).filter((d) => d.date >= prevFrom && d.date <= prevTo).reduce((s, d) => s + d.views, 0) : 0;
    const kpi = {
      views, prevViews, change: prevViews > 0 ? (views - prevViews) / prevViews : null,
      likes: days.reduce((s, d) => s + d.likes, 0), newReviews: days.reduce((s, d) => s + d.comments, 0),
      units, conv: views > 0 ? units / views : null, ratingAvg, days: viewDays.length,
    };
    const daily = viewDays.map((date) => ({ date, views: days.filter((d) => d.date === date).reduce((s, d) => s + d.views, 0) }));
    const lowRated = items.filter((i) => i.rating != null && i.rating < 4.5 && i.totalReviews >= 5).sort((a, b) => (a.rating as number) - (b.rating as number)).slice(0, 20);

    const notes: string[] = [];
    if (!dataStart) notes.push("ยังไม่เริ่มเก็บยอดคนดู — ระบบเก็บทุกเที่ยงคืน หรือกด “เก็บตอนนี้” เพื่อเริ่มวันแรก (ยอดรายวันขึ้นหลังเก็บครบ 2 วัน)");
    else if (!viewDays.length) notes.push(`เริ่มเก็บยอดเมื่อ ${dataStart} — ยอดรายวันขึ้นหลังเก็บครบ 2 วันติดกัน (Shopee ให้แค่ยอดสะสม ย้อนหลังไม่ได้)`);
    notes.push("เฉพาะ Shopee (Lazada / TikTok ไม่มีช่องทางให้ดึงยอดคนดู) · คนดู = ครั้งที่เปิดหน้าสินค้า (Shopee นับ) · อัตราซื้อ = ชิ้นที่ขาย ÷ คนดู ในวันที่มีข้อมูลคนดู");

    return NextResponse.json({ range: { from, to }, dataStart, kpi, funnel, daily, items, lowRated, notes, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/traffic]", e);
    return NextResponse.json({ error: "โหลดข้อมูลคนเข้าร้านไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
