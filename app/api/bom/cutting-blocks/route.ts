/**
 * GET /api/bom/cutting-blocks?search=   → ค้นหาบล็อกตัด (odoo_cutting_blocks)
 * คืน id, code(block_name), type, width, length เพื่อ autofill ตอนเลือกในบรรทัด BOM
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CuttingBlock = {
  id: number; code: string; type: string | null; width: number | null; length: number | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const search = (new URL(request.url).searchParams.get("search") ?? "").trim();
  let q = supabaseFromRequest(request)
    .from("odoo_cutting_blocks")
    .select("id, block_name, block_code, block_type, block_width, block_length")
    .eq("active", true)
    .order("block_name", { ascending: true })
    .limit(40);
  if (search) {
    const t = `%${search}%`;
    q = q.or(`block_name.ilike.${t},block_code.ilike.${t}`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const blocks: CuttingBlock[] = rows.map((r) => ({
    id:     Number(r.id),
    code:   String(r.block_code ?? r.block_name ?? ""),
    type:   (r.block_type as string) ?? null,
    width:  r.block_width != null ? Number(r.block_width) : null,
    length: r.block_length != null ? Number(r.block_length) : null,
  }));
  return NextResponse.json({ data: blocks, error: null });
}
