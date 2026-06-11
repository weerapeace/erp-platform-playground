/**
 * Design Sheets — Comment ลูกค้า (เฟส 3)
 *
 * GET  /api/design-sheets/[id]/comments → list (พร้อม url รูปประกอบจากระบบแนบไฟล์กลาง)
 * POST /api/design-sheets/[id]/comments → เพิ่ม comment { comment_date, body }
 *
 * รูปประกอบ comment = erp_playground_attachments entity_type='design_sheet_comment' entity_id=<comment id>
 * ของกลาง: guardApi + writeAudit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DesignSheetComment = {
  id: string; sheet_id: string; comment_date: string; body: string;
  created_at: string; images: string[];   // url รูปประกอบ (เรียงตาม sort)
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("design_sheet_comments").select("*")
    .eq("sheet_id", id).order("comment_date", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const imageMap = new Map<string, string[]>();
  if (rows.length > 0) {
    const { data: atts } = await admin.from("erp_playground_attachments")
      .select("entity_id, public_url, content_type, sort_order, created_at")
      .eq("entity_type", "design_sheet_comment").in("entity_id", rows.map((r) => String(r.id)))
      .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    for (const a of (atts ?? []) as Array<Record<string, unknown>>) {
      if (!String(a.content_type ?? "").startsWith("image/")) continue;
      const k = String(a.entity_id);
      imageMap.set(k, [...(imageMap.get(k) ?? []), String(a.public_url)]);
    }
  }
  const items: DesignSheetComment[] = rows.map((r) => ({
    id: String(r.id), sheet_id: String(r.sheet_id), comment_date: String(r.comment_date),
    body: String(r.body), created_at: String(r.created_at), images: imageMap.get(String(r.id)) ?? [],
  }));
  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { comment_date?: string; body?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "กรุณาใส่รายการ comment" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("design_sheet_comments").insert({
    sheet_id: id, comment_date: body.comment_date || new Date().toISOString().slice(0, 10),
    body: text, created_by: user?.id ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "comment_add", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { comment_id: row.id, body: text.slice(0, 200) },
  });
  return NextResponse.json({ id: row.id, error: null });
}
