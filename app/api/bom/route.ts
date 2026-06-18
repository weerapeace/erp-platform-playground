/**
 * BOM API — สูตรการผลิต (หัวสูตร + รายการวัตถุดิบในชุดเดียว)
 *
 * GET  /api/bom?search=&include_inactive=true   → list หัวสูตร + line_count
 * POST /api/bom                                  → สร้างสูตรใหม่ (header + lines)
 *
 * ของกลางตาม CLAUDE.md:
 *   - อ่านผ่าน supabaseFromRequest (authenticated, เคารพ RLS)
 *   - เขียนผ่าน supabaseAdmin (service-role) เหมือน master-v2
 *   - audit ลง audit_logs
 *
 * หมายเหตุ: bom_lines ผูกกับ bom_headers ด้วย bom_code (text) — สูตรหนึ่งเป็นเจ้าของ line ทั้งชุด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { saveBomSizes, lineToRow } from "./shared";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- Types ----

export type BomLine = {
  id?:             string;
  slot_code:       string | null;
  component_sku:   string | null;
  component_name:  string | null;
  qty:             number;
  uom:             string | null;
  waste_percent:   number | null;
  is_optional:     boolean;
  sequence:        number | null;
  source?:         string | null;
  odoo_bom_line_id?: number | null;
  // ชั้น 2: เครื่องคำนวณบล็อกตัด
  calc_mode?:      string | null;   // manual | block
  cut_block_id?:   number | null;
  cut_block_code?: string | null;
  pieces?:         number | null;
  cut_width?:      number | null;
  cut_length?:     number | null;
  face_width_cm?:  number | null;
  material_type?:  string | null;
  // เฟส 4: ผันตามไซส์
  size_variant?:   boolean;
  size_dim?:       string | null;                 // cut_length | cut_width | pieces | qty
  size_values?:    Record<string, number> | null; // { "40\"": 100, ... } คีย์ = ชื่อไซส์
};

export type BomSize = { label: string; sort?: number };

export type BomHeader = {
  id:             string;
  bom_code:       string;
  product_sku:    string | null;
  product_name:   string | null;
  version:        string | null;
  bom_type:       string | null;
  status:         string | null;
  effective_from: string | null;
  note:           string | null;
  source:         string | null;
  is_active:      boolean;
};

export type BomListItem = BomHeader & { line_count: number; product_image?: string | null };

// ---- audit helper (best effort — ไม่ให้ล้มงานหลัก) ----
async function audit(
  admin: ReturnType<typeof supabaseAdmin>,
  actorId: string | null,
  action: string,
  bomId: string | null,
  bomCode: string,
  extra: Record<string, unknown> = {},
) {
  await admin.from("audit_logs").insert({
    actor_user_id: actorId,
    action,
    entity_type: "bom",
    entity_id: bomId,
    metadata: { bom_code: bomCode, ...extra },
  }).then(() => {}, () => {});
}

// ---- GET — list headers + line_count ----
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const includeInactive = searchParams.get("include_inactive") === "true";
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const sortBy = searchParams.get("sort_by");
  const SAFE_COL = /^[a-z_][a-z0-9_]*$/i;
  // line_count คำนวณนอกตาราง → sort ไม่ได้ตรง ๆ, fallback updated_at
  const orderCol = sortBy && SAFE_COL.test(sortBy) && sortBy !== "line_count" ? sortBy : "updated_at";
  const orderAsc = sortBy ? searchParams.get("sort_dir") === "asc" : false;
  const supabase = supabaseFromRequest(request);

  let q = supabase
    .from("bom_headers")
    .select("id, bom_code, product_sku, product_name, version, bom_type, status, effective_from, note, source, is_active", { count: "exact" })
    .order(orderCol, { ascending: orderAsc })
    .range(offset, offset + limit - 1);
  if (!includeInactive) q = q.eq("is_active", true);
  if (search) {
    const term = `%${search}%`;
    q = q.or(`bom_code.ilike.${term},product_sku.ilike.${term},product_name.ilike.${term}`);
  }

  const { data: headers, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message }, { status: 500 });

  const rows = (headers ?? []) as BomHeader[];
  // นับจำนวนบรรทัดต่อสูตร ผ่าน RPC (group by ฝั่ง DB) — เลี่ยงเพดาน 1000 แถวที่ทำให้นับขาด
  const codes = rows.map((r) => r.bom_code).filter(Boolean);
  const counts = new Map<string, number>();
  if (codes.length > 0) {
    const { data: cntRows, error: cntErr } = await supabase.rpc("erp_bom_line_counts", { p_codes: codes });
    if (cntErr) console.error("[api/bom] line counts", cntErr.message);
    (cntRows as { bom_code: string; cnt: number }[] | null ?? []).forEach((c) => counts.set(c.bom_code, Number(c.cnt)));
  }

  // รูปสินค้า: หาจาก skus_v2 (cover เอง หรือของ parent) แล้ว fallback parent_skus_v2
  const skuCodes = [...new Set(rows.map((r) => r.product_sku).filter(Boolean))] as string[];
  const imgMap = new Map<string, string>();
  if (skuCodes.length > 0) {
    const { data: sk } = await supabase.from("skus_v2").select("code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", skuCodes);
    for (const s of (sk ?? []) as Record<string, unknown>[]) {
      const own = (s.cover_image_r2_key as string) || "";
      const par = (Array.isArray(s.parent_skus_v2) ? s.parent_skus_v2[0] : s.parent_skus_v2) as { cover_image_r2_key?: string | null } | null;
      const key = own || par?.cover_image_r2_key || "";
      if (key) imgMap.set(String(s.code), `/api/r2-image?key=${encodeURIComponent(key)}`);
    }
    const missing = skuCodes.filter((c) => !imgMap.has(c));
    if (missing.length > 0) {
      const { data: par } = await supabase.from("parent_skus_v2").select("code, cover_image_r2_key").in("code", missing);
      for (const p of (par ?? []) as Record<string, unknown>[]) {
        const key = (p.cover_image_r2_key as string) || "";
        if (key) imgMap.set(String(p.code), `/api/r2-image?key=${encodeURIComponent(key)}`);
      }
    }
  }

  const data: BomListItem[] = rows.map((r) => ({ ...r, line_count: counts.get(r.bom_code) ?? 0, product_image: r.product_sku ? imgMap.get(r.product_sku) ?? null : null }));
  return NextResponse.json({ data, total: count ?? data.length, error: null });
}

// ---- POST — create header + lines ----
type CreateBody = Partial<BomHeader> & { lines?: BomLine[]; sizes?: BomSize[]; actor?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const bomCode = (body.bom_code ?? "").trim();
  if (!bomCode) return NextResponse.json({ error: "ต้องระบุรหัสสูตร (bom_code)" }, { status: 400 });

  const admin = supabaseAdmin();

  // กันรหัสซ้ำ
  const { data: dup } = await admin.from("bom_headers").select("id").eq("bom_code", bomCode).maybeSingle();
  if (dup) return NextResponse.json({ error: `รหัสสูตร "${bomCode}" มีอยู่แล้ว` }, { status: 400 });

  const { data: header, error: hErr } = await admin.from("bom_headers").insert({
    bom_code:       bomCode,
    product_sku:    body.product_sku ?? null,
    product_name:   body.product_name ?? null,
    version:        body.version ?? "v1",
    bom_type:       body.bom_type ?? "normal",
    status:         body.status ?? "draft",
    effective_from: body.effective_from || null,
    note:           body.note ?? null,
    source:         "manual",
    is_active:      true,
  }).select("id, bom_code").single();

  if (hErr) return NextResponse.json({ error: friendlyDbError(hErr.message) }, { status: 400 });

  const lines = body.lines ?? [];
  if (lines.length > 0) {
    const { error: lErr } = await admin.from("bom_lines").insert(
      lines.map((l, i) => lineToRow(l, bomCode, i)),
    );
    if (lErr) {
      // rollback header เพื่อไม่ให้เหลือสูตรเปล่า
      await admin.from("bom_headers").delete().eq("id", header.id);
      return NextResponse.json({ error: friendlyDbError(lErr.message) }, { status: 400 });
    }
  }

  if (Array.isArray(body.sizes)) await saveBomSizes(admin, bomCode, body.sizes);

  await audit(admin, user.id, "create", header.id, bomCode, { line_count: lines.length });
  return NextResponse.json({ id: header.id, error: null });
}

// ---- shared: line payload → DB row ----
