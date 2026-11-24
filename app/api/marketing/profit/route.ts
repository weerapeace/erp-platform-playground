/**
 * ค่าธรรมเนียม + กำไร — /api/marketing/profit (แท็บ "ค่าธรรมเนียม" และ "กำไร" ของ /marketing/dashboard · สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 2 · แบบ A 2 แท็บแยก + ข้อเสนอ 1, 2, 4)
 * GET ?from=&to=&platform_id=&brand_id=
 *   → fees: แยกช่องทาง (ยอด · ค่าธรรมเนียมจริง · % · แยกหมวด · เงินเข้าร้าน · ดึงแล้วกี่ใบ) + ค่าธรรมเนียมรายวัน
 *   → profit (เฉพาะคนมีสิทธิ์ products.cost.view · ไม่มี = restricted): กำไรต่อสินค้า + ความครอบคลุมต้นทุน + ขายดีแต่ยังไม่มีต้นทุน
 * ต้นทุนต่อชิ้น = skus_v2.standard_price (ราคาซื้อ) → ไม่มี = parent_skus_v2.product_cost · ไม่มีทั้งคู่ = ไม่คิดกำไร (ไม่เดา)
 * ค่าธรรมเนียมต่อสินค้า = มูลค่าบรรทัด × (ค่าธรรมเนียมจริงของใบนั้น ÷ มูลค่าใบ) · ใบที่ยังไม่รู้ = % เฉลี่ยของช่องทาง
 * ข้อมูลค่าธรรมเนียม = lib/marketing-fees-server (เติมโดย /api/cron/platform-fees) · สูตร = lib/marketing-profit-calc
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { r2ImageUrl } from "@/lib/r2-image";
import { bkkYmd, monthToDate, orderValue } from "@/lib/platform-dashboard-calc";
import { FEE_PLATFORMS, loadFeeContext } from "@/lib/marketing-fees-server";
import { FEE_CATS, incomeKnown, missingCostByParent, orderFees, profitRows, type ProfitInput } from "@/lib/marketing-profit-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const today = bkkYmd(Date.now()) as string;
  const platformId = (sp.get("platform_id") ?? "").trim() || null;
  const brandId = (sp.get("brand_id") ?? "").trim() || null;
  let from = (sp.get("from") ?? "").trim(); let to = (sp.get("to") ?? "").trim();
  if (!isYmd(from)) from = monthToDate(today).from;
  if (!isYmd(to) || to > today) to = today;
  if (from > to) from = to;

  try {
    const costOk = await apiCan(request, COST_PERM);
    const { data: pf } = await admin.from("erp_platforms").select("id, code, name_th, icon_key");
    const platforms = ((pf ?? []) as { id: string; code: string; name_th: string | null; icon_key: string | null }[]);
    const ctx = await loadFeeContext(admin, { fromYmd: from, toYmd: to, platformId, brandId }, new Map(platforms.map((p) => [p.id, p.code])));
    const val = (id: string, total: number | null) => orderValue({ id, total }, ctx.valByOrder);
    const pctOf = new Map(ctx.summary.map((s) => [s.platform, s.pct]));

    // ── ค่าธรรมเนียมแยกช่องทาง ──
    const fees = ctx.summary.map((s) => {
      const p = platforms.find((x) => x.code === s.platform);
      return { ...s, name_th: p?.name_th ?? s.platform, icon_key: p?.icon_key ?? null, supported: (FEE_PLATFORMS as readonly string[]).includes(s.platform) };
    });
    const supported = fees.filter((f) => f.supported);
    const tot = {
      sales: fees.reduce((a, f) => a + f.sales, 0),
      salesSupported: supported.reduce((a, f) => a + f.sales, 0),
      salesCovered: supported.reduce((a, f) => a + f.salesCovered, 0),
      fee: supported.reduce((a, f) => a + f.fee, 0),
      net: supported.reduce((a, f) => a + f.net, 0),
      orders: supported.reduce((a, f) => a + f.orders, 0),
      covered: supported.reduce((a, f) => a + f.covered, 0),
      estFeeAll: supported.reduce((a, f) => a + (f.estFeeAll ?? 0), 0),
    };
    const totals = { ...tot, pct: tot.salesCovered > 0 ? tot.fee / tot.salesCovered : null };

    // ค่าธรรมเนียมรายวัน (เฉพาะใบที่รู้แล้ว)
    const dailyMap = new Map<string, { date: string; fee: number; sales: number }>();
    for (const o of ctx.orders) {
      const inc = ctx.income.get(o.id);
      if (!incomeKnown(inc)) continue;
      const d = bkkYmd(o.ordered_at ?? null); if (!d) continue;
      const g = dailyMap.get(d) ?? { date: d, fee: 0, sales: 0 };
      g.fee += orderFees(ctx.codeOf(o), inc).total; g.sales += val(o.id, o.total);
      dailyMap.set(d, g);
    }
    const feeDaily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    const base = { range: { from, to }, cats: FEE_CATS, fees, totals, feeDaily, error: null };
    if (!costOk) return NextResponse.json({ ...base, profit: null, restricted: true }, { headers: { "Cache-Control": "no-store" } });

    // ── กำไรต่อสินค้า ──
    const ratioByOrder = new Map<string, number>();
    for (const o of ctx.orders) {
      const v = val(o.id, o.total); const inc = ctx.income.get(o.id);
      const code = ctx.codeOf(o);
      ratioByOrder.set(o.id, incomeKnown(inc) && v > 0 ? orderFees(code, inc).total / v : (pctOf.get(code) ?? 0));
    }
    type Agg = { key: string; sales: number; qty: number; fee: number };
    const agg = new Map<string, Agg>();
    let unmatchedSales = 0, unmatchedLines = 0;
    for (const it of ctx.items) {
      const lv = (Number(it.qty) || 0) * (Number(it.price) || 0);
      if (!it.matched_sku_id) { unmatchedSales += lv; unmatchedLines++; continue; }
      const g = agg.get(it.matched_sku_id) ?? { key: it.matched_sku_id, sales: 0, qty: 0, fee: 0 };
      g.sales += lv; g.qty += Number(it.qty) || 0; g.fee += lv * (ratioByOrder.get(it.order_id) ?? 0);
      agg.set(it.matched_sku_id, g);
    }
    const ids = [...agg.keys()];
    type Sku = { id: string; code: string | null; name_th: string | null; standard_price: number | null; cover_image_r2_key: string | null; parent_skus_v2: { id: string; code: string | null; name_th: string | null; product_cost: number | null; cover_image_r2_key: string | null } | { id: string; code: string | null; name_th: string | null; product_cost: number | null; cover_image_r2_key: string | null }[] | null };
    const skuById = new Map<string, Sku>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await admin.from("skus_v2").select("id, code, name_th, standard_price, cover_image_r2_key, parent_skus_v2 ( id, code, name_th, product_cost, cover_image_r2_key )").in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as unknown as Sku[]) skuById.set(r.id, r);
    }
    const images = new Map<string, string | null>();
    const inputs: ProfitInput[] = [...agg.values()].map((g) => {
      const s = skuById.get(g.key);
      const parent = Array.isArray(s?.parent_skus_v2) ? s?.parent_skus_v2[0] : s?.parent_skus_v2;
      const std = Number(s?.standard_price) || 0, pc = Number(parent?.product_cost) || 0;
      images.set(g.key, r2ImageUrl((s?.cover_image_r2_key || parent?.cover_image_r2_key) ?? null, 120));
      return {
        key: g.key, parentId: parent?.id ?? null, parentName: [parent?.code, parent?.name_th].filter(Boolean).join(" · "),
        code: s?.code ?? "", name: s?.name_th ?? s?.code ?? "—", sales: g.sales, qty: g.qty, fee: g.fee,
        unitCost: std > 0 ? std : pc > 0 ? pc : null,
      };
    });
    const pr = profitRows(inputs);
    const missing = missingCostByParent(pr.rows, 30);
    const profit = {
      ...pr,
      rows: pr.rows.sort((a, b) => b.sales - a.sales).map((r) => ({ ...r, image: images.get(r.key) ?? null })),
      missing: missing.map((m) => ({ ...m, href: m.parentId ? `/master/parent-skus?open=${encodeURIComponent(m.parentId)}` : null })),
      missingTop20Share: pr.sales > 0 ? missing.slice(0, 20).reduce((a, m) => a + m.sales, 0) / pr.sales : 0,
      unmatchedSales, unmatchedLines,
    };
    return NextResponse.json({ ...base, profit, restricted: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/profit]", e);
    return NextResponse.json({ error: "โหลดข้อมูลค่าธรรมเนียม/กำไรไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
