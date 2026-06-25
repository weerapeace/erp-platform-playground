/**
 * GET /api/sku-browser
 *   - ไม่มี family_id & ไม่มี search → คืน "ต้นไม้แท็ก" (groups + tags + จำนวน SKU ต่อแท็ก)
 *   - มี family_id (หรือ search) → คืน "การ์ด SKU" (รูป/รหัส/ชื่อ/ราคาขาย/สต๊อก/สถานะ/แท็ก)
 *
 * อ่านของเดิมล้วน: product_family_groups (กลุ่ม, ซ้อนกลุ่มย่อย) · product_families (แท็ก)
 *   · skus_v2_product_family_m2m (src_id=sku, tgt_id=tag) · skus_v2 · sku_stock_balances
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BrowseGroup = { id: string; name: string; parent_group_id: string | null; icon: string | null; color: string | null; sort_order: number };
export type BrowseTag   = { id: string; name: string; group_id: string | null; sort_order: number; sku_count: number };
export type BrowseTree  = { groups: BrowseGroup[]; tags: BrowseTag[] };
export type SkuCard = {
  id: string; code: string; name: string; image: string | null;
  list_price: number | null; qty_on_hand: number | null; is_active: boolean; tags: string[];
  has_bom: boolean;   // มีสูตร BOM ไหม (ไว้เตือน "ข้อมูลไม่ครบ")
  extra?: Record<string, unknown>;   // ฟิลด์เพิ่มที่เลือกโชว์บนการ์ด (จาก Field Registry — ไม่ hardcode)
};

const sanitize = (t: string) => t.replace(/[,()%*]/g, " ").trim();

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const familyIds = (sp.get("family_ids") ?? sp.get("family_id") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const search   = (sp.get("search") ?? "").trim();
  const admin = supabaseAdmin();

  // ── โหมดต้นไม้ ──
  if (familyIds.length === 0 && !search) {
    const [gRes, tRes, mRes] = await Promise.all([
      admin.from("product_family_groups").select("id, name, parent_group_id, icon, color, sort_order").eq("is_active", true).order("sort_order"),
      admin.from("product_families").select("id, name, group_id, sort_order").eq("is_active", true).order("sort_order"),
      admin.from("skus_v2_product_family_m2m").select("tgt_id"),
    ]);
    const counts = new Map<string, number>();
    for (const r of (mRes.data ?? []) as { tgt_id: string }[]) counts.set(r.tgt_id, (counts.get(r.tgt_id) ?? 0) + 1);
    const tags = ((tRes.data ?? []) as Omit<BrowseTag, "sku_count">[]).map((t) => ({ ...t, sku_count: counts.get(t.id) ?? 0 }));
    const tree: BrowseTree = { groups: (gRes.data ?? []) as BrowseGroup[], tags };
    return NextResponse.json({ tree, error: null });
  }

  // ── โหมดการ์ด SKU ──
  const limit  = Math.min(Number(sp.get("limit") ?? 60) || 60, 120);
  const offset = Number(sp.get("offset") ?? 0) || 0;
  const ALLOWED_SORT = ["code", "name_th", "list_price", "created_at"];
  const sortBy  = ALLOWED_SORT.includes(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "code";
  const sortDir = sp.get("dir") === "desc" ? "desc" : "asc";

  type SkuRow = { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null; list_price: number | null; is_active: boolean } & Record<string, unknown>;

  // ฟิลด์เพิ่มที่ขอโชว์บนการ์ด — whitelist กับ Field Registry (เฉพาะที่ visible + ไม่ sensitive)
  const CORE_COLS = new Set(["id", "code", "name_th", "list_price", "is_active", "cover_image_r2_key"]);
  const reqFields = (sp.get("fields") ?? "").split(",").map((s) => s.trim())
    .filter((f) => f && !CORE_COLS.has(f) && /^[a-z_][a-z0-9_]*$/i.test(f));
  let extraCols: string[] = [];
  if (reqFields.length) {
    const { data: mod } = await admin.from("erp_modules").select("id").eq("module_key", "skus-v2").maybeSingle();
    if (mod?.id) {
      const { data: regCols } = await admin.from("erp_module_fields")
        .select("column_name, is_sensitive").eq("module_id", mod.id as string).eq("is_visible", true).not("column_name", "is", null);
      const allowed = new Set(((regCols ?? []) as { column_name: string | null; is_sensitive: boolean | null }[])
        .filter((r) => r.column_name && !r.is_sensitive).map((r) => r.column_name as string));
      extraCols = reqFields.filter((f) => allowed.has(f));
    }
  }
  const sel = "id, code, name_th, cover_image_r2_key, list_price, is_active" + (extraCols.length ? ", " + extraCols.join(", ") : "");
  let rows: SkuRow[] = [];
  let total = 0;

  if (familyIds.length) {
    // กรองแท็ก (หลายแท็ก = OR) ผ่าน RPC กลาง erp_skus_tag_page (EXISTS ที่ DB + แบ่งหน้า) — รองรับแท็กที่มี SKU เป็นพัน ไม่ส่ง id ยาวใน URL
    const { data: rpc, error: rpcErr } = await admin.rpc("erp_skus_tag_page", {
      p_incl: familyIds, p_excl: null, p_search: search || null,
      p_include_inactive: true, p_limit: limit, p_offset: offset, p_sort_by: sortBy, p_sort_dir: sortDir,
    });
    if (rpcErr) return NextResponse.json({ cards: [], total: 0, error: rpcErr.message }, { status: 500 });
    const pageIds = (rpc as { ids?: string[] } | null)?.ids ?? [];
    total = Number((rpc as { total?: number } | null)?.total ?? 0);
    if (pageIds.length === 0) return NextResponse.json({ cards: [], total, error: null });
    const { data: skus, error } = await admin.from("skus_v2").select(sel).in("id", pageIds);
    if (error) return NextResponse.json({ cards: [], total: 0, error: error.message }, { status: 500 });
    const order = new Map(pageIds.map((id, i) => [id, i]));
    rows = ((skus ?? []) as unknown as SkuRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } else {
    // ค้นหาอย่างเดียว (ไม่มีแท็ก) — search จำกัดผลอยู่แล้ว
    let q = admin.from("skus_v2").select(sel, { count: "exact" });
    for (const raw of search.split(/\s+/)) { const t = sanitize(raw); if (t) q = q.or(`code.ilike.%${t}%,name_th.ilike.%${t}%`); }
    q = q.order(sortBy, { ascending: sortDir === "asc" }).range(offset, offset + limit - 1);
    const { data: skus, count, error } = await q;
    if (error) return NextResponse.json({ cards: [], total: 0, error: error.message }, { status: 500 });
    rows = (skus ?? []) as unknown as SkuRow[];
    total = count ?? rows.length;
  }

  const ids   = rows.map((r) => r.id);
  const codes = rows.map((r) => r.code).filter(Boolean);

  const stock  = new Map<string, number>();
  const bomSet = new Set<string>();
  const tagMap = new Map<string, string[]>();

  if (ids.length) {
    // ยิงขนาน: สต๊อก + ลิงก์แท็ก + BOM (เร็วกว่ารอทีละ query)
    const [balRes, linkRes, bomRes] = await Promise.all([
      admin.from("sku_stock_balances").select("sku_id, qty_on_hand").in("sku_id", ids),
      admin.from("skus_v2_product_family_m2m").select("src_id, tgt_id").in("src_id", ids),
      admin.from("bom_headers").select("product_sku").in("product_sku", codes),
    ]);
    for (const b of (balRes.data ?? []) as { sku_id: string; qty_on_hand: number | string | null }[]) stock.set(b.sku_id, Number(b.qty_on_hand ?? 0));
    for (const b of (bomRes.data ?? []) as { product_sku: string }[]) bomSet.add(b.product_sku);

    // ชื่อแท็ก: query เพิ่มหลังได้ลิงก์ (m2m → product_families.name)
    const linkRows = (linkRes.data ?? []) as { src_id: string; tgt_id: string }[];
    const tgtIds = [...new Set(linkRows.map((l) => l.tgt_id))];
    if (tgtIds.length) {
      const { data: fams } = await admin.from("product_families").select("id, name").in("id", tgtIds);
      const nameById = new Map<string, string>();
      for (const f of (fams ?? []) as { id: string; name: string }[]) nameById.set(f.id, f.name);
      for (const l of linkRows) {
        const name = nameById.get(l.tgt_id); if (!name) continue;
        const arr = tagMap.get(l.src_id) ?? []; arr.push(name); tagMap.set(l.src_id, arr);
      }
    }
  }

  const cards: SkuCard[] = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name_th ?? "",
    image: r.cover_image_r2_key ? `/api/r2-image?key=${encodeURIComponent(r.cover_image_r2_key)}` : null,
    list_price: r.list_price, qty_on_hand: stock.has(r.id) ? (stock.get(r.id) as number) : null,
    is_active: r.is_active, tags: tagMap.get(r.id) ?? [], has_bom: bomSet.has(r.code),
    extra: extraCols.length ? Object.fromEntries(extraCols.map((col) => [col, r[col] ?? null])) : undefined,
  }));
  return NextResponse.json({ cards, total, error: null });
}
