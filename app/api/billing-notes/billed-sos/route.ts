import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";

/**
 * GET /api/billing-notes/billed-sos → [{ so_id, billing_note_id, bill_number }]
 *   ใบกำกับที่อยู่ในใบวางบิล (ที่ยังไม่ยกเลิก) แล้ว — ตัวเลือกใบกำกับใช้ล็อกไม่ให้ติ๊กซ้ำ (RPC ก็กันซ้ำอีกชั้น)
 */
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "so.view");
  if (denied) return denied;
  const client = supabaseFromRequest(request);
  const { data: bills, error } = await client.from("erp_playground_billing_notes")
    .select("id, bill_number").neq("status", "cancelled").limit(5000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const numberById = new Map((bills ?? []).map((b) => [String(b.id), (b.bill_number as string | null) ?? null]));
  const ids = [...numberById.keys()];
  const out: { so_id: string; billing_note_id: string; bill_number: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: lines } = await client.from("erp_playground_billing_note_lines")
      .select("so_id, billing_note_id").in("billing_note_id", ids.slice(i, i + 200));
    for (const l of lines ?? []) {
      if (!l.so_id) continue;
      out.push({ so_id: String(l.so_id), billing_note_id: String(l.billing_note_id), bill_number: numberById.get(String(l.billing_note_id)) ?? null });
    }
  }
  return NextResponse.json({ data: out, error: null });
}
