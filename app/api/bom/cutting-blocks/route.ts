/**
 * GET  /api/bom/cutting-blocks?search=  → ค้นบล็อกตัด (รวม Odoo mirror + ที่ผู้ใช้สร้างเอง)
 * POST /api/bom/cutting-blocks            → สร้างบล็อกใหม่ (bom_cut_blocks) body: { code, width, length }
 *
 * id เป็น string เสมอ (odoo = ตัวเลข, manual = uuid) — บรรทัด BOM อ้างอิงด้วย "รหัสบล็อก" (code)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CuttingBlock = {
  id: string; code: string; type: string | null;
  width: number | null; length: number | null; source: "odoo" | "manual";
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const search = (new URL(request.url).searchParams.get("search") ?? "").trim();
  const supabase = supabaseFromRequest(request);
  const t = `%${search}%`;

  // manual (มาก่อน) + odoo
  let mq = supabase.from("bom_cut_blocks").select("id, code, block_type, block_width, block_length").eq("is_active", true).order("code").limit(20);
  if (search) mq = mq.ilike("code", t);

  let oq = supabase.from("odoo_cutting_blocks").select("id, block_name, block_code, block_type, block_width, block_length").eq("active", true).order("block_name").limit(40);
  if (search) oq = oq.or(`block_name.ilike.${t},block_code.ilike.${t}`);

  const [m, o] = await Promise.all([mq, oq]);
  if (m.error) return NextResponse.json({ data: [], error: m.error.message }, { status: 500 });
  if (o.error) return NextResponse.json({ data: [], error: o.error.message }, { status: 500 });

  const manual: CuttingBlock[] = (m.data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return { id: String(x.id), code: String(x.code ?? ""), type: (x.block_type as string) ?? "สร้างเอง",
      width: x.block_width != null ? Number(x.block_width) : null, length: x.block_length != null ? Number(x.block_length) : null, source: "manual" };
  });
  const odoo: CuttingBlock[] = (o.data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return { id: String(x.id), code: String(x.block_code ?? x.block_name ?? ""), type: (x.block_type as string) ?? null,
      width: x.block_width != null ? Number(x.block_width) : null, length: x.block_length != null ? Number(x.block_length) : null, source: "odoo" };
  });
  return NextResponse.json({ data: [...manual, ...odoo], error: null });
}

// ---- POST: สร้างบล็อกใหม่ ----
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { code?: string; width?: number; length?: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "ต้องระบุรหัสบล็อก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: dup } = await admin.from("bom_cut_blocks").select("id").eq("code", code).maybeSingle();
  if (dup) return NextResponse.json({ error: `รหัสบล็อก "${code}" มีอยู่แล้ว` }, { status: 400 });

  const { data, error } = await admin.from("bom_cut_blocks")
    .insert({ code, block_width: body.width ?? null, block_length: body.length ?? null })
    .select("id, code, block_type, block_width, block_length").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user.id, action: "create", entity_type: "cut_block", entity_id: null,
    metadata: { code, width: body.width, length: body.length },
  }).then(() => {}, () => {});

  const x = data as Record<string, unknown>;
  const block: CuttingBlock = { id: String(x.id), code: String(x.code), type: (x.block_type as string) ?? "สร้างเอง",
    width: x.block_width != null ? Number(x.block_width) : null, length: x.block_length != null ? Number(x.block_length) : null, source: "manual" };
  return NextResponse.json({ data: block, error: null });
}
