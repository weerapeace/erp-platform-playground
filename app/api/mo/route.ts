/**
 * MO API — ใบสั่งผลิต (Manufacturing Order) เฟส A
 *
 * GET  /api/mo?search=&limit=&offset=&sort_by=  → list (server mode)
 * POST /api/mo                                   → สร้าง MO (เลขรันอัตโนมัติ) + กางสูตรเป็น mo_materials
 *
 * อ่านผ่าน auth, เขียนผ่าน supabaseAdmin, audit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MoListItem = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; status: string | null; due_date: string | null;
  bom_code: string | null; bom_version: string | null; is_active: boolean;
};

export type MoMaterial = {
  id?: string; component_sku: string | null; component_name: string | null; material_type: string | null;
  qty_per: number | null; required_qty: number | null; uom: string | null;
  on_hand_qty: number; to_purchase_qty: number | null; is_ready: boolean; sequence: number | null;
};

/** กางสูตร: ดึง bom_lines ของ bomCode → insert mo_materials (required = qty_per × moQty) */
export async function explodeBom(admin: ReturnType<typeof supabaseAdmin>, bomCode: string | null, moNo: string, moQty: number) {
  await admin.from("mo_materials").delete().eq("mo_no", moNo);
  await admin.from("mo_material_summary").delete().eq("mo_no", moNo);
  if (!bomCode) return;
  const { data: lines } = await admin.from("bom_lines").select("*").eq("bom_code", bomCode).eq("is_active", true)
    .order("sequence", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
  const rows = (lines ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return;

  // ดึง "ประเภท" (กลุ่มวัตถุดิบ) จาก SKU ของแต่ละ component
  const codes = [...new Set(rows.map((l) => l.component_sku).filter(Boolean) as string[])];
  const typeMap = new Map<string, string>();
  if (codes.length > 0) {
    const { data: skus } = await admin.from("skus_v2").select("code, grp:material_groups!material_group_id ( name )").in("code", codes);
    for (const s of (skus ?? []) as Array<Record<string, unknown>>) {
      const g = (Array.isArray(s.grp) ? s.grp[0] : s.grp) as { name?: string } | null;
      if (g?.name) typeMap.set(String(s.code), g.name);
    }
  }

  const mats = rows.map((l, i) => {
    const qtyPer = Number(l.qty) || 0;
    const sku = (l.component_sku as string) ?? null;
    return {
      mo_no: moNo,
      component_sku:  sku,
      component_name: (l.component_name as string) ?? null,
      material_type:  (sku && typeMap.get(sku)) || (l.material_type as string) || null,
      qty_per:        qtyPer,
      required_qty:   Math.round(qtyPer * (moQty || 0) * 10000) / 10000,
      uom:            (l.uom as string) ?? null,
      cut_block_code: (l.cut_block_code as string) ?? null,
      cut_width:      l.cut_width != null ? Number(l.cut_width) : null,
      cut_length:     l.cut_length != null ? Number(l.cut_length) : null,
      pieces:         l.pieces != null ? Number(l.pieces) : null,
      sequence:       (l.sequence as number) ?? i + 1,
      is_active:      true,
    };
  });
  await admin.from("mo_materials").insert(mats);

  // สรุปต่อวัตถุดิบ (รวมตัวเดียวกันจากหลายบล็อก)
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const byKey = new Map<string, { sku: string | null; name: string | null; type: string | null; uom: string | null; qtyPer: number }>();
  for (const m of mats) {
    const k = m.component_sku ?? "∅";
    const e = byKey.get(k);
    if (e) e.qtyPer += m.qty_per || 0;
    else byKey.set(k, { sku: m.component_sku, name: m.component_name, type: m.material_type, uom: m.uom, qtyPer: m.qty_per || 0 });
  }
  const sumRows = [...byKey.values()].map((e, i) => ({
    mo_no: moNo, component_sku: e.sku, component_name: e.name, material_type: e.type, uom: e.uom,
    qty_per: r4(e.qtyPer), required_qty: r4(e.qtyPer * (moQty || 0)),
    on_hand_qty: 0, to_purchase_qty: r4(e.qtyPer * (moQty || 0)), is_ready: false, sequence: i + 1, is_active: true,
  }));
  if (sumRows.length > 0) await admin.from("mo_material_summary").insert(sumRows);
}

async function nextMoNo(admin: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "mo" });
  if (!error && data) return String(data);
  // fallback กันพลาด
  const yr = new Date().getFullYear();
  const { count } = await admin.from("manufacturing_orders").select("id", { count: "exact", head: true });
  return `MO-${yr}-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

// ---- GET list ----
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const sortBy = searchParams.get("sort_by");
  const SAFE = /^[a-z_][a-z0-9_]*$/i;
  const orderCol = sortBy && SAFE.test(sortBy) ? sortBy : "updated_at";
  const orderAsc = sortBy ? searchParams.get("sort_dir") === "asc" : false;

  let q = supabaseFromRequest(request)
    .from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, status, due_date, bom_code, bom_version, is_active", { count: "exact" })
    .eq("is_active", true)
    .order(orderCol, { ascending: orderAsc })
    .range(offset, offset + limit - 1);
  if (search) { const t = `%${search}%`; q = q.or(`mo_no.ilike.${t},product_sku.ilike.${t},product_name.ilike.${t}`); }

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as MoListItem[], total: count ?? 0, error: null });
}

// ---- POST create ----
type CreateBody = {
  product_sku?: string; product_name?: string; qty?: number; due_date?: string | null;
  bom_code?: string | null; bom_version?: string | null; status?: string; note?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.product_sku) return NextResponse.json({ error: "ต้องเลือกสินค้า" }, { status: 400 });
  const qty = Number(body.qty) || 0;
  if (qty <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });

  const admin = supabaseAdmin();
  const moNo = await nextMoNo(admin);
  const { data: mo, error } = await admin.from("manufacturing_orders").insert({
    mo_no: moNo, product_sku: body.product_sku, product_name: body.product_name ?? null, qty,
    status: body.status || "draft", due_date: body.due_date || null,
    bom_code: body.bom_code ?? null, bom_version: body.bom_version ?? null, note: body.note ?? null, is_active: true,
  }).select("id, mo_no").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await explodeBom(admin, body.bom_code ?? null, moNo, qty);  // กางสูตรตอนบันทึก (เผื่อยังไม่ได้กด)
  await admin.from("audit_logs").insert({ actor_user_id: user.id, action: "create", entity_type: "mo", entity_id: mo.id, metadata: { mo_no: moNo, qty } }).then(() => {}, () => {});
  return NextResponse.json({ id: mo.id, mo_no: moNo, error: null });
}
