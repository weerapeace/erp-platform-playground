/**
 * SKU ของใบงานออกแบบที่อยู่เบื้องหลังใบเสนอราคา — ไว้ผูก SKU ในใบสั่งขาย (เจ้าของสั่ง 2026-11-19)
 *
 * GET /api/so-orders/sheet-skus?quote_ids=a,b
 * → { quote_sheets: {quote_id: [sheet_id]}, sheets: [{ id, code, name, sku_count }], skus: [{ id, code, name_th, color, list_price, image_url, sheet_id }], error }
 *   ใบเสนอราคา → design_sheet_quotations → ใบงาน → SKU ใต้ Parent ของใบ (parent_sku_code/s) + SKU ที่สร้างจากใบ (skus_v2.design_sheet_id)
 *   ใบงานที่ยังไม่มี SKU = sku_count 0 (หน้าจอขึ้นปุ่ม "สร้าง SKU ในใบงาน")
 * กติกาผูก: lib/so-sku-link
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { SKU_COVER_SELECT, coverUrl, resolveSkuCover } from "@/lib/sku-cover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SheetSkuOption = {
  id: string; code: string; name_th: string | null; color: string | null;
  list_price: number | null; image_url: string | null; sheet_id: string;
};
export type SheetOfQuote = { id: string; code: string | null; name: string | null; sku_count: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const ids = (new URL(request.url).searchParams.get("quote_ids") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s)).slice(0, 50);
  if (!ids.length) return NextResponse.json({ sheets: [], skus: [], quote_sheets: {}, error: null });
  const admin = supabaseAdmin();

  const { data: links } = await admin.from("design_sheet_quotations").select("design_sheet_id, quotation_id").in("quotation_id", ids);
  const linkRows = (links ?? []) as { design_sheet_id: string; quotation_id: string }[];
  const sheetIds = [...new Set(linkRows.map((r) => r.design_sheet_id))];
  if (!sheetIds.length) return NextResponse.json({ sheets: [], skus: [], quote_sheets: {}, error: null });
  const quoteSheets: Record<string, string[]> = {};
  for (const r of linkRows) (quoteSheets[r.quotation_id] ??= []).push(r.design_sheet_id);

  const { data: sheets } = await admin.from("design_sheets").select("id, code, name, parent_sku_code, parent_sku_codes").in("id", sheetIds);
  type SheetRow = { id: string; code: string | null; name: string | null; parent_sku_code: string | null; parent_sku_codes: string[] | null };
  const sheetRows = (sheets ?? []) as SheetRow[];
  const sheetOfParentCode = new Map<string, string>();
  for (const s of sheetRows) {
    for (const c of [s.parent_sku_code, ...(Array.isArray(s.parent_sku_codes) ? s.parent_sku_codes : [])]) if (c) sheetOfParentCode.set(String(c), s.id);
  }
  const parentSheet = new Map<string, string>();   // parent_sku_id → sheet id
  if (sheetOfParentCode.size) {
    const { data: parents } = await admin.from("parent_skus_v2").select("id, code").in("code", [...sheetOfParentCode.keys()]);
    for (const p of (parents ?? []) as { id: string; code: string }[]) parentSheet.set(p.id, sheetOfParentCode.get(p.code)!);
  }

  const SEL = `id, code, name_th, color, list_price, parent_sku_id, design_sheet_id, is_active, ${SKU_COVER_SELECT}`;
  const rows: Record<string, unknown>[] = [];
  if (parentSheet.size) {
    const { data } = await admin.from("skus_v2").select(SEL).in("parent_sku_id", [...parentSheet.keys()]).order("code");
    rows.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const { data: direct } = await admin.from("skus_v2").select(SEL).in("design_sheet_id", sheetIds).order("code");
  rows.push(...((direct ?? []) as Record<string, unknown>[]));

  const seen = new Set<string>();
  const skus: SheetSkuOption[] = [];
  for (const r of rows) {
    const id = String(r.id);
    if (seen.has(id) || r.is_active === false) continue;
    seen.add(id);
    const sheetId = (r.design_sheet_id as string | null) && sheetIds.includes(r.design_sheet_id as string)
      ? (r.design_sheet_id as string) : parentSheet.get(String(r.parent_sku_id)) ?? sheetIds[0];
    skus.push({
      id, code: String(r.code), name_th: (r.name_th as string) ?? null, color: (r.color as string) ?? null,
      list_price: r.list_price == null ? null : Number(r.list_price),
      image_url: coverUrl(resolveSkuCover(r).key), sheet_id: sheetId,
    });
  }
  const out: SheetOfQuote[] = sheetRows.map((s) => ({ id: s.id, code: s.code, name: s.name, sku_count: skus.filter((k) => k.sheet_id === s.id).length }));
  return NextResponse.json({ sheets: out, skus, quote_sheets: quoteSheets, error: null });
}
