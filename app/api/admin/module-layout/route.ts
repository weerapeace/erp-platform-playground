/**
 * POST /api/admin/module-layout
 * บันทึก layout ฟอร์ม (Tab -> Section -> columns) ลง erp_modules.config.layout
 * body: { module_key, layout: { tabs: [...] } }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  let body: { module_key?: string; layout?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.module_key) return NextResponse.json({ error: "missing module_key" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: mod, error: e1 } = await admin.from("erp_modules").select("config").eq("module_key", body.module_key).maybeSingle();
  if (e1 || !mod) return NextResponse.json({ error: "ไม่พบ module" }, { status: 404 });

  const config = { ...(mod.config as Record<string, unknown> ?? {}), layout: body.layout ?? null };
  const { error: e2 } = await admin.from("erp_modules").update({ config, updated_at: new Date().toISOString() }).eq("module_key", body.module_key);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
