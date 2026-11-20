/**
 * 📁 ไฟล์จากใบงานออกแบบที่ผูกกับ Parent SKU นี้ (เจ้าของขอ 2026-11-20 "ไฟล์ที่แนบในใบงาน ให้ Parent SKU ดึงไปด้วย")
 *
 * GET /api/product-drive/parent_skus_v2/[id]/sheets → { sheets: [{ id, code, name, folder_url, files }] }
 *   ใบงาน = design_sheets ที่ parent_sku_codes มีรหัสนี้ (หรือช่องเก่า parent_sku_code)
 *   อ่านไฟล์จากโฟลเดอร์ Drive ของใบงานสด ๆ (findDesignSheetFolder · ไม่สร้าง ไม่ก๊อป) — ดูอย่างเดียว
 *   ใบงานที่ยังไม่มีโฟลเดอร์/ไม่มีไฟล์ = ไม่ส่งมา
 * สิทธิ์: products.view · SKU ลูก (skus_v2) = คืนว่าง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { driveConfigured, driveListEntries } from "@/lib/google-drive";
import { isProductDriveEntity, loadProductDriveRow } from "@/lib/product-drive-server";
import { findDesignSheetFolder, type DesignSheetDriveRow } from "@/lib/design-sheet-drive-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

type Params = { params: Promise<{ entity: string; id: string }> };
export type ParentSheetFiles = { id: string; code: string | null; name: string | null; folder_url: string; files: Awaited<ReturnType<typeof driveListEntries>> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { entity, id } = await params;
  if (!isProductDriveEntity(entity)) return NextResponse.json({ error: "ไม่รองรับชนิดรายการนี้" }, { status: 400 });
  if (entity !== "parent_skus_v2" || !driveConfigured()) return NextResponse.json({ data: { sheets: [] }, error: null });
  const admin = supabaseAdmin();
  const row = await loadProductDriveRow(admin, entity, id);
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const code = (row.code ?? "").trim();
  if (!code) return NextResponse.json({ data: { sheets: [] }, error: null });

  const cols = "id, code, name, brand_id, drive_link";
  const [a, b] = await Promise.all([
    admin.from("design_sheets").select(cols).contains("parent_sku_codes", [code]).limit(20),
    admin.from("design_sheets").select(cols).eq("parent_sku_code", code).limit(20),
  ]);
  const byId = new Map<string, DesignSheetDriveRow>();
  for (const s of [...(a.data ?? []), ...(b.data ?? [])] as DesignSheetDriveRow[]) byId.set(s.id, s);

  const sheets: ParentSheetFiles[] = [];
  let failed = 0;
  await Promise.all([...byId.values()].map(async (s) => {
    try {
      const f = await findDesignSheetFolder(admin, s);
      if (!f) return;
      const files = (await driveListEntries(f.id)).filter((e) => !e.isFolder);
      if (files.length) sheets.push({ id: s.id, code: s.code, name: s.name, folder_url: f.url, files });
    } catch { failed++; }
  }));
  sheets.sort((x, y) => String(y.code ?? "").localeCompare(String(x.code ?? "")));
  return NextResponse.json({ data: { sheets }, error: failed ? `อ่านโฟลเดอร์ใบงานไม่ได้ ${failed} ใบ` : null });
}
