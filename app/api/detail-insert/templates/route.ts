/**
 * 📝 รูปแบบบรรทัดกลางของป๊อป "แทรกรายละเอียด" — /api/detail-insert/templates
 *
 * เก็บใน app_settings.detail_insert_templates (singleton id=1 · ทุกสินค้า ทุกคนใช้ชุดเดียวกัน)
 * GET → { data: InsertTemplates } (ยังไม่เคยตั้ง = ค่าเริ่มต้น)          สิทธิ์ products.view
 * PUT { templates } → บันทึก (ทำความสะอาดก่อนเก็บ) + audit_logs        สิทธิ์ products.edit
 * รูปแบบ/ค่าเริ่มต้น: lib/detail-snippets (normalizeInsertTemplates) · หน้าจอ: components/detail-insert (ปุ่ม ⚙️)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeInsertTemplates } from "@/lib/detail-snippets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const { data } = await supabaseAdmin().from("app_settings").select("detail_insert_templates").eq("id", 1).maybeSingle();
  return NextResponse.json({ data: normalizeInsertTemplates((data as { detail_insert_templates?: unknown } | null)?.detail_insert_templates) });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { templates?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const sb = supabaseAdmin();
  const { data: before } = await sb.from("app_settings").select("detail_insert_templates").eq("id", 1).maybeSingle();
  const next = normalizeInsertTemplates(body.templates);
  const { error } = await sb.from("app_settings").update({ detail_insert_templates: next }).eq("id", 1);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, {
    action: "update",
    entityType: "app_settings",
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { key: "detail_insert_templates", before: (before as { detail_insert_templates?: unknown } | null)?.detail_insert_templates ?? null, after: next },
  });
  return NextResponse.json({ ok: true, data: next });
}
