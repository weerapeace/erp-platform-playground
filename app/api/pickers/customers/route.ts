import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";

type CustomerPickerRow = {
  id: string;
  code: string | null;
  name_th: string | null;
  name_en: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  is_customer: boolean | null;
  is_active: boolean | null;
};

const cleanSearch = (value: string) =>
  value.replace(/[%_,()*]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "customers.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));

  let query = supabaseFromRequest(request)
    .from("partners_v2")
    .select("id, code, name_th, name_en, phone, email, tax_id, is_customer, is_active")
    .eq("is_active", true)
    .eq("is_customer", true);

  for (const token of cleanSearch(search)) {
    query = query.or(
      `code.ilike.%${token}%,name_th.ilike.%${token}%,name_en.ilike.%${token}%,phone.ilike.%${token}%,email.ilike.%${token}%,tax_id.ilike.%${token}%`,
    );
  }

  const { data, error } = await query.order("code", { ascending: true }).limit(limit);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = ((data ?? []) as CustomerPickerRow[]).map((row) => {
    const code = row.code ?? "";
    return {
      id: row.id,
      code,
      name: row.name_th ?? row.name_en ?? code,
      contact_phone: row.phone,
      payment_terms: null,
      category: null,
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
