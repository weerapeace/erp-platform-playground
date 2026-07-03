/**
 * หน้าจับคู่เร็ว — /api/platform-match
 *  GET ?platform_id=&brand_id=  (products.platforms.view)
 *   → สินค้าที่ยังไม่จับคู่ ERP + "รหัสที่ระบบเดาว่าใช่" (suggest) ต่อแถว (ให้กดยืนยันทีเดียว)
 * จับคู่จริงใช้ /api/platform-catalog/match (POST) เดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// สร้างรหัสที่เป็นไปได้จาก SKU (ไล่จากเฉพาะเจาะจง → กว้าง) เช่น WK42-01D → [WK42-01D, WK42-01, WK42]
function candidates(sku: string): string[] {
  const c: string[] = [sku];
  const noTail = sku.replace(/[A-Za-z]+$/, "");            // ตัดตัวอักษรท้าย: WK42-01D → WK42-01
  if (noTail && noTail !== sku) c.push(noTail);
  const m = sku.match(/^(.*?)-[0-9]+[A-Za-z]*$/);          // ตัด -เลข(อักษร) ท้าย → parent: FFB16-01 → FFB16
  if (m && m[1] && m[1] !== sku) c.push(m[1]);
  return [...new Set(c.filter(Boolean))];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  if (!platformId) return NextResponse.json({ listings: [], matchedCount: 0, error: null });
  const admin = supabaseAdmin();

  // ยอดจับคู่แล้ว (ไว้โชว์ความคืบหน้า) + รายการที่ยังไม่จับคู่
  let baseTotal = admin.from("platform_catalog_listings").select("id", { count: "exact", head: true }).eq("platform_id", platformId).not("matched_parent_sku_id", "is", null);
  if (brandId) baseTotal = baseTotal.eq("brand_id", brandId);
  let uq = admin.from("platform_catalog_listings").select("id, external_product_id, title, sku_code, price").eq("platform_id", platformId).is("matched_parent_sku_id", null).order("created_at", { ascending: false }).limit(2000);
  if (brandId) uq = uq.eq("brand_id", brandId);
  const [{ count: matchedCount }, { data: un }] = await Promise.all([baseTotal, uq]);
  const rows = (un ?? []) as { id: string; external_product_id: string | null; title: string | null; sku_code: string | null; price: number | null }[];

  // รวมรหัสที่เป็นไปได้ทั้งหมด → ถามฐานข้อมูลเป็นชุดย่อย
  const rowCands = rows.map((r) => ({ r, cands: r.sku_code ? candidates(r.sku_code) : [] }));
  const allCands = [...new Set(rowCands.flatMap((x) => x.cands))];
  const skuToParent = new Map<string, { id: string; code: string; name: string }>();
  const parentByCode = new Map<string, { id: string; code: string; name: string }>();
  for (let i = 0; i < allCands.length; i += 200) {
    const chunk = allCands.slice(i, i + 200);
    const [{ data: skus }, { data: parents }] = await Promise.all([
      admin.from("skus_v2").select("code, parent_sku_id").in("code", chunk),
      admin.from("parent_skus_v2").select("id, code, name_th").in("code", chunk),
    ]);
    // parent info สำหรับ variant sku → ต้องรู้ code/name ของ parent → เก็บ id ไว้ก่อน แล้ว resolve ทีหลัง
    for (const s of ((skus ?? []) as Record<string, unknown>[])) if (s.parent_sku_id) skuToParent.set(String(s.code), { id: String(s.parent_sku_id), code: "", name: "" });
    for (const p of ((parents ?? []) as Record<string, unknown>[])) parentByCode.set(String(p.code), { id: String(p.id), code: String(p.code), name: String(p.name_th ?? p.code ?? "") });
  }
  // เติม code/name ให้ parent ที่มาจาก variant sku
  const needIds = [...new Set([...skuToParent.values()].map((v) => v.id))];
  const parentById = new Map<string, { id: string; code: string; name: string }>();
  for (let i = 0; i < needIds.length; i += 200) {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th").in("id", needIds.slice(i, i + 200));
    for (const p of ((data ?? []) as Record<string, unknown>[])) parentById.set(String(p.id), { id: String(p.id), code: String(p.code ?? ""), name: String(p.name_th ?? p.code ?? "") });
  }

  const listings = rowCands.map(({ r, cands }) => {
    let suggest: { parent_sku_id: string; code: string; name: string } | null = null;
    for (const c of cands) {
      const viaSku = skuToParent.get(c); if (viaSku) { const p = parentById.get(viaSku.id); if (p) { suggest = { parent_sku_id: p.id, code: p.code, name: p.name }; break; } }
      const viaParent = parentByCode.get(c); if (viaParent) { suggest = { parent_sku_id: viaParent.id, code: viaParent.code, name: viaParent.name }; break; }
    }
    return { id: r.id, external_product_id: r.external_product_id, title: r.title, sku_code: r.sku_code, price: r.price, suggest };
  });

  return NextResponse.json({ listings, matchedCount: matchedCount ?? 0, unmatched: listings.length, error: null });
}
