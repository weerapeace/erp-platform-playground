// ทะเบียนของกลาง + ผลนับ "ใครใช้บ้าง" จากโค้ดจริง — ใช้กับหน้า /admin/plugins
// ทะเบียน = lib/shared-parts-registry.ts · ผลนับ = lib/shared-parts-usage.json (scripts/shared-parts-scan.mjs สร้างใหม่ทุกครั้งก่อน build)
// อ่านอย่างเดียว ไม่แตะฐานข้อมูล · ต้องมีสิทธิ์ plugins.view
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { SHARED_PARTS, buildPartRows, type SharedPartsUsage } from "@/lib/shared-parts-registry";
import usageJson from "@/lib/shared-parts-usage.json";

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "plugins.view");
  if (denied) return denied;
  const usage = usageJson as unknown as SharedPartsUsage;
  return NextResponse.json(
    {
      data: {
        rows: buildPartRows(SHARED_PARTS, usage),
        units: usage.units,
        totals: usage.totals,
        handMade: usage.handMade,
        generatedAt: usage.generatedAt,
        commit: usage.commit,
      },
      error: null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
