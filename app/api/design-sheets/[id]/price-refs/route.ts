/**
 * 💰 ราคาอ้างอิงในแบรนด์เดียวกัน — ให้ "ตัวช่วยตั้งราคา" ในแท็บเสนอราคา (เจ้าของขอ 2026-11-09 "กดดูราคาของกระเป๋าใบอื่นใน brand นี้")
 *   GET /api/design-sheets/[id]/price-refs
 *   quotes = ช่องเสนอราคาของใบงานอื่นที่แบรนด์เดียวกัน (design_sheet_quotes: price = ตีราคาตอนเสนอ · offered_price = ราคาที่เสนอ) → คิด % บวกได้
 *   skus   = ราคาป้าย (skus_v2.list_price) ของรุ่นสินค้าในแบรนด์ รวมต่อรุ่น (ช่วงราคา) — ต้นทุนในรหัสสินค้าแทบว่าง เลยเทียบแค่ราคาขาย
 *   สิทธิ์: เห็นต้นทุน (products.cost.view) · อ่านอย่างเดียว · ใบงานไม่มีแบรนด์ = คืนว่าง
 *   ของกลาง: guardApi · fetchAllPages (PostgREST ตัด 1,000 แถว) · lib/quote-pricing (ชนิดข้อมูล)
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { fetchAllPages } from "@/lib/fetch-all";
import type { BrandQuoteRef, BrandSkuRef } from "@/lib/quote-pricing";

export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const MAX_QUOTES = 400;
const chunks = <T,>(xs: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

type SheetRow = { id: string; code: string | null; name: string | null };
type QuoteRow = { sheet_id: string; parent_code: string | null; qty: number | null; price: number | null; offered_price: number | null; status: string | null; quote_date: string | null };
type SkuParent = { code: string | null; name_th: string | null; sku_name: string | null; is_active: boolean | null };
// embed แบบหลายต่อหนึ่ง ได้ object จริง แต่ชนิดข้อมูลของ supabase-js เดาเป็น array → รับได้ทั้งสองแบบ
type SkuRow = { parent_sku_id: string; list_price: number | null; parent: SkuParent | SkuParent[] | null };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, COST_PERM); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "รหัสใบงานไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const { data: sheet } = await admin.from("design_sheets").select("id, brand_id").eq("id", id).maybeSingle();
    if (!sheet) return NextResponse.json({ error: "ไม่พบใบงาน" }, { status: 404 });
    const brandId = (sheet as { brand_id: string | null }).brand_id;
    if (!brandId) return NextResponse.json({ brand: null, quotes: [], skus: [], error: null }, { headers: { "Cache-Control": "no-store" } });

    const [{ data: brand }, sheets, skuRows] = await Promise.all([
      admin.from("brands").select("id, name").eq("id", brandId).maybeSingle(),
      fetchAllPages<SheetRow>((from, to) => admin.from("design_sheets").select("id, code, name").eq("brand_id", brandId).neq("id", id).order("id").range(from, to), { maxRows: 5000 }),
      fetchAllPages<SkuRow>((from, to) => admin.from("skus_v2")
        .select("parent_sku_id, list_price, parent:parent_skus_v2!inner(code, name_th, sku_name, is_active, brand_id)")
        .eq("parent.brand_id", brandId).gt("list_price", 0).not("is_active", "is", false)
        .order("id").range(from, to), { maxRows: 10000 }),
    ]);

    // ช่องเสนอราคาของใบงานอื่นในแบรนด์ (มีทั้งตีราคาและราคาที่เสนอ ถึงคิด % ได้)
    const sheetById = new Map(sheets.map((s) => [s.id, s]));
    const quoteRows: QuoteRow[] = [];
    for (const ids of chunks([...sheetById.keys()], 150)) {
      const { data } = await admin.from("design_sheet_quotes").select("sheet_id, parent_code, qty, price, offered_price, status, quote_date")
        .in("sheet_id", ids).gt("price", 0).gt("offered_price", 0).order("quote_date", { ascending: false }).limit(MAX_QUOTES);
      quoteRows.push(...((data ?? []) as QuoteRow[]));
    }
    const quotes: BrandQuoteRef[] = quoteRows
      .sort((a, b) => String(b.quote_date ?? "").localeCompare(String(a.quote_date ?? "")))
      .slice(0, MAX_QUOTES)
      .map((q) => {
        const s = sheetById.get(q.sheet_id);
        return {
          sheet_id: q.sheet_id, sheet_code: s?.code ?? null, sheet_name: s?.name ?? null,
          parent_code: q.parent_code || null, qty: q.qty ?? null, cost: Number(q.price) || 0, offered: Number(q.offered_price) || 0,
          status: q.status ?? "pending", quote_date: q.quote_date ?? null,
        };
      });

    // ราคาป้ายรวมต่อรุ่น
    const byParent = new Map<string, BrandSkuRef>();
    for (const r of skuRows) {
      const par = Array.isArray(r.parent) ? r.parent[0] : r.parent;
      if (!par || par.is_active === false) continue;
      const v = Number(r.list_price) || 0;
      const cur = byParent.get(r.parent_sku_id);
      if (!cur) byParent.set(r.parent_sku_id, { code: par.code ?? "", name: par.name_th || par.sku_name || null, min: v, max: v, n: 1 });
      else { cur.min = Math.min(cur.min, v); cur.max = Math.max(cur.max, v); cur.n++; }
    }
    const skus = [...byParent.values()].sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({ brand: brand ? { id: String(brand.id), name: String(brand.name ?? "") } : null, quotes, skus, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "โหลดราคาอ้างอิงไม่สำเร็จ" }, { status: 500 });
  }
}
