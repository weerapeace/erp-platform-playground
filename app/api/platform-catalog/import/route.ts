/**
 * นำเข้าไฟล์ export แพลตฟอร์ม → /api/platform-catalog/import
 * POST { platform_id, brand_id?, profile_id, matrix }  (products.platforms.edit)
 *  - matrix = แถวดิบทั้งหมดจากไฟล์ (รวมแถวหัวตาราง) · profile_id = ชนิดไฟล์ที่ผู้ใช้ยืนยัน
 *  - ใช้ "โปรไฟล์ไฟล์" (lib/platform-import-profiles) แตกข้อมูล: ข้ามหัวตารางหลายแถว + แปลงรหัสคอลัมน์ → ฟิลด์มาตรฐาน
 *  - หัวคอลัมน์ → platform_field_schemas (ฟิลด์ + ป้ายไทย + ตัวอย่างค่า)
 *  - แถว → platform_catalog_listings (จัดกลุ่มระดับสินค้า + จับคู่ ERP ด้วยรหัส)
 *  - upsert ระดับแอป "เติม/อัปเดตตามรหัสสินค้า" (ไม่ลบของเดิม) → อัปครบหลายไฟล์แล้วได้สินค้าครบทุกมุม
 * ฝั่งหน้าจอเป็นคนแกะไฟล์ (xlsx/csv) เป็น matrix + เดาโปรไฟล์ให้ยืนยันก่อนส่ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getProfile, GENERIC_CATALOG_PROFILE, dbRowToProfile, extractFields, parseRecords, type ImportMatrix, type ImportProfile, type ImportRecord, type DbProfileRow } from "@/lib/platform-import-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Group = { key: string; external_product_id: string | null; parent_sku: string | null; title: string | null; status: string | null; recs: ImportRecord[] };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { platform_id?: string; brand_id?: string; profile_id?: string; matrix?: ImportMatrix };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = (body.platform_id ?? "").trim();
  if (!platform_id) return NextResponse.json({ error: "ต้องระบุ platform_id" }, { status: 400 });
  const brand_id = (body.brand_id ?? "").trim() || null;
  const matrix = Array.isArray(body.matrix) ? body.matrix : [];
  if (matrix.length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลในไฟล์" }, { status: 400 });

  const admin = supabaseAdmin();

  // โหลดชนิดไฟล์ที่ผู้ใช้สร้างเอง (custom) มารวมกับโปรไฟล์มาตรฐานในโค้ด
  const [{ data: pf }, { data: customRows }] = await Promise.all([
    admin.from("erp_platforms").select("code").eq("id", platform_id).maybeSingle(),
    admin.from("platform_import_profiles").select("id, profile_key, label, kind, level, section, header_row_index, label_row_index, data_start_row_index, detect, field_map, is_active").eq("platform_id", platform_id).eq("is_active", true),
  ]);
  const code = String((pf as { code?: string } | null)?.code ?? "");
  const extra: ImportProfile[] = ((customRows ?? []) as DbProfileRow[]).map((r) => dbRowToProfile(r, code));
  const profile = getProfile((body.profile_id ?? "").trim(), extra) ?? GENERIC_CATALOG_PROFILE;
  if (profile.kind !== "catalog") return NextResponse.json({ error: "ไฟล์นี้ไม่ใช่ไฟล์สินค้า (เป็นไฟล์ออเดอร์ ให้ไปนำเข้าที่หน้ารับออเดอร์)" }, { status: 400 });

  // 1) ฟิลด์ของไฟล์ → platform_field_schemas (อัปเดตป้าย/ตัวอย่าง, สะสมจากหลายไฟล์)
  const fields = extractFields(profile, matrix);
  if (fields.length) {
    await admin.from("platform_field_schemas").upsert(
      fields.map((f, i) => ({ platform_id, field_key: f.key, field_label: f.label, sample: f.sample, sort_order: i, source: "import" })),
      { onConflict: "platform_id,field_key" },
    );
  }

  // 2) แตกข้อมูลตามโปรไฟล์ → จัดกลุ่มระดับสินค้า
  const records = parseRecords(profile, matrix);
  if (records.length === 0) return NextResponse.json({ error: "อ่านข้อมูลจากไฟล์ไม่ได้ (ตรวจว่าเลือกชนิดไฟล์ถูกต้อง)" }, { status: 400 });

  const groups = new Map<string, Group>();
  records.forEach((rec, i) => {
    const key = rec.external_product_id ? `ext:${rec.external_product_id}`
      : rec.variation_sku ? `vsku:${rec.variation_sku}`
      : rec.parent_sku ? `psku:${rec.parent_sku}` : `row:${i}`;
    let g = groups.get(key);
    if (!g) { g = { key, external_product_id: rec.external_product_id, parent_sku: null, title: null, status: null, recs: [] }; groups.set(key, g); }
    g.recs.push(rec);
    if (!g.parent_sku && rec.parent_sku) g.parent_sku = rec.parent_sku;          // Shopee ใส่ parent_sku เฉพาะแถวแรกของแต่ละสินค้า
    if (!g.title && rec.title) g.title = rec.title;
    if (!g.status && rec.status) g.status = rec.status;
    if (!g.external_product_id && rec.external_product_id) g.external_product_id = rec.external_product_id;
  });

  // 3) จับคู่ ERP ด้วยรหัส (parent code → parent_skus_v2 · variation sku → skus_v2.parent)
  const parentCodes = new Set<string>(); const variationCodes = new Set<string>();
  for (const g of groups.values()) {
    if (g.parent_sku) parentCodes.add(g.parent_sku);
    for (const r of g.recs) if (r.variation_sku) variationCodes.add(r.variation_sku);
  }
  const parentMap = new Map<string, string>();      // code → parent_sku_id
  const skuParentMap = new Map<string, string>();    // sku code → parent_sku_id
  const codeList = [...new Set([...parentCodes, ...variationCodes])];
  if (codeList.length) {
    const [{ data: parents }, { data: skus }] = await Promise.all([
      admin.from("parent_skus_v2").select("id, code").in("code", codeList),
      variationCodes.size ? admin.from("skus_v2").select("code, parent_sku_id").in("code", [...variationCodes]) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);
    for (const p of ((parents ?? []) as Record<string, unknown>[])) parentMap.set(String(p.code), String(p.id));
    for (const s of ((skus ?? []) as Record<string, unknown>[])) if (s.parent_sku_id) skuParentMap.set(String(s.code), String(s.parent_sku_id));
  }
  const matchOf = (g: Group): string | null => {
    if (g.parent_sku && parentMap.has(g.parent_sku)) return parentMap.get(g.parent_sku)!;
    const firstV = g.recs.find((r) => r.variation_sku)?.variation_sku ?? null;
    if (firstV && skuParentMap.has(firstV)) return skuParentMap.get(firstV)!;
    if (firstV && parentMap.has(firstV)) return parentMap.get(firstV)!;
    return null;
  };

  // รหัส SKU ที่ใช้แสดง/จับคู่ซ้ำ = parent_sku ถ้ามี ไม่งั้นใช้ตัวเลือกตัวแรก (กรณีไฟล์ทั่วไปไม่มี parent)
  const displaySkuOf = (g: Group): string | null => g.parent_sku ?? (g.recs.find((r) => r.variation_sku)?.variation_sku ?? null);

  // 4) ดึงรายการเดิม (เพื่อ upsert "เติม" ไม่ลบของเดิม) แล้วแยก insert/update
  const extIds = [...groups.values()].map((g) => g.external_product_id).filter(Boolean) as string[];
  const skusOfGroups = [...groups.values()].filter((g) => !g.external_product_id).map(displaySkuOf).filter(Boolean) as string[];
  const existing: Record<string, unknown>[] = [];
  const sel = "id, external_product_id, sku_code, brand_id, title, price, status, matched_parent_sku_id, raw";
  if (extIds.length) {
    const { data } = await admin.from("platform_catalog_listings").select(sel).eq("platform_id", platform_id).in("external_product_id", extIds);
    existing.push(...((data ?? []) as Record<string, unknown>[]));
  }
  if (skusOfGroups.length) {
    const { data } = await admin.from("platform_catalog_listings").select(sel).eq("platform_id", platform_id).in("sku_code", skusOfGroups);
    existing.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const existKey = (r: Record<string, unknown>): string => r.external_product_id ? `ext:${r.external_product_id}` : `psku:${r.sku_code ?? ""}`;
  const sameBrand = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);
  const existIndex = new Map<string, Record<string, unknown>>();
  for (const r of existing) if (sameBrand((r.brand_id as string) ?? null, brand_id)) existIndex.set(existKey(r), r);

  // 5) สร้างข้อมูลที่จะบันทึก (merge raw แยกตาม section ของโปรไฟล์)
  const now = new Date().toISOString();
  const hasPrice = !!profile.map.price;
  const updateRows: Record<string, unknown>[] = [];
  const insertRows: Record<string, unknown>[] = [];
  let matchedCount = 0;

  for (const g of groups.values()) {
    const matched = matchOf(g); if (matched) matchedCount++;
    const displaySku = displaySkuOf(g);
    const prices = g.recs.map((r) => r.price).filter((n): n is number => n != null);
    const stocks = g.recs.map((r) => r.stock).filter((n): n is number => n != null);
    const priceMin = prices.length ? Math.min(...prices) : null;
    const sectionData: Record<string, unknown> = profile.level === "variation"
      ? { variations: g.recs.map((r) => ({ sku: r.variation_sku, name: r.variation_name, external_variation_id: r.external_variation_id, price: r.price, stock: r.stock, raw: r.raw })), price_min: priceMin, stock_total: stocks.length ? stocks.reduce((a, b) => a + b, 0) : null }
      : (g.recs[0]?.raw ?? {});

    const found = existIndex.get(g.external_product_id ? `ext:${g.external_product_id}` : `psku:${displaySku ?? ""}`);
    if (found) {
      const prevRaw = (found.raw && typeof found.raw === "object") ? found.raw as Record<string, unknown> : {};
      updateRows.push({
        id: found.id, platform_id, brand_id, source: "import", last_imported_at: now,
        external_product_id: g.external_product_id ?? (found.external_product_id ?? null),
        title: g.title ?? (found.title ?? null),
        sku_code: displaySku ?? (found.sku_code ?? null),
        matched_parent_sku_id: matched ?? (found.matched_parent_sku_id ?? null),
        price: hasPrice ? (priceMin ?? (found.price ?? null)) : (found.price ?? null),
        status: g.status ?? (found.status ?? null),
        raw: { ...prevRaw, [profile.section]: sectionData },
      });
    } else {
      insertRows.push({
        platform_id, brand_id, source: "import", last_imported_at: now,
        external_product_id: g.external_product_id, title: g.title, sku_code: displaySku,
        matched_parent_sku_id: matched, price: hasPrice ? priceMin : null, status: g.status,
        raw: { [profile.section]: sectionData },
      });
    }
  }

  if (insertRows.length) {
    const { error } = await admin.from("platform_catalog_listings").insert(insertRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (updateRows.length) {
    const { error } = await admin.from("platform_catalog_listings").upsert(updateRows, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const products = groups.size;
  await writeAudit(admin, { action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_id, brand_id, profile: profile.id, products, created: insertRows.length, updated: updateRows.length, fields: fields.length, matched: matchedCount } });
  return NextResponse.json({ ok: true, profile: profile.label, products, created: insertRows.length, updated: updateRows.length, fields: fields.length, matched: matchedCount, error: null });
}
