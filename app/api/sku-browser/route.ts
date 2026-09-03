/**
 * GET /api/sku-browser
 *   - ไม่มี family_id & ไม่มี search → คืน "ต้นไม้แท็ก" (groups + tags + จำนวน SKU ต่อแท็ก)
 *   - มี family_id (หรือ search) → คืน "การ์ด SKU" (รูป/รหัส/ชื่อ/ราคาขาย/สต๊อก/สถานะ/แท็ก)
 *
 * อ่านของเดิมล้วน: product_family_groups (กลุ่ม, ซ้อนกลุ่มย่อย) · product_families (แท็ก)
 *   · skus_v2_product_family_m2m (src_id=sku, tgt_id=tag) · skus_v2 · sku_stock_balances
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi, apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BrowseGroup = { id: string; name: string; parent_group_id: string | null; icon: string | null; color: string | null; sort_order: number };
export type BrowseTag   = { id: string; name: string; group_id: string | null; sort_order: number; sku_count: number };
export type BrowseTree  = { groups: BrowseGroup[]; tags: BrowseTag[] };
export type SkuCard = {
  id: string; code: string; name: string; image: string | null;
  image_from_child?: boolean;   // รูปนี้มาจาก SKU ลูก (Parent ไม่มีรูปของตัวเอง) — ไว้ใส่ป้ายตัวอย่าง
  list_price: number | null; qty_on_hand: number | null; is_active: boolean; tags: string[];
  has_bom: boolean;   // มีสูตร BOM ไหม (ไว้เตือน "ข้อมูลไม่ครบ")
  variant_count?: number | null;     // จำนวน SKU ลูก (เฉพาะ Parent SKU — แทนราคา/สต๊อก)
  extra?: Record<string, unknown>;   // ฟิลด์เพิ่มที่เลือกโชว์บนการ์ด (จาก Field Registry — ไม่ hardcode)
  buy_price?: BuyPrice | null;       // ราคาซื้อล่าสุด — ส่งเฉพาะคนที่มีสิทธิ์ products.cost.view (บังคับฝั่ง server)
};
/** ราคาซื้อล่าสุดของ SKU — ลำดับแหล่ง: ใบ PO ล่าสุด → ราคาร้าน (supplier_items) ที่อัปเดตล่าสุด → ต้นทุนมาตรฐานใน SKU */
export type BuyPrice = {
  price: number; currency: string;
  source: "po" | "list" | "std";
  label: string;              // ข้อความบอกที่มา เช่น "PO-2026-0012 · 12 ส.ค. 69 · ร้าน X"
  date: string | null;        // วันที่ของราคานี้ (ISO) ถ้ามี
};

const sanitize = (t: string) => t.replace(/[,()%*]/g, " ").trim();

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const familyIds = (sp.get("family_ids") ?? sp.get("family_id") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const search   = (sp.get("search") ?? "").trim();
  const showAll  = sp.get("all") === "1";   // โหมด "ทั้งหมด/ล่าสุด" — โชว์ทุกรายการ (ไม่กรองแท็ก)
  const trash    = sp.get("trash") === "1"; // โหมดถังขยะ — โชว์เฉพาะที่ปิด/ลบแล้ว (is_active=false)
  const admin = supabaseAdmin();
  // ราคาซื้อ = ต้นทุน (sensitive) → ส่งเฉพาะคนที่มีสิทธิ์ดูต้นทุน (เช็คที่ server ไม่ใช่แค่ซ่อนที่หน้าจอ)
  const canCost = await apiCan(request, "products.cost.view");

  // entity: skus (ดีฟอลต์) หรือ parent-skus — สลับตาราง/junction/RPC (ใช้ของกลางตัวเดียว)
  const entity = sp.get("entity") === "parent-skus" ? "parent-skus" : "skus";
  const ENT = entity === "parent-skus"
    ? { table: "parent_skus_v2", junction: "parent_skus_v2_product_family_m2m", countsRpc: "erp_parent_family_counts", pageRpc: "erp_parent_skus_tag_page", moduleKey: "parent-skus-v2", hasPrice: false }
    : { table: "skus_v2", junction: "skus_v2_product_family_m2m", countsRpc: "erp_sku_family_counts", pageRpc: "erp_skus_tag_page", moduleKey: "skus-v2", hasPrice: true };

  // ── โหมดต้นไม้ ──
  if (familyIds.length === 0 && !search && !showAll && !trash) {
    const [gRes, tRes, mRes] = await Promise.all([
      admin.from("product_family_groups").select("id, name, parent_group_id, icon, color, sort_order").eq("is_active", true).order("sort_order"),
      admin.from("product_families").select("id, name, group_id, sort_order").eq("is_active", true).order("sort_order"),
      admin.rpc(ENT.countsRpc),   // นับฝั่ง DB (group by) เลี่ยงเพดาน 1,000 แถว — ตาม entity
    ]);
    const counts = new Map<string, number>();
    for (const r of (mRes.data ?? []) as { family_id: string; cnt: number }[]) counts.set(r.family_id, Number(r.cnt));
    const tags = ((tRes.data ?? []) as Omit<BrowseTag, "sku_count">[]).map((t) => ({ ...t, sku_count: counts.get(t.id) ?? 0 }));
    const tree: BrowseTree = { groups: (gRes.data ?? []) as BrowseGroup[], tags };
    return NextResponse.json({ tree, error: null });
  }

  // ── โหมด "ดึง id ทั้งหมดที่ตรงตัวกรอง" (สำหรับปุ่ม "เลือกทั้งหมด" ข้ามหน้า) ──
  // คืนแค่ id (เบา) ไม่ดึงรูป/แท็ก/สต๊อก — cap 10,000 (สอดคล้องเพดาน bulk-update กลาง)
  if (sp.get("ids") === "1") {
    const IDS_CAP = 10000;
    // ถังขยะ = ไม่ผ่าน RPC แท็ก (RPC ไม่มีโหมด "เฉพาะที่ปิด") → คิวรีตรงแทน
    if (familyIds.length && !trash) {
      const pageRpc = entity === "parent-skus" ? "erp_parent_skus_tag_page" : "erp_skus_tag_page";
      const { data: rpc, error } = await admin.rpc(pageRpc, {
        p_incl: familyIds, p_excl: null, p_search: search || null,
        p_include_inactive: false, p_limit: IDS_CAP, p_offset: 0, p_sort_by: "code", p_sort_dir: "asc",
      });
      if (error) return NextResponse.json({ ids: [], total: 0, error: error.message }, { status: 500 });
      return NextResponse.json({ ids: (rpc as { ids?: string[] } | null)?.ids ?? [], total: Number((rpc as { total?: number } | null)?.total ?? 0), error: null });
    }
    const tbl = entity === "parent-skus" ? "parent_skus_v2" : "skus_v2";
    let q = admin.from(tbl).select("id", { count: "exact" });
    // ปกติ: ซ่อนของในถังขยะ (is_active=null ถือว่าใช้งานอยู่ → ใช้ not is false) · ถังขยะ: เฉพาะที่ปิด
    q = trash ? q.eq("is_active", false) : q.not("is_active", "is", false);
    for (const raw of search.split(/\s+/)) { const t = sanitize(raw); if (t) q = q.or(`code.ilike.%${t}%,name_th.ilike.%${t}%`); }
    const { data, count, error } = await q.range(0, IDS_CAP - 1);
    if (error) return NextResponse.json({ ids: [], total: 0, error: error.message }, { status: 500 });
    return NextResponse.json({ ids: ((data ?? []) as { id: string }[]).map((r) => r.id), total: count ?? 0, error: null });
  }

  // ── โหมดการ์ด SKU ──
  const limit  = Math.min(Number(sp.get("limit") ?? 60) || 60, 120);
  const offset = Number(sp.get("offset") ?? 0) || 0;
  const ALLOWED_SORT = ["code", "name_th", "list_price", "created_at", "updated_at"];
  const sortBy  = ALLOWED_SORT.includes(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "code";
  const sortDir = sp.get("dir") === "desc" ? "desc" : "asc";

  type SkuRow = { id: string; code: string; name_th: string | null; cover_image_r2_key: string | null; list_price: number | null; is_active: boolean } & Record<string, unknown>;

  // ฟิลด์เพิ่มที่ขอโชว์บนการ์ด — whitelist กับ Field Registry (เฉพาะที่ visible + ไม่ sensitive)
  const CORE_COLS = new Set(["id", "code", "name_th", "list_price", "is_active", "cover_image_r2_key"]);
  const reqFields = (sp.get("fields") ?? "").split(",").map((s) => s.trim())
    .filter((f) => f && !CORE_COLS.has(f) && /^[a-z_][a-z0-9_]*$/i.test(f));
  let extraCols: string[] = [];
  if (reqFields.length) {
    const { data: mod } = await admin.from("erp_modules").select("id").eq("module_key", ENT.moduleKey).maybeSingle();
    if (mod?.id) {
      const { data: regCols } = await admin.from("erp_module_fields")
        .select("column_name, is_sensitive").eq("module_id", mod.id as string).eq("is_visible", true).not("column_name", "is", null);
      const allowed = new Set(((regCols ?? []) as { column_name: string | null; is_sensitive: boolean | null }[])
        .filter((r) => r.column_name && !r.is_sensitive).map((r) => r.column_name as string));
      extraCols = reqFields.filter((f) => allowed.has(f));
    }
  }
  const baseCols = "id, code, name_th, cover_image_r2_key, is_active" + (ENT.hasPrice ? ", list_price" : "")
    + (ENT.hasPrice && canCost ? ", standard_price, rmb_cost" : "");   // ต้นทุนมาตรฐาน = แหล่งสำรองของ "ราคาซื้อล่าสุด"
  const effSort = (!ENT.hasPrice && sortBy === "list_price") ? "code" : sortBy;   // parent ไม่มี list_price
  const sel = baseCols + (extraCols.length ? ", " + extraCols.join(", ") : "");
  let rows: SkuRow[] = [];
  let total = 0;

  if (familyIds.length && !trash) {
    // กรองแท็ก (หลายแท็ก = OR) ผ่าน RPC กลาง erp_skus_tag_page (EXISTS ที่ DB + แบ่งหน้า) — รองรับแท็กที่มี SKU เป็นพัน ไม่ส่ง id ยาวใน URL
    const { data: rpc, error: rpcErr } = await admin.rpc(ENT.pageRpc, {
      p_incl: familyIds, p_excl: null, p_search: search || null,
      p_include_inactive: false, p_limit: limit, p_offset: offset, p_sort_by: effSort, p_sort_dir: sortDir,
    });
    if (rpcErr) return NextResponse.json({ cards: [], total: 0, error: rpcErr.message }, { status: 500 });
    const pageIds = (rpc as { ids?: string[] } | null)?.ids ?? [];
    total = Number((rpc as { total?: number } | null)?.total ?? 0);
    if (pageIds.length === 0) return NextResponse.json({ cards: [], total, error: null });
    const { data: skus, error } = await admin.from(ENT.table).select(sel).in("id", pageIds);
    if (error) return NextResponse.json({ cards: [], total: 0, error: error.message }, { status: 500 });
    const order = new Map(pageIds.map((id, i) => [id, i]));
    rows = ((skus ?? []) as unknown as SkuRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } else {
    // ค้นหาอย่างเดียว (ไม่มีแท็ก) / โหมดถังขยะ — search จำกัดผลอยู่แล้ว
    let q = admin.from(ENT.table).select(sel, { count: "exact" });
    // ปกติ: ซ่อนของในถังขยะ (is_active=null ถือว่าใช้งานอยู่) · ถังขยะ: เฉพาะที่ปิด
    q = trash ? q.eq("is_active", false) : q.not("is_active", "is", false);
    for (const raw of search.split(/\s+/)) { const t = sanitize(raw); if (t) q = q.or(`code.ilike.%${t}%,name_th.ilike.%${t}%`); }
    q = q.order(effSort, { ascending: sortDir === "asc" }).range(offset, offset + limit - 1);
    const { data: skus, count, error } = await q;
    if (error) return NextResponse.json({ cards: [], total: 0, error: error.message }, { status: 500 });
    rows = (skus ?? []) as unknown as SkuRow[];
    total = count ?? rows.length;
  }

  const ids   = rows.map((r) => r.id);
  const codes = rows.map((r) => r.code).filter(Boolean);

  const stock   = new Map<string, number>();
  const bomSet  = new Set<string>();
  const tagMap  = new Map<string, string[]>();
  const variant = new Map<string, number>();   // จำนวน SKU ลูก ต่อ Parent
  const childCover = new Map<string, string>();   // รูปปกของ SKU ลูกตัวแรก (fallback ตอน Parent ไม่มีรูป)
  const buyMap = new Map<string, BuyPrice>();     // ราคาซื้อล่าสุด ต่อ SKU (เฉพาะ canCost)

  if (ids.length) {
    let linkData: { src_id: string; tgt_id: string }[] = [];
    if (ENT.hasPrice) {
      type PoLine = { item_sku_id: string; price_est: number | string; currency: string | null; created_at: string; po_id: string | null };
      type SupItem = { item_sku_id: string; price: number | string; currency: string | null; updated_at: string | null; is_default: boolean | null; supplier_partner: string | null };
      const [linkRes, balRes, bomRes, poRes, siRes] = await Promise.all([
        admin.from(ENT.junction).select("src_id, tgt_id").in("src_id", ids),
        admin.from("sku_stock_balances").select("sku_id, qty_on_hand").in("sku_id", ids),
        admin.from("bom_headers").select("product_sku").in("product_sku", codes),
        // ราคาซื้อจริงจากบรรทัด PO (ทุกสถานะ ยกเว้นที่ปิดใช้งาน) — ใหม่สุดก่อน
        canCost ? admin.from("purchase_order_lines_v2").select("item_sku_id, price_est, currency, created_at, po_id")
          .in("item_sku_id", ids).gt("price_est", 0).not("is_active", "is", false).order("created_at", { ascending: false })
          : Promise.resolve({ data: null }),
        // ราคาจาก price list ร้านค้า — อัปเดตล่าสุดก่อน
        canCost ? admin.from("supplier_items").select("item_sku_id, price, currency, updated_at, is_default, supplier_partner")
          .in("item_sku_id", ids).gt("price", 0).not("is_active", "is", false).order("updated_at", { ascending: false })
          : Promise.resolve({ data: null }),
      ]);
      linkData = (linkRes.data ?? []) as { src_id: string; tgt_id: string }[];
      for (const b of ((balRes.data ?? []) as { sku_id: string; qty_on_hand: number | string | null }[])) stock.set(b.sku_id, Number(b.qty_on_hand ?? 0));
      for (const b of ((bomRes.data ?? []) as { product_sku: string }[])) bomSet.add(b.product_sku);

      if (canCost) {
        const thDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
        // 1) PO ล่าสุด — ยึดวันที่ใบ PO (order_date) ถ้าไม่มีใช้วันที่สร้างบรรทัด
        const poLines = (poRes.data ?? []) as PoLine[];
        const poIds = [...new Set(poLines.map((l) => l.po_id).filter((x): x is string => !!x))];
        const poHead = new Map<string, { po_no: string | null; order_date: string | null; seller_name: string | null }>();
        if (poIds.length) {
          const { data: pos } = await admin.from("purchase_orders_v2").select("id, po_no, order_date, seller_name").in("id", poIds);
          for (const p of (pos ?? []) as { id: string; po_no: string | null; order_date: string | null; seller_name: string | null }[]) poHead.set(p.id, p);
        }
        const best = new Map<string, { at: number; bp: BuyPrice }>();
        for (const l of poLines) {
          const h = l.po_id ? poHead.get(l.po_id) : undefined;
          const dateIso = h?.order_date ?? l.created_at;
          const at = new Date(dateIso).getTime() || 0;
          const cur = best.get(l.item_sku_id);
          if (cur && cur.at >= at) continue;
          best.set(l.item_sku_id, { at, bp: {
            price: Number(l.price_est), currency: l.currency ?? "THB", source: "po", date: dateIso,
            label: [h?.po_no ? `ใบ ${h.po_no}` : "ใบ PO", thDate(dateIso), h?.seller_name].filter(Boolean).join(" · "),
          } });
        }
        for (const [id, v] of best) buyMap.set(id, v.bp);
        // 2) ไม่มี PO → ราคาร้าน (เรียง updated_at ใหม่สุดมาก่อนแล้ว · ร้านหลัก is_default ชนะถ้าวันเดียวกัน)
        for (const s of ((siRes.data ?? []) as SupItem[])) {
          if (buyMap.has(s.item_sku_id)) continue;
          buyMap.set(s.item_sku_id, {
            price: Number(s.price), currency: s.currency ?? "THB", source: "list", date: s.updated_at,
            label: ["ราคาร้าน", s.supplier_partner, thDate(s.updated_at)].filter(Boolean).join(" · "),
          });
        }
        // 3) ไม่มีทั้งคู่ → ต้นทุนมาตรฐานใน SKU (standard_price บาท / rmb_cost หยวน)
        for (const r of rows) {
          if (buyMap.has(r.id)) continue;
          const std = Number(r.standard_price ?? 0), rmb = Number(r.rmb_cost ?? 0);
          if (std > 0) buyMap.set(r.id, { price: std, currency: "THB", source: "std", date: null, label: "ต้นทุนมาตรฐาน (Standard Price ใน SKU)" });
          else if (rmb > 0) buyMap.set(r.id, { price: rmb, currency: "RMB", source: "std", date: null, label: "ต้นทุนมาตรฐาน (RMB Cost ใน SKU)" });
        }
      }
    } else {
      const [linkRes, varRes] = await Promise.all([
        admin.from(ENT.junction).select("src_id, tgt_id").in("src_id", ids),
        admin.from("skus_v2").select("parent_sku_id, cover_image_r2_key").in("parent_sku_id", ids).order("code", { ascending: true }),   // นับ SKU ลูก + รูปปกลูกตัวแรก
      ]);
      linkData = (linkRes.data ?? []) as { src_id: string; tgt_id: string }[];
      for (const v of ((varRes.data ?? []) as { parent_sku_id: string | null; cover_image_r2_key: string | null }[])) if (v.parent_sku_id) {
        variant.set(v.parent_sku_id, (variant.get(v.parent_sku_id) ?? 0) + 1);
        if (v.cover_image_r2_key && !childCover.has(v.parent_sku_id)) childCover.set(v.parent_sku_id, v.cover_image_r2_key);   // ลูกตัวแรก (เรียงตาม code) ที่มีรูป
      }
    }

    // ชื่อแท็ก (m2m → product_families.name)
    const tgtIds = [...new Set(linkData.map((l) => l.tgt_id))];
    if (tgtIds.length) {
      const { data: fams } = await admin.from("product_families").select("id, name").in("id", tgtIds);
      const nameById = new Map<string, string>();
      for (const f of (fams ?? []) as { id: string; name: string }[]) nameById.set(f.id, f.name);
      for (const l of linkData) {
        const name = nameById.get(l.tgt_id); if (!name) continue;
        const arr = tagMap.get(l.src_id) ?? []; arr.push(name); tagMap.set(l.src_id, arr);
      }
    }
  }

  const cards: SkuCard[] = rows.map((r) => {
    // Parent ไม่มีรูปของตัวเอง → ใช้รูปปกของ SKU ลูกตัวแรกเป็น preview
    const coverKey = r.cover_image_r2_key || (ENT.hasPrice ? null : childCover.get(r.id) ?? null);
    const imageFromChild = !r.cover_image_r2_key && !!coverKey;
    return {
    id: r.id, code: r.code, name: (r.name_th as string) ?? "",
    image: coverKey ? `/api/r2-image?key=${encodeURIComponent(coverKey)}` : null,
    image_from_child: imageFromChild,
    list_price: ENT.hasPrice ? (r.list_price ?? null) : null,
    qty_on_hand: ENT.hasPrice ? (stock.has(r.id) ? (stock.get(r.id) as number) : null) : null,
    variant_count: ENT.hasPrice ? null : (variant.get(r.id) ?? 0),
    is_active: r.is_active, tags: tagMap.get(r.id) ?? [], has_bom: ENT.hasPrice ? bomSet.has(r.code) : false,
    extra: extraCols.length ? Object.fromEntries(extraCols.map((col) => [col, r[col] ?? null])) : undefined,
    buy_price: canCost && ENT.hasPrice ? (buyMap.get(r.id) ?? null) : undefined,
    };
  });
  return NextResponse.json({ cards, total, cost_allowed: canCost && ENT.hasPrice, error: null });
}
