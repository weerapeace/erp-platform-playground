import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { parseMarketingFile } from "@/lib/marketing/parse-file";
import { parseShopeeFileName } from "@/lib/marketing/shopee-parser";
import type { OrderStatusKey } from "@/lib/marketing/mock-data";

export const dynamic = "force-dynamic";

// POST multipart/form-data { file, shop? } → พรีวิวข้อมูลที่อ่านได้ (ไม่บันทึก) รองรับทั้งยอดขาย & โฆษณา
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "marketing.import.create");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ data: null, error: "ต้องเป็น multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ data: null, error: "ไม่พบไฟล์" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024)
    return NextResponse.json({ data: null, error: "ไฟล์ใหญ่เกิน 15MB" }, { status: 400 });

  const fromName = parseShopeeFileName(file.name);
  const shop = String(form.get("shop") ?? "") || fromName.shop;

  let parsed;
  try {
    parsed = await parseMarketingFile(file, shop);
  } catch (e) {
    return NextResponse.json(
      { data: null, error: "อ่านไฟล์ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)) },
      { status: 400 },
    );
  }

  if (parsed.kind === "ads") {
    const r = parsed.result;
    const totals = r.campaigns.reduce(
      (a, c) => {
        a.spend += c.spend;
        a.sales += c.sales;
        a.orders += c.orders;
        return a;
      },
      { spend: 0, sales: 0, orders: 0 },
    );
    return NextResponse.json({
      data: {
        kind: "ads",
        file_name: file.name,
        shop: r.shop,
        platform: r.platform,
        period_start: r.period_start,
        period_end: r.period_end,
        generated_at: r.generated_at,
        counts: { campaigns: r.campaigns.length },
        totals,
        warnings: r.warnings,
        campaigns: r.campaigns,
      },
      error: null,
    });
  }

  // sales
  const r = parsed.result;
  const statuses = Object.keys(r.byStatus) as OrderStatusKey[];
  const counts = statuses.reduce(
    (acc, st) => {
      const s = r.byStatus[st]!;
      acc.daily += 1;
      acc.hourly += s.hourly.length;
      acc.products += s.products.length;
      return acc;
    },
    { daily: 0, hourly: 0, products: 0 },
  );
  return NextResponse.json({
    data: {
      kind: "sales",
      file_name: file.name,
      shop: r.shop,
      platform: r.platform,
      date: r.date,
      period_start: fromName.periodStart,
      period_end: fromName.periodEnd,
      statuses,
      counts,
      warnings: r.warnings,
      byStatus: r.byStatus,
    },
    error: null,
  });
}
