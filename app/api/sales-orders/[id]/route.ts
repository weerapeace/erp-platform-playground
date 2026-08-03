import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatThaiAddress, formatTaxId } from "@/lib/thai-address";
import type { SOLine } from "../route";

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

// เติมที่อยู่ / เบอร์ / เลขภาษีลูกค้า จาก partners_v2 (ใช้ตอนพิมพ์ใบกำกับภาษี)
async function enrichSoCustomer(request: NextRequest, so: unknown) {
  if (!so || typeof so !== "object") return so;
  const detail = so as Record<string, unknown>;
  const customerId = String(detail.customer_id ?? "").trim();
  if (!customerId) return so;

  const { data: partner } = await supabaseFromRequest(request)
    .from("partners_v2").select("*").eq("id", customerId).maybeSingle();
  if (!partner) return so;

  const row = partner as Record<string, unknown>;
  return {
    ...detail,
    customer_name:    firstText(detail.customer_name, row.name_th, row.name_en, row.display_name, row.code),
    customer_code:    firstText(detail.customer_code, row.code),
    customer_address: firstText(detail.customer_address, formatThaiAddress(row)),
    customer_phone:   firstText(detail.customer_phone, row.phone, row.mobile, row.tel, row.contact_phone),
    customer_tax_id:  firstText(detail.customer_tax_id, formatTaxId(firstText(row.tax_id, row.tax_no, row.vat_id), row.tax_branch)),
  };
}

/** เติมหัวบิล "บริษัทผู้ขาย" จากทะเบียน companies — เดิมพิมพ์ฝังตายในแม่แบบ */
async function enrichSoCompany(so: unknown) {
  if (!so || typeof so !== "object") return so;
  const detail = so as Record<string, unknown>;
  const admin = supabaseAdmin();
  const companyId = String(detail.company_id ?? "").trim();

  // ใบเก่าที่ยังไม่ได้ผูกบริษัท → ใช้บริษัทตั้งต้น (เอกสารจะได้ไม่มีหัวว่าง)
  const q = admin.from("companies").select("*");
  const { data: c } = companyId
    ? await q.eq("id", companyId).maybeSingle()
    : await q.eq("is_default", true).maybeSingle();
  if (!c) return so;

  const row = c as Record<string, unknown>;
  return {
    ...detail,
    company_name_th: firstText(row.name_th, row.name),
    company_name_en: firstText(row.name_en),
    company_address: formatThaiAddress(row),
    company_phone:   firstText(row.phone),
    company_fax:     firstText(row.fax),
    company_tax_id:  formatTaxId(row.tax_id, row.tax_branch),
    company_logo_key: firstText(row.logo_key),
    company_code:    firstText(row.company_code),
  };
}

// ---- GET — detail + lines ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_so_get", { p_id: id });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  const withCustomer = await enrichSoCustomer(request, data);
  const enriched = await enrichSoCompany(withCustomer);   // หัวบิลบริษัทผู้ขาย (จากทะเบียน companies)
  return NextResponse.json({ data: enriched, error: null });
}

// ---- PATCH — update (draft only) ----

type PatchBody = { header?: Record<string, unknown>; lines?: SOLine[]; actor?: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_so_update", {
    p_id: id, p_header: body.header ?? {}, p_lines: body.lines ?? null, p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
