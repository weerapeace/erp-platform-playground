/**
 * ดึงสินค้าจาก LINE SHOPPING → เก็บลง platform_catalog_listings + จับคู่ ERP — /api/line-shopping/sync-products
 *  POST { brand_id }  (products.platforms.edit)
 *   → โหลด api_key (ถอดรหัส) ของ (แบรนด์ × line_shopping) → วนดึงสินค้าทุกหน้า (GET /products)
 *   → แปลงเป็นรายการสินค้า + จับคู่ด้วยรหัส SKU (skus_v2 / parent_skus_v2) → upsert ตาม external_product_id (source=api, เติมไม่ลบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineListProducts } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_PAGES = 50;   // กันวนไม่จบ (สูงสุด ~5000 สินค้า/ครั้ง)
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

  // 1) วนดึงสินค้าทุกหน้า (จนกว่าจะครบหน้า หรือหน้าสุดท้ายไม่เต็ม) + จำยอดที่ LINE รายงาน
  const products: Record<string, unknown>[] = [];
  let page = 1, totalPage = 1, apiTotal = 0;
  do {
    const res = await lineListProducts(apiKey, { page, perPage: 100 });
    if (!res.ok) return NextResponse.json({ error: `ดึงสินค้าไม่สำเร็จ: ${res.error}` }, { status: 400 });
    const got = res.rows ?? [];
    products.push(...got);
    if (page === 1) apiTotal = res.totalRow ?? got.length;
    totalPage = res.totalPage ?? 1;
    if (got.length < 100) break;   // หน้าสุดท้ายไม่เต็ม = จบ (กันกรณี totalPage ไม่ถูก)
    page++;
  } while (page <= totalPage && page <= MAX_PAGES);
  if (products.length === 0) return NextResponse.json({ ok: true, fetched: 0, matched: 0, created: 0, updated: 0, error: null });

  // 2) แปลงเป็นรายการมาตรฐาน (ระดับสินค้า + เก็บ variants ใน raw)
  type Item = { external_product_id: string; title: string | null; skus: string[]; price: number | null; raw: Record<string, unknown> };
  const items: Item[] = [];
  for (const p of products) {
    const variants = Array.isArray(p.variants) ? p.variants as Record<string, unknown>[] : [];
    const skus = variants.map((v) => asStr(v.sku)).filter(Boolean) as string[];
    const prices = variants.map((v) => asNum(v.price)).filter((n): n is number => n != null);
    const eid = asStr(p.id);
    if (!eid) continue;
    items.push({ external_product_id: eid, title: asStr(p.name), skus, price: prices.length ? Math.min(...prices) : null, raw: { line: p } });
  }

  // 3) จับคู่ ERP ด้วยรหัส SKU (variant sku → skus_v2 / parent_skus_v2)
  const allSkus = [...new Set(items.flatMap((i) => i.skus))];
  const skuToParent = new Map<string, string>();   // sku code → parent_sku_id
  const codeToParent = new Map<string, string>();  // parent code → id
  if (allSkus.length) {
    const [{ data: skus }, { data: parents }] = await Promise.all([
      admin.from("skus_v2").select("code, parent_sku_id").in("code", allSkus),
      admin.from("parent_skus_v2").select("id, code").in("code", allSkus),
    ]);
    for (const s of ((skus ?? []) as Record<string, unknown>[])) if (s.parent_sku_id) skuToParent.set(String(s.code), String(s.parent_sku_id));
    for (const p of ((parents ?? []) as Record<string, unknown>[])) codeToParent.set(String(p.code), String(p.id));
  }
  const matchOf = (i: Item): string | null => {
    for (const sk of i.skus) { if (skuToParent.has(sk)) return skuToParent.get(sk)!; if (codeToParent.has(sk)) return codeToParent.get(sk)!; }
    return null;
  };

  // 4) upsert ตาม external_product_id (เติม/อัปเดต ไม่ลบของเดิม)
  const extIds = items.map((i) => i.external_product_id);
  const existing: Record<string, unknown>[] = [];
  for (let i = 0; i < extIds.length; i += 300) {
    const { data } = await admin.from("platform_catalog_listings").select("id, external_product_id, brand_id, title, price, matched_parent_sku_id, raw").eq("platform_id", platform_id).eq("brand_id", brand_id).in("external_product_id", extIds.slice(i, i + 300));
    existing.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const byExt = new Map<string, Record<string, unknown>>();
  for (const r of existing) byExt.set(String(r.external_product_id), r);

  const now = new Date().toISOString();
  const insertRows: Record<string, unknown>[] = [];
  const updateRows: Record<string, unknown>[] = [];
  let matched = 0;
  for (const it of items) {
    const m = matchOf(it); if (m) matched++;
    const displaySku = it.skus[0] ?? null;
    const found = byExt.get(it.external_product_id);
    if (found) {
      const prevRaw = (found.raw && typeof found.raw === "object") ? found.raw as Record<string, unknown> : {};
      updateRows.push({ id: found.id, platform_id, brand_id, source: "api", last_imported_at: now,
        external_product_id: it.external_product_id, title: it.title ?? (found.title ?? null), sku_code: displaySku,
        matched_parent_sku_id: m ?? (found.matched_parent_sku_id ?? null), price: it.price ?? (found.price ?? null),
        raw: { ...prevRaw, ...it.raw } });
    } else {
      insertRows.push({ platform_id, brand_id, source: "api", last_imported_at: now,
        external_product_id: it.external_product_id, title: it.title, sku_code: displaySku,
        matched_parent_sku_id: m, price: it.price, raw: it.raw });
    }
  }
  if (insertRows.length) { const { error } = await admin.from("platform_catalog_listings").insert(insertRows); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); }
  if (updateRows.length) { const { error } = await admin.from("platform_catalog_listings").upsert(updateRows, { onConflict: "id" }); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); }

  await writeAudit(admin, { action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_api", brand_id, api_total: apiTotal, fetched: items.length, matched, created: insertRows.length, updated: updateRows.length } });
  return NextResponse.json({ ok: true, api_total: apiTotal, fetched: items.length, matched, created: insertRows.length, updated: updateRows.length, error: null });
}
