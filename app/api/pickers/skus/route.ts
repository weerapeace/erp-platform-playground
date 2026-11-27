import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi, apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SkuPickerRow = {
  id: string;
  code: string | null;
  barcode: string | null;
  parent_sku_id: string | null;
  name_th: string | null;
  color: string | null;
  color_th: string | null;
  list_price: number | null;
  fake_price: number | null;
  cover_image_r2_key: string | null;
  sale_ok: boolean | null;
  is_active: boolean | null;
  uom: { name: string | null } | { name: string | null }[] | null;
  parent_skus_v2:
    | { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; product_categories: { name: string | null } | { name: string | null }[] | null }
    | { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; product_categories: { name: string | null } | { name: string | null }[] | null }[]
    | null;
};

type ParentSkuMatchRow = {
  id: string;
};

const cleanSearch = (value: string) =>
  value.replace(/[%_,()*]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);

async function findParentSkuIds(request: NextRequest, token: string): Promise<string[]> {
  const { data, error } = await supabaseFromRequest(request)
    .from("parent_skus_v2")
    .select("id")
    .or(`code.ilike.%${token}%,name_th.ilike.%${token}%`)
    .limit(100);

  if (error) return [];
  return ((data ?? []) as ParentSkuMatchRow[]).map((row) => row.id);
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const sb = supabaseFromRequest(request);
  const { searchParams } = new URL(request.url);

  // facets — ค่าที่เลือกได้ในตัวกรอง (จากทั้งฐานข้อมูล ไม่ใช่แค่ที่โหลด)
  if (searchParams.get("facets") === "1") {
    const [cats, uoms, colors] = await Promise.all([
      sb.from("product_categories").select("name").order("name").limit(1000),
      sb.from("uoms").select("name").order("name").limit(1000),
      sb.from("skus_v2").select("color_th").eq("is_active", true).not("color_th", "is", null).limit(5000),
    ]);
    const uniq = (rows: { data: Array<Record<string, unknown>> | null }, key: string) =>
      [...new Set((rows.data ?? []).map((r) => String(r[key] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    return NextResponse.json({
      categories: uniq(cats, "name"), uoms: uniq(uoms, "name"), colors: uniq(colors, "color_th"), error: null,
    });
  }

  const search = (searchParams.get("search") ?? "").trim();
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const salesOnly = searchParams.get("sales_only") === "true";

  // ตัวกรอง server-side (resolve เป็น id ก่อน — ชัวร์กว่ากรอง relation ซ้อน)
  const fCategory = (searchParams.get("category") ?? "").trim();
  const fColor = (searchParams.get("color") ?? "").trim();
  const fUom = (searchParams.get("uom") ?? "").trim();
  const fSaleOk = searchParams.get("sale_ok");   // "true" | "false" | null
  // กรองตามแท็ก (product_families.id) — เช่น เฉพาะ SKU แท็ก Packaging (Set บรรจุภัณฑ์สถานีแพ็ค 2026-11-23)
  const fTag = (searchParams.get("tag") ?? "").trim();
  const tagOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fTag);
  let fCategoryParentIds: string[] | null = null;
  let fUomId: string | null = null;
  if (fCategory) {
    const { data: cat } = await sb.from("product_categories").select("id").eq("name", fCategory).limit(1).maybeSingle();
    const catId = (cat as { id?: string } | null)?.id;
    const { data: parents } = catId
      ? await sb.from("parent_skus_v2").select("id").eq("category_id", catId).limit(5000)
      : { data: [] };
    fCategoryParentIds = ((parents ?? []) as Array<{ id: string }>).map((p) => p.id);
  }
  if (fUom) {
    const { data: u } = await sb.from("uoms").select("id").eq("name", fUom).limit(1).maybeSingle();
    fUomId = (u as { id?: string } | null)?.id ?? null;
  }
  // เรียงลำดับ server-side
  const sort = searchParams.get("sort") ?? "code";
  const sortAsc = searchParams.get("dir") !== "desc";
  const orderCol = sort === "name" ? "name_th" : sort === "price" ? "list_price" : "code";

  const tokens = cleanSearch(search);
  const parentIdsByToken = new Map<string, string[]>();
  for (const token of tokens) {
    parentIdsByToken.set(token, await findParentSkuIds(request, token));
  }

  let query = sb
    .from("skus_v2")
    .select(`
      id,
      code,
      barcode,
      parent_sku_id,
      name_th,
      color,
      color_th,
      list_price,
      fake_price,
      cover_image_r2_key,
      sale_ok,
      is_active,
      parent_skus_v2 ( id, code, name_th, cover_image_r2_key, product_categories ( name ) ),
      uom:uoms!uom_id ( name )${tagOk ? ",\n      tagf:skus_v2_product_family_m2m!inner ( tgt_id )" : ""}
    `, { count: "exact" })
    .eq("is_active", true);
  if (salesOnly) query = query.eq("sale_ok", true);
  // ตัวกรอง server-side
  if (fSaleOk === "true") query = query.eq("sale_ok", true);
  if (fSaleOk === "false") query = query.eq("sale_ok", false);
  if (fColor) query = query.or(`color_th.eq.${fColor},color.eq.${fColor}`);
  if (fUomId) query = query.eq("uom_id", fUomId);
  if (tagOk) query = query.eq("tagf.tgt_id", fTag);   // inner join กับตารางแท็ก — ไม่ต้องส่ง id ยาว ๆ ใน URL
  if (fCategoryParentIds) {
    // ไม่มี parent ในหมวดนี้ → ไม่มีผลลัพธ์
    if (fCategoryParentIds.length === 0) return NextResponse.json({ data: [], total: 0, error: null });
    query = query.in("parent_sku_id", fCategoryParentIds);
  }
  // กรองตาม Parent SKU โดยตรง (ดึง SKU ลูกทั้งหมดของ parent — เช่น รวมสีในคอนเทนต์)
  const parentSkuId = (searchParams.get("parent_sku_id") ?? "").trim();
  if (parentSkuId) query = query.eq("parent_sku_id", parentSkuId);

  for (const token of tokens) {
    const parentIds = parentIdsByToken.get(token) ?? [];
    const parts = [
      `code.ilike.%${token}%`,
      `name_th.ilike.%${token}%`,
      `barcode.ilike.%${token}%`,
    ];
    if (parentIds.length > 0) {
      parts.push(`parent_sku_id.in.(${parentIds.join(",")})`);
    }
    query = query.or(parts.join(","));
  }

  // ตอนค้นหา: ดึงผู้สมัครชุดหนึ่ง (120) แล้วจัดอันดับ "ตัวที่เหมือนที่สุด" ขึ้นก่อน (เป๊ะ-first) แทนเรียง code
  // ตอนไม่ค้น (ไล่ดู/กรอง): แบ่งหน้าที่ DB ตามปกติ (order + range) + id เป็นตัวตัดสินรองให้ลำดับนิ่ง
  const searching = tokens.length > 0;
  const { data, error, count } = searching
    ? await query.limit(120)
    : await query.order(orderCol, { ascending: sortAsc }).order("id", { ascending: true }).range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message }, { status: 500 });

  let rows = ((data ?? []) as unknown as SkuPickerRow[]).map(toPickerRow);

  if (searching) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]/gi, "");
    const S = norm(search);
    const nTokens = tokens.map(norm).filter(Boolean);
    const scoreOf = (r: { code: string; name: string }): number => {
      const code = norm(r.code), name = norm(r.name);
      if (S && code === S) return 1_000_000;
      if (S && code.startsWith(S)) return 900_000 - code.length;
      if (S && code.includes(S)) return 800_000 - code.length;
      let s = 0; nTokens.forEach((t, i) => { if (code.startsWith(t)) s += 200 - i * 5; else if (code.includes(t)) s += 120 - i * 5; else if (name.includes(t)) s += 40; });
      return s;
    };
    const ranked = rows.map((r) => ({ r, s: scoreOf(r) })).sort((a, b) => b.s - a.s || a.r.code.localeCompare(b.r.code, "th")).map((x) => x.r);
    const page = ranked.slice(offset, offset + limit);
    return NextResponse.json({ data: searchParams.get("with_taobao") === "1" ? await attachTaobao(request, page) : page, total: ranked.length, error: null });
  }

  if (searchParams.get("with_taobao") === "1") rows = await attachTaobao(request, rows);
  return NextResponse.json({ data: rows, total: count ?? rows.length, error: null });
}

/**
 * ★ 2026-11-27 ป้าย Taobao ในช่องค้นหาสินค้า (หน้าจัดซื้อ · SkuPicker showSourcing) — สินค้าที่จับคู่การ์ด Taobao แล้ว
 *   แนบ taobao: { url, price_rmb } · ราคา ¥ = ต้นทุน → เฉพาะคนที่มีสิทธิ์ดูต้นทุน (products.cost.view) · การ์ดที่ถูกปฏิเสธไม่นับ
 */
async function attachTaobao<T extends { id: string }>(request: NextRequest, rows: T[]): Promise<(T & { taobao: { url: string | null; price_rmb: number | null } | null })[]> {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows.map((r) => ({ ...r, taobao: null }));
  const [{ data }, canCost] = await Promise.all([
    supabaseAdmin().from("taobao_products").select("matched_sku_id, taobao_url, price_rmb, status, matched_at").in("matched_sku_id", ids).neq("status", "rejected").order("matched_at", { ascending: false }),
    apiCan(request, "products.cost.view"),
  ]);
  const by = new Map<string, { url: string | null; price_rmb: number | null }>();
  for (const t of (data ?? []) as Record<string, unknown>[]) {
    const k = String(t.matched_sku_id ?? ""); if (!k || by.has(k)) continue;
    const url = /^https?:\/\//i.test(String(t.taobao_url ?? "")) ? String(t.taobao_url) : null;
    const pr = Number(t.price_rmb);
    by.set(k, { url, price_rmb: canCost && Number.isFinite(pr) && pr > 0 ? pr : null });
  }
  return rows.map((r) => ({ ...r, taobao: by.get(r.id) ?? null }));
}

/** แถวฐานข้อมูล → แถวตัวเลือก (ใช้ทั้งค้นหา GET และหาจากรหัสหลายตัว POST) */
function toPickerRow(row: SkuPickerRow) {
    const uom = Array.isArray(row.uom) ? row.uom[0] : row.uom;
    const parent = Array.isArray(row.parent_skus_v2) ? row.parent_skus_v2[0] : row.parent_skus_v2;
    const cat = parent ? (Array.isArray(parent.product_categories) ? parent.product_categories[0] : parent.product_categories) : null;
    const code = row.code ?? "";
    const imageKey = row.cover_image_r2_key ?? parent?.cover_image_r2_key ?? null;
    return {
      id: row.id,
      code,
      barcode: row.barcode ?? null,
      name: row.name_th ?? code,
      uom_name: uom?.name ?? null,
      color: row.color_th ?? row.color ?? null,
      color_en: row.color ?? null,
      color_th: row.color_th ?? null,
      category: cat?.name ?? null,
      list_price: row.list_price,
      fake_price: row.fake_price,
      image_key: imageKey,
      sale_ok: row.sale_ok,
      // Parent ของ SKU นี้ — ให้หน้าคอนเทนต์เติม Parent SKU อัตโนมัติเมื่อเลือก SKU
      parent_sku_id: row.parent_sku_id ?? parent?.id ?? null,
      parent_code: parent?.code ?? null,
      parent_name: parent?.name_th ?? null,
    };
}

/**
 * POST { codes: string[] } — หาสินค้าจาก "รหัสหลายตัว" ทีเดียว (วางจาก Excel ในตัวเลือกหลาย SKU)
 * ตรงรหัส หรือ บาร์โค้ด (ไม่สนตัวพิมพ์เล็ก/ใหญ่) · สูงสุด 500 รหัส · ใช้ POST เพราะรหัสมี "#" ได้ (GET ตัด # ทิ้ง) และรายการยาว
 * คืน { data: แถวที่เจอ, missing: รหัสที่ไม่พบ }
 */
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { codes?: unknown; sales_only?: boolean };
  const raw = Array.isArray(body.codes) ? body.codes.map((c) => String(c ?? "").trim()).filter(Boolean) : [];
  const codes = [...new Set(raw)].slice(0, 500);
  if (!codes.length) return NextResponse.json({ data: [], missing: [], error: null });
  const variants = [...new Set(codes.flatMap((c) => [c, c.toUpperCase(), c.toLowerCase()]))];
  const sb = supabaseFromRequest(request);
  const select = `id, code, barcode, parent_sku_id, name_th, color, color_th, list_price, fake_price, cover_image_r2_key, sale_ok, is_active,
      parent_skus_v2 ( id, code, name_th, cover_image_r2_key, product_categories ( name ) ),
      uom:uoms!uom_id ( name )`;
  const found: SkuPickerRow[] = [];
  for (let i = 0; i < variants.length; i += 300) {
    const chunk = variants.slice(i, i + 300);
    const [byCode, byBarcode] = await Promise.all([
      sb.from("skus_v2").select(select).eq("is_active", true).in("code", chunk).limit(1000),
      sb.from("skus_v2").select(select).eq("is_active", true).in("barcode", chunk).limit(1000),
    ]);
    if (byCode.error) return NextResponse.json({ data: [], missing: [], error: byCode.error.message }, { status: 500 });
    found.push(...((byCode.data ?? []) as unknown as SkuPickerRow[]), ...((byBarcode.data ?? []) as unknown as SkuPickerRow[]));
  }
  let rows = [...new Map(found.map((r) => [r.id, r])).values()].map(toPickerRow);
  if (body.sales_only) rows = rows.filter((r) => r.sale_ok !== false);
  // เรียงตามลำดับที่วางมา + บอกรหัสที่ไม่พบ
  const key = (v: string | null | undefined) => String(v ?? "").toLowerCase();
  const out: typeof rows = [];
  const missing: string[] = [];
  const used = new Set<string>();
  for (const c of codes) {
    const hit = rows.find((r) => key(r.code) === key(c)) ?? rows.find((r) => key(r.barcode) === key(c));
    if (!hit) { missing.push(c); continue; }
    if (!used.has(hit.id)) { used.add(hit.id); out.push(hit); }
  }
  return NextResponse.json({ data: out, missing, error: null });
}
