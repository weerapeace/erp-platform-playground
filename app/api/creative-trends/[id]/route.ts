/**
 * เทรนด์ Creative — รายตัว
 * GET    /api/creative-trends/[id]   → รายละเอียดเทรนด์ (+ รูปปก + % ความครบ)
 * PATCH  /api/creative-trends/[id]   → แก้ข้อมูล/ติ๊กเช็คลิสต์ (ส่งเฉพาะฟิลด์ที่แก้)
 * DELETE /api/creative-trends/[id]   → เก็บเข้ากรุ (soft delete — กระดานยังอยู่)
 *
 * สิทธิ์: tasks.view / tasks.edit · audit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { decorateTrends } from "../route";
import type { TrendChecklist } from "@/lib/creative-trends-meta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, title, summary, heat, brand_id, platforms, tags, source_url, start_date, end_date, checklist, is_active, updated_at";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_trends").select(COLS).eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ data: null, error: error ? friendlyDbError(error.message) : "ไม่พบเทรนด์นี้" }, { status: 404 });
  const [item] = await decorateTrends(admin, [data as Record<string, unknown>]);
  return NextResponse.json({ data: item, error: null });
}

type PatchBody = {
  title?: string; summary?: string | null; heat?: string; brand_id?: string | null;
  platforms?: string[]; tags?: string[]; source_url?: string | null;
  start_date?: string | null; end_date?: string | null;
  checklist?: TrendChecklist;          // ส่งมาทั้งก้อน (client ถือของล่าสุด)
  is_active?: boolean;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: "กรุณาใส่ชื่อเทรนด์" }, { status: 400 });
    patch.title = title;
  }
  if (body.summary !== undefined)    patch.summary = body.summary?.trim() || null;
  if (body.heat !== undefined)       patch.heat = String(body.heat);
  if (body.brand_id !== undefined)   patch.brand_id = body.brand_id || null;
  if (body.platforms !== undefined)  patch.platforms = Array.isArray(body.platforms) ? body.platforms : [];
  if (body.tags !== undefined)       patch.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.source_url !== undefined) patch.source_url = body.source_url?.trim() || null;
  if (body.start_date !== undefined) patch.start_date = body.start_date || null;
  if (body.end_date !== undefined)   patch.end_date = body.end_date || null;
  if (body.is_active !== undefined)  patch.is_active = !!body.is_active;
  if (body.checklist !== undefined) {
    // sanitize: เก็บเฉพาะ { done: bool, note: string } กัน payload แปลกปลอม
    const clean: TrendChecklist = {};
    for (const [k, v] of Object.entries(body.checklist ?? {})) {
      if (!v) continue;
      clean[String(k).slice(0, 40)] = { done: !!v.done, note: String(v.note ?? "").slice(0, 500) || undefined };
    }
    patch.checklist = clean;
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_trends").update(patch).eq("id", id).select(COLS).maybeSingle();
  if (error || !data) return NextResponse.json({ error: error ? friendlyDbError(error.message) : "ไม่พบเทรนด์นี้" }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "creative_trend", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
  });
  const [item] = await decorateTrends(admin, [data as Record<string, unknown>]);
  return NextResponse.json({ data: item, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_trends").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "archive", entityType: "creative_trend", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ error: null });
}
