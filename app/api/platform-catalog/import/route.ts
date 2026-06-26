/**
 * นำเข้าไฟล์ export แพลตฟอร์ม → /api/platform-catalog/import
 * POST { platform_id, brand_id?, headers: string[], rows: Record<string,any>[] }  (products.platforms.edit)
 *  - หัวคอลัมน์ → platform_field_schemas (ฟิลด์ของแพลตฟอร์มนั้น)
 *  - แถว → platform_catalog_listings (เก็บ raw + ดึงรหัส/ชื่อ/sku/ราคา + จับคู่กับ ERP ด้วย sku code)
 *  - แทนที่ข้อมูล import เดิมของ (platform × แบรนด์) เพื่อกันซ้ำ
 * ฝั่ง client เป็นคนแกะไฟล์ (xlsx/csv) แล้วส่ง headers+rows มา
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// หาค่าจากแถวด้วยชื่อคอลัมน์ที่เป็นไปได้ (ไม่สนตัวพิมพ์/ช่องว่าง)
function pick(row: Record<string, unknown>, lower: Record<string, unknown>, candidates: string[]): string | null {
  for (const c of candidates) { const v = lower[c.toLowerCase()]; if (v != null && String(v).trim() !== "") return String(v).trim(); }
  void row; return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { platform_id?: string; brand_id?: string; headers?: string[]; rows?: Record<string, unknown>[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = (body.platform_id ?? "").trim();
  if (!platform_id) return NextResponse.json({ error: "ต้องระบุ platform_id" }, { status: 400 });
  const brand_id = (body.brand_id ?? "").trim() || null;
  const headers = (body.headers ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (headers.length === 0) return NextResponse.json({ error: "ไม่พบหัวคอลัมน์ในไฟล์" }, { status: 400 });

  const admin = supabaseAdmin();

  // 1) ฟิลด์ของแพลตฟอร์ม (จากหัวคอลัมน์) — เพิ่มใหม่ ไม่ทับของเดิม
  await admin.from("platform_field_schemas")
    .upsert(headers.map((h, i) => ({ platform_id, field_key: h, field_label: h, source: "import", sort_order: i })), { onConflict: "platform_id,field_key", ignoreDuplicates: true });

  // 2) เตรียม listings + จับคู่ sku code → ERP
  const toLower = (r: Record<string, unknown>) => { const o: Record<string, unknown> = {}; for (const k of Object.keys(r)) o[k.toLowerCase()] = r[k]; return o; };
  const prepared = rows.map((r) => {
    const lo = toLower(r);
    return {
      raw: r,
      external_product_id: pick(r, lo, ["product_id", "item_id", "product id", "global_item_id", "id"]),
      title: pick(r, lo, ["name", "product_name", "title", "ชื่อสินค้า", "product name"]),
      sku_code: pick(r, lo, ["sku", "seller sku", "sku code", "variation_sku", "parent sku", "รหัสสินค้า", "รหัส"]),
      price_raw: pick(r, lo, ["price", "ราคา", "variation_price", "special_price", "ราคาขาย"]),
      status: pick(r, lo, ["status", "สถานะ"]),
    };
  });
  const codes = [...new Set(prepared.map((p) => p.sku_code).filter(Boolean) as string[])];
  const matchMap = new Map<string, string>(); // sku_code → parent_sku_id
  if (codes.length) {
    const [{ data: skus }, { data: parents }] = await Promise.all([
      admin.from("skus_v2").select("code, parent_sku_id").in("code", codes),
      admin.from("parent_skus_v2").select("id, code").in("code", codes),
    ]);
    for (const s of ((skus ?? []) as Record<string, unknown>[])) if (s.parent_sku_id) matchMap.set(String(s.code), String(s.parent_sku_id));
    for (const p of ((parents ?? []) as Record<string, unknown>[])) if (!matchMap.has(String(p.code))) matchMap.set(String(p.code), String(p.id));
  }

  // 3) แทนที่ข้อมูล import เดิมของ (platform × แบรนด์) แล้วใส่ชุดใหม่
  let del = admin.from("platform_catalog_listings").delete().eq("platform_id", platform_id).eq("source", "import");
  del = brand_id ? del.eq("brand_id", brand_id) : del.is("brand_id", null);
  await del;

  const now = new Date().toISOString();
  const insertRows = prepared.map((p) => {
    const price = p.price_raw ? Number(String(p.price_raw).replace(/[^0-9.]/g, "")) : null;
    return {
      platform_id, brand_id, source: "import", last_imported_at: now,
      external_product_id: p.external_product_id, title: p.title, sku_code: p.sku_code,
      matched_parent_sku_id: p.sku_code ? (matchMap.get(p.sku_code) ?? null) : null,
      price: price != null && !Number.isNaN(price) ? price : null,
      status: p.status, raw: p.raw,
    };
  });
  if (insertRows.length) {
    const { error } = await admin.from("platform_catalog_listings").insert(insertRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const matched = insertRows.filter((r) => r.matched_parent_sku_id).length;
  await writeAudit(admin, { action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_id, brand_id, rows: insertRows.length, fields: headers.length, matched } });
  return NextResponse.json({ ok: true, listings: insertRows.length, fields: headers.length, matched, error: null });
}
