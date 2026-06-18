/**
 * Design Sheets API — ใบงานออกแบบสินค้าใหม่ (เฟส 1)
 *
 * GET  /api/design-sheets?search=&status=&brand_id=&archived=&limit=&offset=&sort_by=&sort_dir=
 *      → list (server mode) + รูปหลักจากระบบแนบไฟล์กลาง (erp_playground_attachments)
 * POST /api/design-sheets → สร้างใบงาน (เลขรันอัตโนมัติ DS-{YYYY}-{0000})
 *
 * ของกลาง: guardApi (products.view/products.edit) + writeAudit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { isValidDsStatus } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DesignSheetListItem = {
  id: string; code: string; name: string;
  brand_id: string | null; brand_name: string | null; brand_color: string | null;
  status: string; order_date: string | null; deadline: string | null;
  drive_link: string | null; note: string | null; is_active: boolean;
  updated_at: string; cover_url: string | null;
};

async function nextDsNo(admin: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "ds" });
  if (!error && data) return String(data);
  // fallback กันพลาด
  const yr = new Date().getFullYear();
  const { count } = await admin.from("design_sheets").select("id", { count: "exact", head: true });
  return `DS-${yr}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

/** รูปหลักของแต่ละใบงาน — เลือก is_primary ก่อน ไม่มีก็เอารูปแรก (เฉพาะไฟล์รูป) */
async function coverMap(admin: ReturnType<typeof supabaseAdmin>, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await admin.from("erp_playground_attachments")
    .select("entity_id, public_url, content_type, is_primary, sort_order, created_at")
    .eq("entity_type", "design_sheet").in("entity_id", ids)
    .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  for (const a of (data ?? []) as Array<Record<string, unknown>>) {
    const eid = String(a.entity_id);
    const ct = (a.content_type as string) ?? "";
    if (!ct.startsWith("image/")) continue;
    if (!map.has(eid)) map.set(eid, String(a.public_url));
  }
  return map;
}

// ---- GET list ----
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search   = (searchParams.get("search") ?? "").trim();
  const status   = (searchParams.get("status") ?? "").trim();
  const brandId  = (searchParams.get("brand_id") ?? "").trim();
  const archived = searchParams.get("archived") === "1";   // โชว์ที่เก็บเข้ากรุ
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const SAFE = ["code", "name", "status", "order_date", "deadline", "created_at", "updated_at", "sort_order"];
  const sortBy = searchParams.get("sort_by");
  const orderCol = sortBy && SAFE.includes(sortBy) ? sortBy : "updated_at";
  const orderAsc = sortBy ? searchParams.get("sort_dir") === "asc" : false;

  const admin = supabaseAdmin();
  let q = admin.from("design_sheets")
    .select("id, code, name, brand_id, status, order_date, deadline, drive_link, note, is_active, updated_at, brand:brands!brand_id(name, color)", { count: "exact" })
    .eq("is_active", !archived)
    .order(orderCol, { ascending: orderAsc })
    .range(offset, offset + limit - 1);
  if (search)  { const t = `%${search}%`; q = q.or(`code.ilike.${t},name.ilike.${t}`); }
  if (status)  q = q.eq("status", status);
  if (brandId) q = q.eq("brand_id", brandId);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: friendlyDbError(error.message) }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const covers = await coverMap(admin, rows.map((r) => String(r.id)));
  const items: DesignSheetListItem[] = rows.map((r) => {
    const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null } | null;
    return {
      id: String(r.id), code: String(r.code), name: String(r.name),
      brand_id: (r.brand_id as string) ?? null, brand_name: b?.name ?? null, brand_color: b?.color ?? null,
      status: String(r.status ?? "design"), order_date: (r.order_date as string) ?? null, deadline: (r.deadline as string) ?? null,
      drive_link: (r.drive_link as string) ?? null, note: (r.note as string) ?? null, is_active: !!r.is_active,
      updated_at: String(r.updated_at), cover_url: covers.get(String(r.id)) ?? null,
    };
  });
  return NextResponse.json({ data: items, total: count ?? 0, error: null });
}

// ---- POST create ----
type CreateBody = {
  name?: string; brand_id?: string | null; detail?: string | null; note?: string | null;
  status?: string; order_date?: string | null; deadline?: string | null; drive_link?: string | null;
  parent_sku_code?: string | null;        // เดิม (รหัสเดี่ยว) — ยังรองรับเพื่อ backward compat
  parent_sku_codes?: string[];            // ใหม่ — หลายรหัส
};

// รวม/ปรับรหัส Parent SKU จาก payload (รองรับทั้งฟิลด์เดี่ยวเดิม + array ใหม่) → uppercase, ตัดช่องว่าง, ตัดซ้ำ
function normalizeParentCodes(body: { parent_sku_code?: string | null; parent_sku_codes?: string[] }): string[] {
  const raw = Array.isArray(body.parent_sku_codes)
    ? body.parent_sku_codes
    : (body.parent_sku_code ? [body.parent_sku_code] : []);
  const out: string[] = [];
  for (const c of raw) {
    const code = String(c ?? "").trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่องาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const status = body.status && (await isValidDsStatus(admin, body.status)) ? body.status : "design";

  // ตั้ง Parent SKU ตั้งแต่ตอนสร้าง (หลายรหัสได้) — รหัสซ้ำในระบบ = ห้ามบันทึก (เฟส 5)
  const parentCodes = normalizeParentCodes(body);
  if (parentCodes.length) {
    const { data: dup } = await admin.from("parent_skus_v2").select("code").in("code", parentCodes);
    const taken = (dup ?? []).map((d) => String((d as { code: string }).code).toUpperCase());
    if (taken.length) {
      return NextResponse.json({ error: `รหัส ${taken.join(", ")} มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ` }, { status: 400 });
    }
  }

  const code = await nextDsNo(admin);
  const { data: row, error } = await admin.from("design_sheets").insert({
    code, name, brand_id: body.brand_id || null, detail: body.detail ?? null, note: body.note ?? null,
    status, order_date: body.order_date || null, deadline: body.deadline || null,
    drive_link: body.drive_link?.trim() || null,
    parent_sku_codes: parentCodes, parent_sku_code: parentCodes[0] ?? null,   // เก็บ array + ตัวแรก (backward compat)
    is_active: true, created_by: user?.id ?? null,
  }).select("id, code").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "design_sheet", entityId: row.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { code, name },
  });
  return NextResponse.json({ id: row.id, code, error: null });
}
