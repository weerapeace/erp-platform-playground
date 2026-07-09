import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// สรุปยอดต่อโซนคลัง (สำหรับหน้าผังคลัง /inventory/map)
export type ZoneSummary = {
  id: string; code: string; name: string; kind: string; branch: string | null;
  sku_count: number; total_qty: number; total_value: number; last_at: string | null;
};
export type ZonesResponse = { data: ZoneSummary[]; error: string | null };

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_inventory_zone_summary");
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies ZonesResponse, { status: 500 });
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), code: String(r.code ?? ""), name: String(r.name ?? r.code ?? ""),
    kind: String(r.kind ?? "general"), branch: (r.branch as string | null) ?? null,
    sku_count: Number(r.sku_count ?? 0), total_qty: Number(r.total_qty ?? 0),
    total_value: Number(r.total_value ?? 0), last_at: (r.last_at as string | null) ?? null,
  }));
  return NextResponse.json({ data: rows, error: null } satisfies ZonesResponse);
}
