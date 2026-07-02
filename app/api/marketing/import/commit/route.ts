import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { parseMarketingFile } from "@/lib/marketing/parse-file";
import { parseShopeeFileName } from "@/lib/marketing/shopee-parser";
import type { OrderStatusKey } from "@/lib/marketing/mock-data";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "marketing.import.confirm");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ data: null, error: "ต้องเป็น multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ data: null, error: "ไม่พบไฟล์" }, { status: 400 });

  const fromName = parseShopeeFileName(file.name);
  const shopHint = (String(form.get("shop") ?? "") || fromName.shop || "").trim();

  let parsed;
  try {
    parsed = await parseMarketingFile(file, shopHint);
  } catch (e) {
    return NextResponse.json(
      { data: null, error: "อ่านไฟล์ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)) },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  /* ============================ ADS ============================ */
  if (parsed.kind === "ads") {
    const r = parsed.result;
    const shop = (r.shop || shopHint || "").trim();
    const ps = r.period_start;
    const pe = r.period_end;
    if (!ps || !pe || r.campaigns.length === 0) {
      return NextResponse.json({ data: null, error: "ไฟล์โฆษณานี้ไม่มีข้อมูล/ช่วงวันที่ที่อ่านได้" }, { status: 400 });
    }

    const { count: existing } = await admin
      .from("marketing_ads_campaign")
      .select("id", { count: "exact", head: true })
      .eq("platform", "shopee")
      .eq("shop", shop)
      .eq("period_start", ps)
      .eq("period_end", pe);
    const replaced = existing ?? 0;

    const { data: imp, error: impErr } = await admin
      .from("marketing_imports")
      .insert({
        platform: "shopee",
        shop,
        report_type: "ads",
        template_key: "shopee_ads_v1",
        source_type: "manual_excel",
        file_name: file.name,
        period_start: ps,
        period_end: pe,
        status: "imported",
        warnings: r.warnings,
        actor_user_id: user?.id ?? null,
        actor_name: user?.email ?? null,
      })
      .select("id")
      .single();
    if (impErr || !imp)
      return NextResponse.json({ data: null, error: "บันทึก import ไม่สำเร็จ: " + impErr?.message }, { status: 500 });
    const importId = imp.id as string;

    await admin
      .from("marketing_ads_campaign")
      .delete()
      .eq("platform", "shopee")
      .eq("shop", shop)
      .eq("period_start", ps)
      .eq("period_end", pe);

    const rows = r.campaigns.map((c) => ({
      import_id: importId,
      platform: "shopee",
      shop,
      period_start: ps,
      period_end: pe,
      campaign_name: c.campaign_name,
      status: c.status,
      ad_type: c.ad_type,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      add_to_cart: c.add_to_cart,
      orders: c.orders,
      direct_orders: c.direct_orders,
      conversion_rate: c.conversion_rate,
      cpa: c.cpa,
      items_sold: c.items_sold,
      sales: c.sales,
      direct_sales: c.direct_sales,
      spend: c.spend,
      roas: c.roas,
      direct_roas: c.direct_roas,
      acos: c.acos,
      product_impressions: c.product_impressions,
      product_clicks: c.product_clicks,
      voucher_amount: c.voucher_amount,
      vouchered_sales: c.vouchered_sales,
    }));
    const { error: insErr } = await admin.from("marketing_ads_campaign").insert(rows);
    const counts = { campaigns: insErr ? 0 : rows.length };
    await admin.from("marketing_imports").update({ row_counts: counts }).eq("id", importId);

    await writeAudit(admin, {
      action: "marketing.import",
      entityType: "marketing_imports",
      entityId: importId,
      actorId: user?.id ?? null,
      actorName: user?.email ?? null,
      metadata: { platform: "shopee", shop, report_type: "ads", period_start: ps, period_end: pe, file_name: file.name, counts, replaced },
    });

    if (insErr)
      return NextResponse.json({ data: { import_id: importId, counts, replaced }, error: "บันทึกแคมเปญไม่สำเร็จ: " + insErr.message }, { status: 207 });

    return NextResponse.json({
      data: { kind: "ads", import_id: importId, shop, period_start: ps, period_end: pe, counts, replaced, warnings: r.warnings },
      error: null,
    });
  }

  /* ============================ SALES ============================ */
  const r = parsed.result;
  const shop = (r.shop || shopHint || "").trim();
  const platform = "shopee";
  const date = r.date;
  const statuses = Object.keys(r.byStatus) as OrderStatusKey[];
  if (!date || statuses.length === 0) {
    return NextResponse.json({ data: null, error: "ไฟล์นี้ไม่มีข้อมูลยอดขายที่อ่านได้" }, { status: 400 });
  }

  const { count: existing } = await admin
    .from("marketing_sales_daily")
    .select("id", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("shop", shop)
    .eq("date", date);
  const replaced = existing ?? 0;

  const counts = { daily: 0, hourly: 0, products: 0 };

  const { data: imp, error: impErr } = await admin
    .from("marketing_imports")
    .insert({
      platform,
      shop,
      report_type: "sales",
      template_key: "shopee_shop_stats_v1",
      source_type: "manual_excel",
      file_name: file.name,
      period_start: fromName.periodStart,
      period_end: fromName.periodEnd,
      status: "imported",
      warnings: r.warnings,
      actor_user_id: user?.id ?? null,
      actor_name: user?.email ?? null,
    })
    .select("id")
    .single();
  if (impErr || !imp)
    return NextResponse.json({ data: null, error: "บันทึก import ไม่สำเร็จ: " + impErr?.message }, { status: 500 });
  const importId = imp.id as string;

  const scope = (tbl: string) =>
    admin.from(tbl).delete().eq("platform", platform).eq("shop", shop).eq("date", date);
  await Promise.all([scope("marketing_sales_daily"), scope("marketing_sales_hourly"), scope("marketing_product_daily")]);

  const dailyRows: Record<string, unknown>[] = [];
  const hourlyRows: Record<string, unknown>[] = [];
  const productRows: Record<string, unknown>[] = [];

  for (const st of statuses) {
    const s = r.byStatus[st]!;
    const d = s.daily;
    dailyRows.push({
      import_id: importId, platform, shop, order_status: st, date, source_type: "manual_excel",
      gross_sales: d.gross_sales, sales_excl_shopee_discount: d.sales_excl_shopee_discount, orders: d.orders,
      aov: d.aov, clicks: d.clicks, visitors: d.visitors, conversion_rate: d.conversion_rate,
      cancelled_orders: d.cancelled_orders, cancelled_sales: d.cancelled_sales, refund_orders: d.refund_orders,
      refund_sales: d.refund_sales, buyers: d.buyers, new_buyers: d.new_buyers, returning_buyers: d.returning_buyers,
      potential_buyers: d.potential_buyers, repeat_rate: d.repeat_rate,
      traffic_product_page: s.traffic.product_page, traffic_live: s.traffic.live, traffic_video: s.traffic.video,
      traffic_partner: s.traffic.partner, traffic_shopee_ads: s.traffic.shopee_ads,
    });
    for (const h of s.hourly)
      hourlyRows.push({ import_id: importId, platform, shop, order_status: st, date, hour: h.hour, gross_sales: h.gross_sales, orders: h.orders, clicks: h.clicks, visitors: h.visitors, conversion_rate: h.conversion_rate });
    for (const p of s.products)
      productRows.push({
        import_id: importId, platform, shop, order_status: st, date, marketplace_item_id: p.marketplace_item_id,
        product_name: p.product_name, product_status: p.product_status, internal_sku: null,
        sales_share: p.sales_share, sales: p.sales, impressions: p.impressions, clicks: p.clicks, orders: p.orders,
        units: p.units, ctr: p.ctr, conversion_rate: p.conversion_rate, aov: p.aov, buyers: p.buyers,
      });
  }

  const errs: string[] = [];
  {
    const { error } = await admin.from("marketing_sales_daily").insert(dailyRows);
    if (error) errs.push("daily: " + error.message);
    else counts.daily = dailyRows.length;
  }
  if (hourlyRows.length) {
    const { error } = await admin.from("marketing_sales_hourly").insert(hourlyRows);
    if (error) errs.push("hourly: " + error.message);
    else counts.hourly = hourlyRows.length;
  }
  if (productRows.length) {
    const { error } = await admin.from("marketing_product_daily").insert(productRows);
    if (error) errs.push("products: " + error.message);
    else counts.products = productRows.length;
  }

  await admin.from("marketing_imports").update({ row_counts: counts }).eq("id", importId);

  await writeAudit(admin, {
    action: "marketing.import",
    entityType: "marketing_imports",
    entityId: importId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { platform, shop, report_type: "sales", date, file_name: file.name, counts, replaced, warnings: r.warnings },
  });

  if (errs.length)
    return NextResponse.json({ data: { import_id: importId, counts, replaced }, error: "บันทึกบางส่วนไม่สำเร็จ: " + errs.join("; ") }, { status: 207 });

  return NextResponse.json({
    data: { kind: "sales", import_id: importId, platform, shop, date, counts, replaced, warnings: r.warnings },
    error: null,
  });
}
