/**
 * ใบนำเสนอ A4 ของใบงานออกแบบ — อ่าน/บันทึกว่าเลือกรูปอะไร จัดวางแบบไหน (design_sheets.presentation jsonb)
 *
 * GET /api/design-sheets/[id]/presentation → { data: Presentation | null }
 * PUT /api/design-sheets/[id]/presentation { pages: [...] } → { data: Presentation }
 * สิทธิ์: products.view / products.edit (เหมือนใบงาน) · audit action=presentation_update
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { sanitizePresentation, type Presentation } from "@/lib/design-sheet-present";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("design_sheets").select("presentation").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data?.presentation as Presentation | null) ?? null, error: null });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const pres = sanitizePresentation(body);
  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("design_sheets").update({ presentation: pres }).eq("id", id).select("id, code").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบใบงาน" }, { status: 404 });
  await writeAudit(admin, {
    action: "presentation_update", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { code: row.code, pages: pres.pages.map((p) => ({ layout: p.layout, images: p.images.length })) },
  });
  return NextResponse.json({ data: pres, error: null });
}
