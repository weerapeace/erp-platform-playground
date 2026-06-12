/**
 * SKU Wizard — สร้าง SKU ทีละหลายตัว (โหมดชุด) หรือตัวเดียว (โหมดเดี่ยว) + ผูกแท็ก
 *
 * POST /api/skus/wizard-create
 *   body { rows: [{ values: { <column>: <value>, ... }, family_tag_ids?: string[] }, ...] }
 *
 * - คอลัมน์ที่เลือกได้มาจากทะเบียน field กลาง (ฝั่ง UI) · server กรองเฉพาะคอลัมน์ที่อนุญาต (SAFE_COLS)
 * - barcode ว่าง = ใช้ code · รหัสซ้ำ (ในชุด/ในระบบ) = error ทั้งชุด กันสร้างครึ่งๆ
 * - ผูกแท็ก product_families ผ่าน m2m (skus_v2_product_family_m2m)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// คอลัมน์ skus_v2 ที่ Wizard เขียนได้ (whitelist กันยัดคอลัมน์มั่ว)
const SAFE_COLS = new Set([
  "code", "name_th", "barcode", "description", "purchase_description",
  "parent_sku_id", "uom_id", "purchase_uom_id", "seller_partner_id", "material_group_id", "product_group",
  "list_price", "standard_price", "fake_price", "rmb_cost", "moq",
  "color", "color_th", "color_index", "fabric_width_cm", "product_type",
  "links", "purchase_link", "ig_sell", "is_active", "sale_ok", "purchase_ok",
  "materials", "zipper", "logo", "hardware", "lining", "strap", "thread", "additional",
]);
const NUMERIC_COLS = new Set(["list_price", "standard_price", "fake_price", "rmb_cost", "moq", "fabric_width_cm", "color_index"]);
const UUID_COLS = new Set(["parent_sku_id", "uom_id", "purchase_uom_id", "seller_partner_id", "material_group_id", "product_group"]);

type Row = { values?: Record<string, unknown>; family_tag_ids?: string[] };

// แปลงค่าให้ตรงชนิดคอลัมน์ · คืน undefined = ข้าม (ไม่เขียน)
function coerce(col: string, v: unknown): unknown {
  if (v == null || v === "") return UUID_COLS.has(col) ? null : undefined;
  if (NUMERIC_COLS.has(col)) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  if (col === "ig_sell" || col === "is_active" || col === "sale_ok" || col === "purchase_ok") return !!v;
  return typeof v === "string" ? v.trim() : v;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { rows?: Row[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const rows = (body.rows ?? []).filter((r) => String(r.values?.code ?? "").trim());
  if (rows.length === 0) return NextResponse.json({ error: "ต้องมี SKU อย่างน้อย 1 ตัว (กรอกรหัส)" }, { status: 400 });

  const codes = rows.map((r) => String(r.values!.code).trim());
  const dup = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dup) return NextResponse.json({ error: `รหัส SKU "${dup}" ซ้ำกันในรายการ` }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: clash } = await admin.from("skus_v2").select("code").in("code", codes);
  if (clash && clash.length > 0) {
    return NextResponse.json({ error: `รหัส SKU มีอยู่ในระบบแล้ว: ${clash.map((c) => c.code).join(", ")}` }, { status: 400 });
  }

  // สร้าง payload จาก values (กรอง SAFE_COLS + แปลงชนิด) + ค่าตั้งต้น
  const payload = rows.map((r) => {
    const out: Record<string, unknown> = { is_active: true, sale_ok: true, purchase_ok: true };
    for (const [k, v] of Object.entries(r.values ?? {})) {
      if (!SAFE_COLS.has(k)) continue;
      const cv = coerce(k, v);
      if (cv !== undefined) out[k] = cv;
    }
    out.code = String(r.values!.code).trim();
    out.barcode = String(r.values!.barcode ?? "").trim() || out.code;     // ว่าง = ใช้ code
    if (!out.name_th) out.name_th = out.code;
    if (out.list_price == null && out.standard_price != null) out.list_price = out.standard_price;  // เริ่มต้น list = standard
    return out;
  });

  const { data: inserted, error } = await admin.from("skus_v2").insert(payload).select("id, code");
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  const byCode = new Map((inserted ?? []).map((s) => [s.code as string, s.id as string]));
  const links: { src_id: string; tgt_id: string }[] = [];
  rows.forEach((r) => {
    const id = byCode.get(String(r.values!.code).trim());
    if (id) for (const tagId of (r.family_tag_ids ?? [])) if (tagId) links.push({ src_id: id, tgt_id: tagId });
  });
  if (links.length > 0) await admin.from("skus_v2_product_family_m2m").insert(links);

  await writeAudit(admin, {
    action: "create", entityType: "skus_v2", entityId: inserted?.[0]?.id ?? null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { via: "sku_wizard", count: payload.length, codes },
  });

  return NextResponse.json({ created: payload.length, ids: (inserted ?? []).map((s) => s.id), error: null });
}
