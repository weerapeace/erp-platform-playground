import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { parseShopeeShopStats, parseShopeeFileName } from "@/lib/marketing/shopee-parser";
import type { OrderStatusKey } from "@/lib/marketing/mock-data";

export const dynamic = "force-dynamic";

// POST multipart/form-data { file, shop? } → บันทึกเข้า DB (แทนที่ข้อมูลวันเดิม) + audit
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
  const shop = (String(form.get("shop") ?? "") || fromName.shop || "").trim();
  const platform = "shopee";

  let parsed;
  try {
    parsed = await parseShopeeShopStats(await file.arrayBuffer(), { shop });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: "อ่านไฟล์ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)) },
      { status: 400 },
    );
  }

  const date = parsed.date;
  const statuses = Object.keys(parsed.byStatus) as OrderStatusKey[];
  if (!date || statuses.length === 0) {
    return NextResponse.json(
      { data: null, error: "ไฟล์นี้ไม่มีข้อมูลยอดขายที่อ่านได้" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  // นับของเดิมก่อน (เพื่อบอกว่า replace ไหม)
  const { count: existing } = await admin
    .from("marketing_sales_daily")
    .select("id", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("shop", shop)
    .eq("date", date);
  const replaced = existing ?? 0;

  const counts = { daily: 0, hourly: 0, products: 0 };

  // 1) import batch
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
      warnings: parsed.warnings,
      actor_user_id: user?.id ?? null,
      actor_name: user?.email ?? null,
    })
    .select("id")
    .single();
  if (impErr || !imp) {
    return NextResponse.json({ data: null, error: "บันทึก import ไม่สำเร็จ: " + impErr?.message }, { status: 500 });
  }
  const importId = imp.id as string;

  // 2) dedup: ลบข้อมูลวันเดิม (ทุกสถานะ) ก่อนใส่ใหม่
  const scope = (tbl: string) =>
    admin.from(tbl).delete().eq("platform", platform).eq("shop", shop).eq("date", date);
  await Promise.all([
    scope("marketing_sales_daily"),
    scope("marketing_sales_hourly"),
    scope("marketing_product_daily"),
  ]);

  // 3) build rows
  const dailyRows: Record<string, unknown>[] = [];
  const hourlyRows: Record<string, unknown>[] = [];
  const productRows: Record<string, unknown>[] = [];

  for (const st of statuses) {
    const s = parsed.byStatus[st]!;
    const d = s.daily;
    dailyRows.push({
      import_id: importId,
      platform,
      shop,
      order_status: st,
      date,
      source_type: "manual_excel",
      gross_sales: d.gross_sales,
      sales_excl_shopee_discount: d.sales_excl_shopee_discount,
      orders: d.orders,
      aov: d.aov,
      clicks: d.clicks,
      visitors: d.visitors,
      conversion_rate: d.conversion_rate,
      cancelled_orders: d.cancelled_orders,
      cancelled_sales: d.cancelled_sales,
      refund_orders: d.refund_orders,
      refund_sales: d.refund_sales,
      buyers: d.buyers,
      new_buyers: d.new_buyers,
      returning_buyers: d.returning_buyers,
      potential_buyers: d.potential_buyers,
      repeat_rate: d.repeat_rate,
      traffic_product_page: s.traffic.product_page,
      traffic_live: s.traffic.live,
      traffic_video: s.traffic.video,
      traffic_partner: s.traffic.partner,
      traffic_shopee_ads: s.traffic.shopee_ads,
    });
    for (const h of s.hourly) {
      hourlyRows.push({
        import_id: importId,
        platform,
        shop,
        order_status: st,
        date,
        hour: h.hour,
        gross_sales: h.gross_sales,
        orders: h.orders,
        clicks: h.clicks,
        visitors: h.visitors,
        conversion_rate: h.conversion_rate,
      });
    }
    for (const p of s.products) {
      productRows.push({
        import_id: importId,
        platform,
        shop,
        order_status: st,
        date,
        marketplace_item_id: p.marketplace_item_id,
        product_name: p.product_name,
        product_status: p.product_status,
        internal_sku: null,
        sales_share: p.sales_share,
        sales: p.sales,
        impressions: p.impressions,
        clicks: p.clicks,
        orders: p.orders,
        units: p.units,
        ctr: p.ctr,
        conversion_rate: p.conversion_rate,
        aov: p.aov,
        buyers: p.buyers,
      });
    }
  }

  // 4) insert
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

  // 5) audit
  await writeAudit(admin, {
    action: "marketing.import",
    entityType: "marketing_imports",
    entityId: importId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { platform, shop, date, file_name: file.name, counts, replaced, warnings: parsed.warnings },
  });

  if (errs.length) {
    return NextResponse.json(
      { data: { import_id: importId, counts, replaced }, error: "บันทึกบางส่วนไม่สำเร็จ: " + errs.join("; ") },
      { status: 207 },
    );
  }

  return NextResponse.json({
    data: { import_id: importId, platform, shop, date, counts, replaced, warnings: parsed.warnings },
    error: null,
  });
}
