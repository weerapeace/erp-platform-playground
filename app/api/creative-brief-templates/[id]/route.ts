/**
 * เทมเพลตบรีฟ — แก้ / ลบ ทีละอัน
 *
 * PATCH  /api/creative-brief-templates/[id]  → แก้เฉพาะช่องที่ส่งมา (name/tags/brief/ref_image_keys/ref_links/brand_id/is_active/sort_order)
 * DELETE /api/creative-brief-templates/[id]  → ลบ (โพสต์ที่เคยใช้เทมเพลตนี้ไม่กระทบ — คัดลอกเนื้อหาไปแล้ว)
 *
 * สิทธิ์ tasks.edit · เขียน audit ทุกครั้ง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { cleanBriefTemplateInput } from "@/lib/brief-templates";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, name, tags, brief, ref_image_keys, ref_links, brand_id, sort_order, is_active, updated_at";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const c = cleanBriefTemplateInput(body, true);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });
  if (!Object.keys(c.row).length) return NextResponse.json({ error: "ไม่มีอะไรเปลี่ยน" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { data, error } = await admin.from("erp_creative_brief_templates")
    .update({ ...c.row, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", id).select(COLS).maybeSingle();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  if (!data) return NextResponse.json({ error: "ไม่พบเทมเพลต" }, { status: 404 });
  await writeAuditFor(request, admin, { action: "update", entityType: "creative_brief_template", entityId: id, metadata: { changes: Object.keys(c.row), name: data.name } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("erp_creative_brief_templates").select("name").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบเทมเพลต" }, { status: 404 });
  const { error } = await admin.from("erp_creative_brief_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAuditFor(request, admin, { action: "delete", entityType: "creative_brief_template", entityId: id, metadata: { name: cur.name } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
