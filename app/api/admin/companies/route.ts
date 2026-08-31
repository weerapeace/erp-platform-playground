/**
 * ทะเบียนบริษัท (หัวบิลบนเอกสาร) — ของกลาง
 *
 *   GET                  → รายชื่อบริษัททั้งหมด (เรียงตาม sort_order)
 *   POST   { ... }       → เพิ่มบริษัท + สร้างกฎเลขเอกสารของบริษัทนั้นอัตโนมัติ
 *   PATCH  { id, ... }   → แก้ข้อมูล (แก้ doc_pattern = อัปเดตกฎเลขให้ด้วย)
 *   DELETE ?id=          → ปิดใช้งาน (ไม่ลบจริง — ใบเก่ายังอ้างถึงอยู่)
 *
 * ทำไมต้องมี: หัวบิลเดิม "พิมพ์ฝังตาย" อยู่ในแม่แบบเอกสาร เปลี่ยนไม่ได้
 * ย้ายมาเป็นทะเบียน → เพิ่มบริษัทที่ 3, 4 ได้เองจากเว็บ ไม่ต้องแก้โค้ด
 *
 * ⭐ เลขเอกสาร "แยกชุดต่อบริษัท" (เจ้าของเลือก): ใช้กฎคนละ key กัน (so_tax_<CODE>)
 *    เพราะระบบเลขกลางนับ current_value ต่อ key — ถ้าใช้ key เดียวกันจะได้เลขกระโดดข้าม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const str = (v: unknown) => String(v ?? "").trim();
const nullable = (v: unknown) => str(v) || null;

export type Company = {
  id: string;
  company_code: string;
  name: string;
  name_th: string | null;
  name_en: string | null;
  address_line: string | null;
  sub_district: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  tax_id: string | null;
  tax_branch: string | null;
  phone: string | null;
  fax: string | null;
  logo_key: string | null;
  doc_pattern: string | null;
  is_default: boolean;
  sort_order: number;
  status: string | null;
  /** จดทะเบียน VAT ไหม — false = ออกบิลแบบไม่มี VAT (เช่น ในนามบุคคล) */
  vat_registered: boolean;
};

/** ช่องที่แก้ได้ (ห้ามให้ client ส่งอะไรก็ได้เข้าตาราง) */
const EDITABLE = [
  "company_code", "name", "name_th", "name_en",
  "address_line", "sub_district", "district", "province", "postal_code",
  "tax_id", "tax_branch", "phone", "fax", "logo_key", "doc_pattern", "sort_order", "status",
  "vat_registered",
] as const;

const numberingKey = (code: string) => `so_tax_${code.toUpperCase()}`;

/** สร้าง/อัปเดตกฎเลขเอกสารของบริษัท — ตัวนับแยกของใครของมัน */
async function syncNumberingRule(
  admin: ReturnType<typeof supabaseAdmin>,
  code: string, name: string, pattern: string | null,
) {
  if (!code || !pattern) return;
  const key = numberingKey(code);
  const { data: existing } = await admin.from("erp_numbering_rules").select("key").eq("key", key).maybeSingle();
  if (existing) {
    // แก้แค่รูปแบบ/ป้าย — ไม่แตะ current_value เด็ดขาด (เลขที่ออกไปแล้วต้องไม่ย้อน)
    await admin.from("erp_numbering_rules")
      .update({ pattern, label: `ใบกำกับภาษี — ${name}`, updated_at: new Date().toISOString() })
      .eq("key", key);
  } else {
    await admin.from("erp_numbering_rules").insert({
      key, label: `ใบกำกับภาษี — ${name}`, pattern,
      reset_policy: "monthly", current_value: 0, active: true,
      notes: "สร้างอัตโนมัติจากทะเบียนบริษัท",
    });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("companies")
    .select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as Company[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const code = str(body.company_code).toUpperCase();
  const name = str(body.name) || str(body.name_th);
  if (!code) return NextResponse.json({ error: "ต้องใส่รหัสบริษัท (เช่น ISG)" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "ต้องใส่ชื่อบริษัท" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: dup } = await admin.from("companies").select("id").eq("company_code", code).maybeSingle();
  if (dup) return NextResponse.json({ error: `รหัสบริษัท "${code}" มีอยู่แล้ว` }, { status: 400 });

  const row: Record<string, unknown> = { company_code: code, name, status: "active" };
  for (const k of EDITABLE) if (body[k] !== undefined && k !== "company_code" && k !== "name") row[k] = nullable(body[k]);
  if (body.sort_order !== undefined) row.sort_order = Number(body.sort_order) || 0;
  if (body.vat_registered !== undefined) row.vat_registered = body.vat_registered !== false;
  // ไม่ตั้งรูปแบบเลขมา → ใช้รหัสบริษัทนำหน้าให้เลย
  if (!row.doc_pattern) row.doc_pattern = `${code}{BYYYY}-{MM}-{000}`;

  const { data, error } = await admin.from("companies").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await syncNumberingRule(admin, code, name, str(row.doc_pattern));
  await writeAudit(admin, {
    action: "create", entityType: "companies", entityId: String((data as { id: string }).id),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { company_code: code, name },
  });
  return NextResponse.json({ data: data as Company, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ error: "ไม่ระบุบริษัท" }, { status: 400 });

  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) {
    if (body[k] === undefined) continue;
    if (k === "company_code") { patch[k] = str(body[k]).toUpperCase(); continue; }
    if (k === "sort_order") { patch[k] = Number(body[k]) || 0; continue; }
    // ค่าบูลีน — nullable() แปลงเป็นข้อความ ถ้าปล่อยผ่านจะกลายเป็น null
    if (k === "vat_registered") { patch[k] = body[k] !== false; continue; }
    patch[k] = nullable(body[k]);
  }
  if (!patch.name && body.name !== undefined) return NextResponse.json({ error: "ชื่อบริษัทว่างไม่ได้" }, { status: 400 });

  // ตั้งเป็นบริษัทตั้งต้น → ปลดตัวเดิมก่อน (ได้ตัวเดียว)
  if (body.is_default === true) {
    await admin.from("companies").update({ is_default: false }).neq("id", id);
    patch.is_default = true;
  }

  const { data, error } = await admin.from("companies").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const c = data as Company;
  await syncNumberingRule(admin, c.company_code, c.name, c.doc_pattern);
  await writeAudit(admin, {
    action: "update", entityType: "companies", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { changed: Object.keys(patch) },
  });
  return NextResponse.json({ data: c, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const id = str(new URL(request.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ไม่ระบุบริษัท" }, { status: 400 });

  const admin = supabaseAdmin();
  // ปิดใช้งานแทนการลบ — ใบขายเก่ายังอ้างถึงบริษัทนี้อยู่
  const { error } = await admin.from("companies").update({ status: "inactive", is_default: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
