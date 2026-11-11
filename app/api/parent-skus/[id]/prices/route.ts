/**
 * /api/parent-skus/[id]/prices — ข้อมูลแท็บ "💰 ราคา" ของ Parent SKU (components/parent-price-tab)
 *   • SKU ลูก: ราคากลาง (list_price) · ราคาเต็ม (fake_price) · [มีสิทธิ์ต้นทุน] ราคาซื้อ (standard_price) · RMB
 *   • เว็บร้าน: ราคาเว็บต่อร้าน (store_listings.web_price · ว่าง = ใช้ราคากลาง)
 *   • ร้านแพลตฟอร์ม: ราคาต่อตัวเลือกจากข้อมูลที่ดึงจากร้าน (ของกลาง loadListingVariants — LINE/Lazada) · ร้านอื่น = ราคาเดียวของรายการ
 *   • [มีสิทธิ์ต้นทุน] ข้อมูลคิดต้นทุนต่อ SKU: สูตรผลิต (หลัก → ล่าสุด) วัตถุดิบ (lib/cost-inputs) ค่าแรงกลาง งานเหมา
 *     + ต้นทุนที่บันทึกไว้ (product_costings เฉพาะ SKU / ทั้งรุ่น) → หน้าเว็บคิดต่อด้วย deriveCost (lib/cost-calc)
 * อ่านอย่างเดียว · guardApi products.view · ต้นทุน = apiCan(products.cost.view) (lib/cost-access) ไม่มีสิทธิ์ = ไม่ส่งตัวเลขเลย
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { bomMaterialCost } from "@/lib/cost-inputs";
import { loadListingVariants } from "@/lib/platform-shop-view-server";
import { shopPay } from "@/lib/parent-prices";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown) => (v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const a = supabaseAdmin();
  const costOk = await apiCan(request, COST_PERM);

  const [{ data: parent }, { data: skuData, error: skuErr }, { data: listingData }, { data: webData }] = await Promise.all([
    a.from("parent_skus_v2").select("id, code").eq("id", id).maybeSingle(),
    a.from("skus_v2").select("id, code, name_th, color, color_th, cover_image_r2_key, is_active, list_price, fake_price, standard_price, rmb_cost")
      .eq("parent_sku_id", id).order("code"),
    a.from("platform_catalog_listings").select("id, platform_id, title, external_product_id, status, price").eq("matched_parent_sku_id", id),
    a.from("store_listings").select("id, shop_id, web_price").eq("parent_sku_id", id),
  ]);
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  if (skuErr) return NextResponse.json({ error: "โหลด SKU ลูกไม่สำเร็จ" }, { status: 500 });
  const parentCode = String((parent as Row).code ?? "");
  const skus = (skuData ?? []) as Row[];
  const codes = skus.map((s) => String(s.code)).filter(Boolean);
  const listings = ((listingData ?? []) as Row[]).filter((l) => l.status !== "removed");
  const webRows = (webData ?? []) as Row[];

  // ชื่อร้าน (แพลตฟอร์ม + เว็บ)
  const platformIds = [...new Set(listings.map((l) => String(l.platform_id)))];
  const shopIds = [...new Set(webRows.map((w) => String(w.shop_id ?? "")).filter(Boolean))];
  const [{ data: pfData }, { data: shopData }] = await Promise.all([
    platformIds.length ? a.from("erp_platforms").select("id, code, name_th, icon_key").in("id", platformIds) : Promise.resolve({ data: [] }),
    shopIds.length ? a.from("shops").select("id, name").in("id", shopIds) : Promise.resolve({ data: [] }),
  ]);
  const pf = new Map(((pfData ?? []) as Row[]).map((p) => [String(p.id), p]));
  const shopName = new Map(((shopData ?? []) as Row[]).map((s) => [String(s.id), String(s.name ?? "เว็บร้าน")]));

  // ราคาต่อตัวเลือกบนร้าน (ของกลาง — ข้อมูลที่ดึงจากร้านล่าสุด ไม่ยิงร้านสด)
  const shops = await Promise.all(listings.map(async (l) => {
    const p = pf.get(String(l.platform_id));
    const v = await loadListingVariants(a, String(l.id));
    const prices: Record<string, { price: number | null; sale_price: number | null; pay: number | null; label: string }> = {};
    for (const r of v.rows) {
      if (!r.erp_code || r.other_parent || prices[r.erp_code]) continue;
      prices[r.erp_code] = { price: r.price, sale_price: r.sale_price, pay: shopPay(r.price, r.sale_price), label: r.label };
    }
    return {
      listing_id: String(l.id), platform_code: String(p?.code ?? ""), platform_name: String(p?.name_th ?? "ร้าน"), icon_key: (p?.icon_key as string) ?? null,
      title: (l.title as string) ?? null, external_id: (l.external_product_id as string) ?? null,
      supported: v.supported, fetched: v.fetched, listing_price: numOrNull(l.price), prices,
    };
  }));

  // ข้อมูลคิดต้นทุน (เฉพาะคนมีสิทธิ์ต้นทุน)
  let costs: Record<string, unknown> | null = null;
  let saved: Row[] = [];
  if (costOk && codes.length) {
    const { data: bh } = await a.from("bom_headers").select("bom_code, product_sku, is_default, created_at")
      .in("product_sku", codes).eq("is_active", true);
    // สูตรที่ใช้คิด = สูตรหลัก → ล่าสุด (กฎเดียวกับ /api/product-costings)
    const bomOf = new Map<string, string>();
    for (const b of ((bh ?? []) as Row[]).sort((x, y) => (Number(!!y.is_default) - Number(!!x.is_default)) || String(y.created_at ?? "").localeCompare(String(x.created_at ?? "")))) {
      const sku = String(b.product_sku); if (!bomOf.has(sku)) bomOf.set(sku, String(b.bom_code));
    }
    const bomCodes = [...new Set(bomOf.values())];
    const [lineParts, laborParts, pieceParts, savedParts] = await Promise.all([
      Promise.all(chunk(bomCodes, 20).map((cs) => a.from("bom_lines").select("bom_code, component_sku, component_name, material_type, uom, qty")
        .in("bom_code", cs).eq("is_active", true).order("sequence", { ascending: true }))),
      Promise.all(chunk(bomCodes, 50).map((cs) => a.from("bom_labor_rates").select("bom_code, rate")
        .in("bom_code", cs).is("craftsman_id", null).eq("is_current", true).eq("is_active", true))),
      Promise.all(chunk(bomCodes, 50).map((cs) => a.from("bom_piecework_lines").select("bom_code, job_name, rate, qty_per")
        .in("bom_code", cs).eq("is_active", true).order("sequence", { ascending: true }))),
      Promise.all([
        a.from("product_costings").select("target_type, target_code, qty_basis, scenario, created_at").eq("is_current", true).eq("is_active", true)
          .eq("target_type", "parent").eq("target_code", parentCode),
        ...chunk(codes, 50).map((cs) => a.from("product_costings").select("target_type, target_code, qty_basis, scenario, created_at")
          .eq("is_current", true).eq("is_active", true).eq("target_type", "sku").in("target_code", cs)),
      ]),
    ]);
    const lines = lineParts.flatMap((r) => (r.data ?? []) as Row[]);
    const compCodes = [...new Set(lines.map((l) => String(l.component_sku ?? "")).filter(Boolean))];
    const stdParts = await Promise.all(chunk(compCodes, 100).map((cs) => a.from("skus_v2").select("code, standard_price").in("code", cs)));
    const std = new Map<string, number>();
    for (const r of stdParts.flatMap((p) => (p.data ?? []) as Row[])) std.set(String(r.code), num(r.standard_price));
    const linesBy = new Map<string, Row[]>(); for (const l of lines) { const k = String(l.bom_code); linesBy.set(k, [...(linesBy.get(k) ?? []), l]); }
    const laborBy = new Map<string, number>(); for (const r of laborParts.flatMap((p) => (p.data ?? []) as Row[])) laborBy.set(String(r.bom_code), num(r.rate));
    const pieceBy = new Map<string, { job_name: string; rate: number; qty_per: number }[]>();
    for (const r of pieceParts.flatMap((p) => (p.data ?? []) as Row[])) {
      const k = String(r.bom_code); pieceBy.set(k, [...(pieceBy.get(k) ?? []), { job_name: String(r.job_name ?? ""), rate: num(r.rate), qty_per: num(r.qty_per) || 1 }]);
    }
    saved = savedParts.flatMap((p) => (p.data ?? []) as Row[]);
    costs = {};
    for (const s of skus) {
      const code = String(s.code); const bomCode = bomOf.get(code) ?? null;
      const mat = bomCode ? bomMaterialCost(linesBy.get(bomCode) ?? [], std) : null;
      costs[code] = {
        bom_code: bomCode,
        // materials ส่งไปด้วย → deriveCost ใช้ "วัตถุดิบตัวแทน" ในต้นทุนที่บันทึกไว้ได้ (ตรงกับเครื่องคิดต้นทุน)
        material_cost_pp: mat ? mat.material_cost_pp : 0, missing_price: mat ? mat.missing_price : 0, materials: mat ? mat.materials : [],
        central_rate: bomCode ? (laborBy.get(bomCode) ?? 0) : 0, system_piece: bomCode ? (pieceBy.get(bomCode) ?? []) : [],
      };
    }
  }

  return NextResponse.json({
    parent_code: parentCode,
    cost_access: costOk,
    skus: skus.map((s) => ({
      id: s.id, code: s.code, name: s.name_th ?? null, color: (s.color_th as string) || (s.color as string) || null,
      image_key: s.cover_image_r2_key ?? null, is_active: s.is_active !== false,
      list_price: numOrNull(s.list_price), fake_price: numOrNull(s.fake_price),
      ...(costOk ? { standard_price: numOrNull(s.standard_price), rmb_cost: numOrNull(s.rmb_cost) } : {}),
    })),
    web: webRows.map((w) => ({ listing_id: w.id, shop_id: w.shop_id ?? null, shop_name: shopName.get(String(w.shop_id ?? "")) ?? "เว็บร้าน", web_price: numOrNull(w.web_price) })),
    shops,
    costs,
    saved: saved.map((r) => ({ target_type: r.target_type, target_code: r.target_code, qty_basis: numOrNull(r.qty_basis), scenario: r.scenario ?? null })),
    error: null,
  }, { headers: { "Cache-Control": "no-store" } });
}
