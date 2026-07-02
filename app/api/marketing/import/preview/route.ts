import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { parseShopeeShopStats, parseShopeeFileName } from "@/lib/marketing/shopee-parser";
import type { OrderStatusKey } from "@/lib/marketing/mock-data";

export const dynamic = "force-dynamic";

// POST multipart/form-data { file, platform?, shop? } → พรีวิวข้อมูลที่อ่านได้ (ไม่บันทึก)
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
    parsed = await parseShopeeShopStats(await file.arrayBuffer(), { shop });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: "อ่านไฟล์ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)) },
      { status: 400 },
    );
  }

  const statuses = Object.keys(parsed.byStatus) as OrderStatusKey[];
  const counts = statuses.reduce(
    (acc, st) => {
      const s = parsed.byStatus[st]!;
      acc.daily += 1;
      acc.hourly += s.hourly.length;
      acc.products += s.products.length;
      return acc;
    },
    { daily: 0, hourly: 0, products: 0 },
  );

  return NextResponse.json({
    data: {
      file_name: file.name,
      shop: parsed.shop,
      platform: parsed.platform,
      date: parsed.date,
      period_start: fromName.periodStart,
      period_end: fromName.periodEnd,
      statuses,
      counts,
      warnings: parsed.warnings,
      byStatus: parsed.byStatus, // ส่งกลับให้หน้าใช้พรีวิว (ตัวเลขจริง)
    },
    error: null,
  });
}
