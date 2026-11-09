/**
 * ดึงสินค้าจาก LINE SHOPPING → เก็บลง platform_catalog_listings + จับคู่ ERP — /api/line-shopping/sync-products
 *  POST { brand_id }  (products.platforms.edit)
 *   → โหลด api_key (ถอดรหัส) ของ (แบรนด์ × line_shopping) → วนดึงสินค้าทุกหน้า (GET /products)
 *   → แปลงเป็นรายการสินค้า → บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (เหมือน Lazada)
 * 🐛 เดิมบันทึกเองทีเดียวทั้งร้าน (Louis Montini 921 ตัว) → เกิน 8 วิ ฐานข้อมูลตัดทิ้ง ("statement timeout")
 *    + เดิมเอาคู่ที่เดาจากรหัสทับคู่ที่คนจับไว้ (รวมตัวที่กด "ไม่ต้องจับคู่") → ใช้ของกลางที่ส่งทีละชุดและไม่ทับคู่เดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineListProducts } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";
import { upsertCatalogListings, type CatalogSyncItem } from "@/lib/platform-catalog-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_PAGES = 200;   // กันวนไม่จบ
const PER_PAGE = 100;
const asStr = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const asNum = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isNaN(n) ? null : n; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  if (!brand_id) return NextResponse.json({ error: "ต้องเลือกแบรนด์/ร้านก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING" }, { status: 400 });

  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ error: "ยังไม่ได้ใส่ API Key ของแบรนด์นี้" }, { status: 400 });
  let apiKey: string;
  try { apiKey = await decryptSecret(stored); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้ (กุญแจหลักไม่ตรง/หาย?)" }, { status: 400 }); }

  // 1) วนดึงสินค้าทุกหน้า — ยึด "ยอดที่ LINE รายงาน" (totalRow) เป็นหลัก
  //    เผื่อ LINE แบ่งหน้าเล็กกว่าที่ขอ: วนต่อจนได้ครบตามยอด หรือหน้าว่าง (ไม่พึ่ง totalPage อย่างเดียว)
  const products: Record<string, unknown>[] = [];
  let page = 1, apiTotal = 0;
  while (page <= MAX_PAGES) {
    const res = await lineListProducts(apiKey, { page, perPage: PER_PAGE });
    if (!res.ok) return NextResponse.json({ error: `ดึงสินค้าไม่สำเร็จ: ${res.error}` }, { status: 400 });
    const got = res.rows ?? [];
    if (page === 1) apiTotal = res.totalRow ?? 0;
    products.push(...got);
    if (got.length === 0) break;                                 // หน้าว่าง = จบ
    if (apiTotal > 0 && products.length >= apiTotal) break;      // ครบตามที่ LINE รายงาน
    if (apiTotal === 0 && got.length < PER_PAGE) break;          // ไม่รู้ยอดรวม + หน้าไม่เต็ม = จบ
    page++;
  }
  if (products.length === 0) return NextResponse.json({ ok: true, fetched: 0, matched: 0, created: 0, updated: 0, error: null });

  // 2) แปลงเป็นรายการมาตรฐาน (ระดับสินค้า + เก็บ variants ใน raw.line)
  const items: CatalogSyncItem[] = [];
  for (const p of products) {
    const variants = Array.isArray(p.variants) ? p.variants as Record<string, unknown>[] : [];
    const skus = variants.map((v) => asStr(v.sku)).filter(Boolean) as string[];
    const prices = variants.map((v) => asNum(v.price)).filter((n): n is number => n != null);
    const eid = asStr(p.id);
    if (!eid) continue;
    items.push({ external_product_id: eid, title: asStr(p.name), skus, price: prices.length ? Math.min(...prices) : null, raw: { line: p } });
  }

  // 3) บันทึก + จับคู่รหัสตรง (ของกลาง · ทีละชุด · ไม่ทับคู่เดิม · ไม่จับคู่ตัวที่กดข้าม)
  let saved;
  try { saved = await upsertCatalogListings(admin, { platformId: platform_id, brandId: brand_id, source: "api", items }); }
  catch (e) { return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  await writeAudit(admin, { action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_api", brand_id, api_total: apiTotal, fetched: items.length, ...saved } });
  return NextResponse.json({ ok: true, api_total: apiTotal, fetched: items.length, ...saved, error: null });
}
