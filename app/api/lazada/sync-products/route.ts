/**
 * ดึงสินค้าที่ลงไว้บน Lazada → หน้า "สินค้าบนแพลตฟอร์ม" — /api/lazada/sync-products
 *  POST { brand_id }  (products.platforms.edit)
 *   → ต่ออายุกุญแจถ้าใกล้หมด → วนอ่าน /products/get ทีละ 50 (filter=all) → แปลงด้วย lazProductToCatalogItem
 *   → บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (ที่เหลือให้ตัวเดาคู่เสนอในหน้า)
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน Lazada
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lazGetProducts, lazProductToCatalogItem, type LazCatalogItem } from "@/lib/lazada";
import { upsertCatalogListings } from "@/lib/platform-catalog-sync";
import { getPlatformId, lazTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PAGE = 50;            // Lazada ให้ครั้งละไม่เกิน 50
const MAX_PRODUCTS = 5000;  // กันวนไม่จบ (ร้าน IG มีหลักร้อย)
const TIME_BUDGET_MS = 45_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์/ร้านก่อน (การเชื่อม Lazada ผูกกับแบรนด์)" }, { status: 400 });

  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม Lazada ในระบบ" }, { status: 400 });
  const tok = await lazTokenOrReason(admin, brandId, lazId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });

  // 1) วนอ่านทุกหน้า (หยุดเมื่อครบตามยอดที่ Lazada รายงาน / หน้าว่าง / หมดเวลา)
  const started = Date.now();
  const items: LazCatalogItem[] = [];
  let offset = 0, apiTotal = 0, partial = false;
  while (offset < MAX_PRODUCTS) {
    if (Date.now() - started > TIME_BUDGET_MS) { partial = true; break; }
    let res: { products: Record<string, unknown>[]; total: number };
    try { res = await lazGetProducts(tok.gateway, tok.accessToken, { offset, limit: PAGE }); }
    catch (e) {
      if (items.length === 0) return NextResponse.json({ error: `อ่านสินค้าจาก Lazada ไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 });
      partial = true; break;
    }
    if (offset === 0) apiTotal = res.total;
    for (const p of res.products) { const it = lazProductToCatalogItem(p); if (it) items.push(it); }
    if (res.products.length < PAGE) break;
    offset += PAGE;
    if (apiTotal > 0 && offset >= apiTotal) break;
  }

  // 2) บันทึก + จับคู่รหัสตรง (ของกลาง)
  let saved;
  try { saved = await upsertCatalogListings(admin, { platformId: lazId, brandId, source: "api", items }); }
  catch (e) { return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  await writeAudit(admin, {
    action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "lazada_api", brand_id: brandId, api_total: apiTotal, fetched: items.length, partial, ...saved },
  });
  return NextResponse.json({ ok: true, api_total: apiTotal, fetched: items.length, partial, ...saved, error: null });
}
