/**
 * 📋 สรุปงาน — เปิด / แก้ไข / ลบ
 * GET    /api/design-sheet-summaries/:id → { data: SavedSummary }       สิทธิ์ products.view
 * PATCH  /api/design-sheet-summaries/:id body: SummaryDoc (ทั้งชุด)    สิทธิ์ products.edit · audit "update" (ก่อน/หลัง)
 * DELETE /api/design-sheet-summaries/:id → ลบแบบเก็บประวัติ (is_active=false) · สิทธิ์ products.edit · audit "delete"
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { normalizeSummaryDoc, type SavedSummary } from "@/lib/design-sheet-summary";
import { toSavedSummary } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const brief = (s: SavedSummary) => ({ title: s.title, audience: s.audience, columns: s.columns, items: s.items.length, sheet_ids: s.items.map((i) => i.sheet_id), note: s.note });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const { data } = await supabaseAdmin().from("design_sheet_summaries").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  if (!data) return NextResponse.json({ data: null, error: "ไม่พบสรุปนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  return NextResponse.json({ data: toSavedSummary(data as Record<string, unknown>), error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const parsed = normalizeSummaryDoc(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ data: null, error: parsed.error }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("design_sheet_summaries").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบสรุปนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const actor = await requestActor(supabaseFromRequest(request));
  const { data, error } = await admin.from("design_sheet_summaries")
    .update({ ...parsed.value, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const saved = toSavedSummary(data as Record<string, unknown>);
  await writeAudit(admin, {
    action: "update", entityType: "design_sheet_summary", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { title: saved.title, before: brief(toSavedSummary(before as Record<string, unknown>)), after: brief(saved) },
  });
  return NextResponse.json({ data: saved, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const { data, error } = await admin.from("design_sheet_summaries")
    .update({ is_active: false, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq("id", id).eq("is_active", true).select("id, title").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "ลบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "ไม่พบสรุปนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  await writeAudit(admin, { action: "delete", entityType: "design_sheet_summary", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { title: (data as { title: string }).title } });
  return NextResponse.json({ ok: true, error: null });
}
