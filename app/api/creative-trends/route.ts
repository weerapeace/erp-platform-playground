/**
 * เทรนด์ Creative (Trends) — รายการ + สร้างใหม่
 * GET  /api/creative-trends            → รายการเทรนด์ (+ รูปปกจากกระดาน + % ความครบของเช็คลิสต์)
 *      ?ids=a,b   → เอาเฉพาะ id ที่ระบุ (ใช้ตอนวางการ์ดบนกระดานแคมเปญ)
 *      ?all=1     → รวมที่เก็บเข้ากรุแล้ว
 * POST /api/creative-trends            → สร้างเทรนด์ใหม่
 *
 * สิทธิ์: tasks.view / tasks.edit (ชุดเดียวกับคลังความรู้) · audit → audit_logs
 * รูปปก = ภาพถ่ายกระดาน (erp_canvas_sketches.preview_r2_key, entity_type='creative_trend')
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { trendProgress, type TrendChecklist } from "@/lib/creative-trends-meta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type TrendItem = {
  id: string; title: string; summary: string | null; heat: string;
  brand_id: string | null; brand_name: string | null;
  platforms: string[]; tags: string[]; source_url: string | null;
  start_date: string | null; end_date: string | null;
  checklist: TrendChecklist; done: number; total: number; percent: number; missing_core: string[];
  cover_url: string | null; is_active: boolean; updated_at: string;
};

type Row = Record<string, unknown>;

/** ปะรูปปก (ภาพถ่ายกระดาน) + คิด % ความครบ ให้แต่ละเทรนด์ */
export async function decorateTrends(admin: ReturnType<typeof supabaseAdmin>, rows: Row[]): Promise<TrendItem[]> {
  const ids = rows.map((r) => String(r.id));
  const coverByIdMap = new Map<string, string>();
  if (ids.length) {
    const { data: sketches } = await admin.from("erp_canvas_sketches")
      .select("entity_id, preview_r2_key").eq("entity_type", "creative_trend").in("entity_id", ids);
    for (const s of ((sketches ?? []) as { entity_id: string; preview_r2_key: string | null }[])) {
      if (s.preview_r2_key) coverByIdMap.set(String(s.entity_id), `/api/r2-image?key=${encodeURIComponent(s.preview_r2_key)}`);
    }
  }
  const brandIds = [...new Set(rows.map((r) => r.brand_id).filter(Boolean).map(String))];
  const brandName = new Map<string, string>();
  if (brandIds.length) {
    const { data: bs } = await admin.from("brands").select("id, name").in("id", brandIds);
    for (const b of ((bs ?? []) as { id: string; name: string }[])) brandName.set(String(b.id), b.name);
  }
  return rows.map((r) => {
    const checklist = (r.checklist ?? {}) as TrendChecklist;
    const p = trendProgress(checklist);
    return {
      id: String(r.id), title: String(r.title ?? ""), summary: (r.summary as string) ?? null,
      heat: String(r.heat ?? "rising"),
      brand_id: (r.brand_id as string) ?? null, brand_name: r.brand_id ? (brandName.get(String(r.brand_id)) ?? null) : null,
      platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      source_url: (r.source_url as string) ?? null,
      start_date: (r.start_date as string) ?? null, end_date: (r.end_date as string) ?? null,
      checklist, done: p.done, total: p.total, percent: p.percent,
      missing_core: p.missingCore.map((c) => c.key),
      cover_url: coverByIdMap.get(String(r.id)) ?? null,
      is_active: r.is_active !== false, updated_at: String(r.updated_at ?? ""),
    };
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const idList = (searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const all = searchParams.get("all") === "1";

  const admin = supabaseAdmin();
  let q = admin.from("erp_creative_trends")
    .select("id, title, summary, heat, brand_id, platforms, tags, source_url, start_date, end_date, checklist, is_active, updated_at")
    .order("sort_order", { ascending: true }).order("updated_at", { ascending: false }).limit(300);
  if (idList.length) q = q.in("id", idList);
  else if (!all) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: await decorateTrends(admin, (data ?? []) as Row[]), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "กรุณาใส่ชื่อเทรนด์" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_trends").insert({
    title,
    summary: (body.summary as string)?.trim() || null,
    heat: String(body.heat ?? "rising"),
    brand_id: (body.brand_id as string) || null,
    platforms: Array.isArray(body.platforms) ? (body.platforms as string[]) : [],
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
    source_url: (body.source_url as string)?.trim() || null,
    start_date: (body.start_date as string) || null,
    end_date: (body.end_date as string) || null,
    created_by: user?.id ?? null,
  }).select("id, title, summary, heat, brand_id, platforms, tags, source_url, start_date, end_date, checklist, is_active, updated_at").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "creative_trend", entityId: String(data.id),
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { title },
  });
  const [item] = await decorateTrends(admin, [data as Row]);
  return NextResponse.json({ data: item, error: null });
}
