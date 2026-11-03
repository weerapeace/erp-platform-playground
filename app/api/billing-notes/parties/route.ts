import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import type { BillingParty } from "@/lib/billing-mix";

/**
 * GET /api/billing-notes/parties?ids=<uuid,uuid,...>
 *   เลขผู้เสียภาษี + สาขาของลูกค้า — ให้หน้าใบวางบิลเตือน "คนละสาขา / คนละบริษัท" ตอนเลือกใบกำกับ
 */
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "so.view");
  if (denied) return denied;

  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").map(s => s.trim())
    .filter(s => /^[0-9a-f-]{36}$/i.test(s)))].slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ data: [], error: null });

  const { data, error } = await supabaseFromRequest(request)
    .from("partners_v2").select("id, code, name_th, display_name, tax_id, tax_branch").in("id", ids);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const parties: BillingParty[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name_th || r.display_name || r.code || ""),
    code: (r.code as string | null) ?? null,
    tax_id: (r.tax_id as string | null) ?? null,
    tax_branch: (r.tax_branch as string | null) ?? null,
  }));
  return NextResponse.json({ data: parties, error: null });
}
