/**
 * ค่า layout ของรูปเข็มขัดในใบงาน (เฟส 2) — เก็บค่ากลาง 1 ชุด ใช้ทุกใบงาน
 * GET   /api/mo/belt-layout  → { layout }   (BeltLayout: boxH/frontDim/backDim)
 * PATCH /api/mo/belt-layout  body { layout } → บันทึก
 * ของกลาง: supabaseAdmin + guardApi · ตาราง belt_diagram_layout (id=1, config jsonb)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("belt_diagram_layout").select("config").eq("id", 1).maybeSingle();
  return NextResponse.json({ layout: (data as { config?: Record<string, unknown> } | null)?.config ?? {}, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { layout?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const config = body.layout ?? {};
  const { error } = await supabaseAdmin()
    .from("belt_diagram_layout")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
