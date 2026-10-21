/**
 * 📋 สรุปงาน (ใบงานออกแบบ) — รายการ + สร้างใหม่
 * GET  /api/design-sheet-summaries  → { data: SummaryListItem[] (ล่าสุด 100), error }   สิทธิ์ products.view
 * POST /api/design-sheet-summaries  body: SummaryDoc → { data: SavedSummary }          สิทธิ์ products.edit · audit "create"
 * ตาราง design_sheet_summaries (เปิด RLS ไม่มี policy → ผ่าน supabaseAdmin เท่านั้น) · doc: docs/design-sheet-summary.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { normalizeSummaryDoc, type SummaryListItem } from "@/lib/design-sheet-summary";
import { toSavedSummary } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("design_sheet_summaries")
    .select("id, title, audience, items, updated_at, created_by_name")
    .eq("is_active", true).order("updated_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ data: [], error: "โหลดสรุปที่บันทึกไว้ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const list: SummaryListItem[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), title: String(r.title ?? ""), audience: r.audience === "customer" ? "customer" : "internal",
    item_count: Array.isArray(r.items) ? r.items.length : 0, updated_at: String(r.updated_at), created_by_name: (r.created_by_name as string) ?? null,
  }));
  return NextResponse.json({ data: list, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const parsed = normalizeSummaryDoc(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ data: null, error: parsed.error }, { status: 400 });
  const actor = await requestActor(supabaseFromRequest(request));
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("design_sheet_summaries")
    .insert({ ...parsed.value, created_by: actor.id, created_by_name: actor.name, updated_by: actor.id })
    .select("*").single();
  if (error || !data) return NextResponse.json({ data: null, error: "บันทึกสรุปไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const saved = toSavedSummary(data as Record<string, unknown>);
  await writeAudit(admin, {
    action: "create", entityType: "design_sheet_summary", entityId: saved.id, actorId: actor.id, actorName: actor.name,
    metadata: { title: saved.title, audience: saved.audience, items: saved.items.length, sheet_ids: saved.items.map((i) => i.sheet_id) },
  });
  return NextResponse.json({ data: saved, error: null });
}
