/**
 * คลังความรู้ของโมดูลงาน Creative
 * GET  /api/creative-knowledge   → รายการหน้าความรู้ (เรียงตาม sort_order)
 * POST /api/creative-knowledge   → สร้างหน้าใหม่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_knowledge")
    .select("id, title, body_html, sort_order, updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true }).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = String(body.title ?? "").trim() || "หน้าใหม่";

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_knowledge")
    .insert({ title, body_html: (body.body_html as string) ?? null, created_by: user?.id ?? null })
    .select("id, title, body_html, sort_order, updated_at").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "creative_knowledge", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { title } });
  return NextResponse.json({ data, error: null });
}
