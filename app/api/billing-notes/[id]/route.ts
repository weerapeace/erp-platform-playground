import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { formatThaiAddress, formatTaxId } from "@/lib/thai-address";

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

// เติมที่อยู่/เลขภาษีลูกค้าจาก partners_v2 (ใช้ตอนพิมพ์ใบวางบิล)
async function enrichCustomer(request: NextRequest, doc: unknown) {
  if (!doc || typeof doc !== "object") return doc;
  const detail = doc as Record<string, unknown>;
  const customerId = String(detail.customer_id ?? "").trim();
  if (!customerId) return doc;
  const { data: partner } = await supabaseFromRequest(request)
    .from("partners_v2").select("*").eq("id", customerId).maybeSingle();
  if (!partner) return doc;
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_billing_note_get", { p_id: id });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  const enriched = await enrichCustomer(request, data);
  return NextResponse.json({ data: enriched, error: null });
}

// แก้ไขใบวางบิล (ร่างเท่านั้น) — แก้ header + เลือก SO ใหม่ได้
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { header?: Record<string, unknown>; so_ids?: string[]; actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_billing_note_update", {
    p_id: id, p_header: body.header ?? {}, p_so_ids: body.so_ids ?? null, p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
