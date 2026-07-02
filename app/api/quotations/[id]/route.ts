import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { QuoteLine } from "../route";

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const partnerAddress = (partner: Record<string, unknown>) => {
  const direct = firstText(
    partner.address,
    partner.address_th,
    partner.billing_address,
    partner.shipping_address,
    partner.full_address,
  );
  if (direct) return direct;

  return [
    firstText(partner.street, partner.address_line1),
    firstText(partner.street2, partner.address_line2),
    firstText(partner.subdistrict, partner.tambon),
    firstText(partner.district, partner.amphoe),
    firstText(partner.province),
    firstText(partner.postal_code, partner.zip),
    firstText(partner.country),
  ].filter(Boolean).join(" ");
};

async function enrichQuoteCustomer(request: NextRequest, quote: unknown) {
  if (!quote || typeof quote !== "object") return quote;

  const detail = quote as Record<string, unknown>;
  const customerId = String(detail.customer_id ?? "").trim();
  if (!customerId) return quote;

  const { data: partner } = await supabaseFromRequest(request)
    .from("partners_v2")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();

  if (!partner) return quote;

  const row = partner as Record<string, unknown>;
  return {
    ...detail,
    customer_name: firstText(detail.customer_name, row.name_th, row.name_en, row.display_name, row.code),
    customer_code: firstText(detail.customer_code, row.code),
    customer_address: firstText(detail.customer_address, partnerAddress(row)),
    customer_phone: firstText(detail.customer_phone, row.phone, row.mobile, row.tel, row.contact_phone),
    customer_tax_id: firstText(detail.customer_tax_id, row.tax_id, row.tax_no, row.vat_id),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_quote_get", { p_id: id });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  const enriched = await enrichQuoteCustomer(request, data);
  return NextResponse.json({ data: enriched, error: null });
}

type PatchBody = { header?: Record<string, unknown>; lines?: QuoteLine[]; actor?: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_quote_update", {
    p_id: id, p_header: body.header ?? null, p_lines: body.lines ?? null, p_actor: body.actor ?? null,   // null = ไม่แก้หัวใบ (ส่ง {} ชนบั๊ก v_cust ในฟังก์ชัน)
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
