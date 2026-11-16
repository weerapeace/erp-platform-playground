/**
 * /api/app-changes/context — ศูนย์งานแก้แอป: ข้อมูลประกอบ (อ่านอย่างเดียว ไม่แตะ DB)
 *
 * GET ?path=/quotations → { page, parts: ของกลางที่หน้านี้ใช้, flow: กล่องแผนผังที่ผูกหน้านี้ }
 * GET ?part=data-table  → { part, pages: หน้าที่ใช้ของกลางตัวนี้ (แก้แล้วกระทบ) }
 * ตัวช่วย = lib/app-change.ts · ข้อมูลนับจากโค้ด = lib/shared-parts-usage.json
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { SHARED_PARTS } from "@/lib/shared-parts-registry";
import { FLOW_NODES } from "@/lib/flow-map";
import usage from "@/lib/shared-parts-usage.json";
import { normalizePagePath, partsForPage, pagesForPart, flowNodesForPage } from "@/lib/app-change";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "report.create");
  if (guard) return guard;
  const sp = new URL(request.url).searchParams;
  const u = usage as never;

  const partKey = sp.get("part");
  if (partKey) {
    const p = SHARED_PARTS.find((x) => x.key === partKey);
    if (!p) return NextResponse.json({ error: "ไม่พบของกลางนี้" }, { status: 404 });
    return NextResponse.json({
      part: { key: p.key, label: p.label, what: p.what, category: p.category },
      pages: pagesForPart(p.key, SHARED_PARTS, u),
    });
  }

  const page = normalizePagePath(sp.get("path"));
  if (!page) return NextResponse.json({ error: "ต้องระบุหน้า (path)" }, { status: 400 });
  return NextResponse.json({
    page,
    parts: partsForPage(page, SHARED_PARTS, u),
    flow: flowNodesForPage(page, FLOW_NODES).map((r) => ({ ...r, label: FLOW_NODES[r.ref]?.label ?? r.ref })),
  });
}
