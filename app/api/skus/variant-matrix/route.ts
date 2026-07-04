/**
 * สร้าง SKU แบบเมทริกซ์ 2 ชั้น (สี × ตัวเลือกที่ 2 เช่น แบบพิมพ์) ใต้ Parent เดียว
 *  /api/skus/variant-matrix
 *   GET  ?parent_sku_id=  (products.view)  → { parent_code, existing_codes[], colors[{value, code_part}] }
 *   POST { parent_sku_id, dimension2_name?, rows:[{code,name_th?,color,color_index?,dim2_value?,dim2_code?,list_price?}] }
 *        (products.create) → สร้างเฉพาะรหัสที่ยังไม่มี (ข้ามตัวซ้ำ) · dim2 เก็บใน attribute_values.variant_option
 *
 * มิติ 1 = สี → คอลัมน์ color/color_th (ใช้จัดกลุ่ม) · มิติ 2 = ตัวเลือกอิสระ → attribute_values.variant_option {name,value,code}
 * barcode = code · name_th ว่าง = ประกอบจาก สี/ตัวเลือก · list_price → ราคาขายกลาง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ตัดรหัสส่วน "ต่อจาก parent" ออกมา แล้วลอกตัวอักษรท้าย (suffix ของมิติ 2) → เหลือ code_part ของสี
// เช่น parent WK42, code WK42-01D → "01"
function derivePart(code: string, parentCode: string): string {
  let s = code.trim();
  if (parentCode && s.toUpperCase().startsWith(parentCode.toUpperCase())) s = s.slice(parentCode.length);
  s = s.replace(/^[-_\s]+/, "");           // ลอกตัวคั่นนำหน้า (- _ ช่องว่าง)
  const m = s.match(/^([0-9]+)/);          // เอาเฉพาะเลขนำหน้า (ตัด suffix ตัวอักษรท้ายทิ้ง)
  return m ? m[1] : s;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const parentId = (new URL(request.url).searchParams.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const admin = supabaseAdmin();
  const [{ data: parent }, { data: skus }] = await Promise.all([
    admin.from("parent_skus_v2").select("code, name_th").eq("id", parentId).maybeSingle(),
    admin.from("skus_v2").select("code, color, color_th, color_index").eq("parent_sku_id", parentId).order("code"),
  ]);
  const parentCode = (parent as { code?: string } | null)?.code ?? "";
  const rows = (skus ?? []) as { code: string; color: string | null; color_th: string | null; color_index: number | null }[];
  const existing_codes = rows.map((r) => r.code);
  // สีที่มีอยู่ (distinct ตามชื่อสี) + code_part ตัวแทน (จากรหัสตัวแรกของสีนั้น)
  const seen = new Set<string>();
  const colors: { value: string; code_part: string }[] = [];
  for (const r of rows) {
    const value = (r.color_th || r.color || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    colors.push({ value, code_part: derivePart(r.code, parentCode) });
  }
  return NextResponse.json({ parent_code: parentCode, existing_codes, colors, error: null });
}

type InRow = { code?: string; name_th?: string; color?: string; color_index?: number | string; dim2_value?: string; dim2_code?: string; list_price?: number | string; is_master?: boolean };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { parent_sku_id?: string; dimension2_name?: string; rows?: InRow[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const parent_sku_id = (body.parent_sku_id ?? "").trim();
  if (!parent_sku_id) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const dim2Name = (body.dimension2_name ?? "").trim();
  const inRows = (body.rows ?? []).filter((r) => String(r.code ?? "").trim());
  if (inRows.length === 0) return NextResponse.json({ error: "ยังไม่มีรายการให้สร้าง (กรอกรหัส)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: parent } = await admin.from("parent_skus_v2").select("id").eq("id", parent_sku_id).maybeSingle();
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้าแม่ (parent)" }, { status: 400 });

  // รหัสซ้ำในรายการเอง
  const codes = inRows.map((r) => String(r.code).trim());
  const dupInList = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dupInList) return NextResponse.json({ error: `รหัส "${dupInList}" ซ้ำกันในรายการ` }, { status: 400 });

  // รหัสที่มีอยู่แล้วในระบบ → ข้าม (ทำให้กดซ้ำได้ปลอดภัย)
  const { data: clash } = await admin.from("skus_v2").select("code").in("code", codes);
  const existing = new Set(((clash ?? []) as { code: string }[]).map((c) => c.code));
  const skipped = codes.filter((c) => existing.has(c));
  const toCreate = inRows.filter((r) => !existing.has(String(r.code).trim()));
  if (toCreate.length === 0) return NextResponse.json({ ok: true, created: 0, skipped, error: null });

  const payload = toCreate.map((r) => {
    const code = String(r.code).trim();
    const color = (r.color ?? "").trim() || null;
    const dim2Value = (r.dim2_value ?? "").trim();
    const price = r.list_price == null || r.list_price === "" ? null : Number(r.list_price);
    const nameParts = [color, dim2Value].filter(Boolean);
    const attribute_values = dim2Value
      ? { variant_option: { name: dim2Name || "ตัวเลือก", value: dim2Value, code: (r.dim2_code ?? "").trim() || null } }
      : {};
    return {
      parent_sku_id, code, barcode: code,
      name_th: (r.name_th ?? "").trim() || (nameParts.length ? nameParts.join(" / ") : code),
      color, color_th: color,
      color_index: r.color_index == null || r.color_index === "" ? null : Number(r.color_index),
      list_price: price != null && Number.isFinite(price) ? price : null,
      attribute_values,
      // ตัวสี (master) = ไม่ขายตรง (sale_ok=false) · ตัวขาย = ขายได้
      is_active: true, sale_ok: !r.is_master, purchase_ok: true,
    };
  });

  const { data: inserted, error } = await admin.from("skus_v2").insert(payload).select("id, code");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "skus_v2", entityId: parent_sku_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { via: "variant_matrix", dimension2: dim2Name, created: (inserted ?? []).length, skipped: skipped.length, codes: (inserted ?? []).map((s) => s.code) } });
  return NextResponse.json({ ok: true, created: (inserted ?? []).length, skipped, error: null });
}
