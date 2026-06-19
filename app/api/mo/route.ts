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
import { guardApi } from "@/lib/api-auth";
import { explodeBom, type SizeQty } from "./shared";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MoListItem = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; status: string | null; due_date: string | null;
  bom_code: string | null; bom_version: string | null; is_active: boolean;
  product_image?: string | null;   // รูปสินค้า (เติมในตอน list)
  group_name?: string | null;      // ชื่อกลุ่มใบสั่งงานที่ใบนี้อยู่ (เติมในตอน list)
};

export type MoMaterial = {
  id?: string; component_sku: string | null; component_name: string | null; material_type: string | null;
  qty_per: number | null; required_qty: number | null; uom: string | null;
  on_hand_qty: number; to_purchase_qty: number | null; is_ready: boolean; sequence: number | null;
};

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
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const sortBy = searchParams.get("sort_by");
  const SAFE = /^[a-z_][a-z0-9_]*$/i;
  const orderCol = sortBy && SAFE.test(sortBy) ? sortBy : "updated_at";
  const orderAsc = sortBy ? searchParams.get("sort_dir") === "asc" : false;

  const groupStatus = searchParams.get("group_status");   // ungrouped | grouped
  // กลุ่มใบสั่งงาน (ชื่อกลุ่ม/เซ็ตที่จับแล้ว) — เริ่มยิงไว้ก่อน แล้วค่อยรวมผล
  const groupsPromise = supabaseAdmin().from("mo_groups").select("name, mo_nos").eq("is_active", true);

  let q = supabaseFromRequest(request)
    .from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, status, due_date, bom_code, bom_version, is_active", { count: "exact" })
    .eq("is_active", true)
    .order(orderCol, { ascending: orderAsc })
    .range(offset, offset + limit - 1);
  if (search) { const t = `%${search}%`; q = q.or(`mo_no.ilike.${t},product_sku.ilike.${t},product_name.ilike.${t}`); }

  // ถ้ากรองตามกลุ่ม ต้องรู้กลุ่มก่อนรันรายการ · ถ้าไม่กรอง ยิงขนานกัน (เร็วกว่า 1 รอบ)
  type GroupRow = { name: string; mo_nos: unknown };
  let groups: GroupRow[] | null;
  let listRes: Awaited<typeof q>;
  if (groupStatus === "ungrouped" || groupStatus === "grouped") {
    groups = (await groupsPromise).data as GroupRow[] | null;
    const gset = new Set<string>();
    for (const g of groups ?? []) for (const mn of (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[]) gset.add(String(mn));
    if (groupStatus === "ungrouped" && gset.size > 0) q = q.not("mo_no", "in", `(${[...gset].map((n) => `"${n}"`).join(",")})`);
    else if (groupStatus === "grouped") q = q.in("mo_no", gset.size > 0 ? [...gset] : ["__none__"]);
    listRes = await q;
  } else {
    const [gp, lr] = await Promise.all([groupsPromise, q]);
    groups = gp.data as GroupRow[] | null; listRes = lr;
  }
  const { data, error, count } = listRes;
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message }, { status: 500 });

  const groupNameByMo = new Map<string, string>();
  for (const g of groups ?? []) for (const mn of (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[]) { const k = String(mn); if (!groupNameByMo.has(k)) groupNameByMo.set(k, g.name); }

  // เติมรูปสินค้าต่อแถว (รูป SKU ก่อน, fallback Parent) — เพื่อโชว์ในหน้า MO list
  const rows = (data ?? []) as MoListItem[];
  const codes = [...new Set(rows.map((r) => r.product_sku).filter(Boolean))] as string[];
  const imgMap = new Map<string, string>();
  if (codes.length) {
    const { data: skus } = await supabaseFromRequest(request)
      .from("skus_v2").select("code, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("code", codes);
    for (const s of (skus ?? []) as Record<string, unknown>[]) {
      const parRel = s.parent_skus_v2;
      const par = (Array.isArray(parRel) ? parRel[0] : parRel) as { cover_image_r2_key?: string | null } | null;
      const key = (s.cover_image_r2_key as string | null) || par?.cover_image_r2_key || "";
      if (key) imgMap.set(String(s.code), `/api/r2-image?key=${encodeURIComponent(key)}`);
    }
  }
  const withImg = rows.map((r) => ({ ...r, product_image: r.product_sku ? (imgMap.get(r.product_sku) ?? null) : null, group_name: groupNameByMo.get(String(r.mo_no)) ?? null }));
  return NextResponse.json({ data: withImg, total: count ?? 0, error: null });
}

// ---- POST create ----
type CreateBody = {
  product_sku?: string; product_name?: string; qty?: number; due_date?: string | null;
  bom_code?: string | null; bom_version?: string | null; status?: string; note?: string;
  size_breakdown?: SizeQty[] | null;   // กลุ่ม C: แบ่งจำนวนตามไซส์
};

// ทำความสะอาด size_breakdown — เก็บเฉพาะไซส์ที่มีจำนวน > 0
function cleanSizes(raw: unknown): SizeQty[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .map((s) => ({ label: String((s as { label?: unknown })?.label ?? "").trim(), qty: Number((s as { qty?: unknown })?.qty) || 0 }))
    .filter((s) => s.label && s.qty > 0);
  return out.length > 0 ? out : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.product_sku) return NextResponse.json({ error: "ต้องเลือกสินค้า" }, { status: 400 });
  const sizeBreakdown = cleanSizes(body.size_breakdown);
  // มีไซส์ → จำนวนรวม = ผลบวกทุกไซส์ · ไม่มีไซส์ → ใช้ qty ที่ส่งมา
  const qty = sizeBreakdown ? sizeBreakdown.reduce((a, s) => a + s.qty, 0) : (Number(body.qty) || 0);
  if (qty <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });

  const admin = supabaseAdmin();
  const moNo = await nextMoNo(admin);
  const { data: mo, error } = await admin.from("manufacturing_orders").insert({
    mo_no: moNo, product_sku: body.product_sku, product_name: body.product_name ?? null, qty,
    status: body.status || "draft", due_date: body.due_date || null,
    bom_code: body.bom_code ?? null, bom_version: body.bom_version ?? null, note: body.note ?? null, is_active: true,
    size_breakdown: sizeBreakdown,
  }).select("id, mo_no").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await explodeBom(admin, body.bom_code ?? null, moNo, qty, sizeBreakdown);  // กางสูตรตอนบันทึก (เผื่อยังไม่ได้กด)
  await admin.from("audit_logs").insert({ actor_user_id: user.id, action: "create", entity_type: "mo", entity_id: mo.id, metadata: { mo_no: moNo, qty } }).then(() => {}, () => {});
  return NextResponse.json({ id: mo.id, mo_no: moNo, error: null });
}
