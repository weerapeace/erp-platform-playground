/**
 * Creative Campaigns API — แคมเปญที่ครอบงาน creative
 *
 * GET  /api/creative-campaigns?search=&status=&include_inactive=1
 * POST /api/creative-campaigns  body = { name, brand_id?, objective?, status?, start_date?, end_date?, owner_id?, note? }
 *
 * ของกลาง: guardApi (tasks.view/tasks.create) + writeAudit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { employeeLabelMap } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const status = (searchParams.get("status") ?? "").trim();
  const includeInactive = searchParams.get("include_inactive") === "1";

  const admin = supabaseAdmin();
  let q = admin.from("erp_creative_campaigns")
    .select("id, name, brand_id, objective, status, start_date, end_date, owner_id, note, is_active, updated_at, brand:brands!brand_id(name, color)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .limit(500);
  if (!includeInactive) q = q.eq("is_active", true);
  if (search) q = q.ilike("name", `%${search}%`);
  if (status) q = q.eq("status", status);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: friendlyDbError(error.message) }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ownerMap = await employeeLabelMap(admin, rows.map((r) => r.owner_id as string | null));
  const items = rows.map((r) => {
    const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null } | null;
    return {
      id: String(r.id), name: String(r.name),
      brand_id: (r.brand_id as string) ?? null, brand_label: b?.name ?? null, brand_color: b?.color ?? null,
      objective: (r.objective as string) ?? null, status: String(r.status ?? "active"),
      start_date: (r.start_date as string) ?? null, end_date: (r.end_date as string) ?? null,
      owner_id: (r.owner_id as string) ?? null, owner_label: ownerMap.get(String(r.owner_id)) ?? null,
      note: (r.note as string) ?? null, is_active: !!r.is_active, updated_at: String(r.updated_at),
    };
  });
  return NextResponse.json({ data: items, total: count ?? items.length, error: null });
}

type CreateBody = {
  name?: string; brand_id?: string | null; objective?: string | null;
  status?: string; start_date?: string | null; end_date?: string | null;
  owner_id?: string | null; note?: string | null;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อแคมเปญ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("erp_creative_campaigns").insert({
    name, brand_id: body.brand_id || null, objective: body.objective?.trim() || null,
    status: body.status || "active", start_date: body.start_date || null, end_date: body.end_date || null,
    owner_id: body.owner_id || null, note: body.note?.trim() || null, created_by: user?.id ?? null,
  }).select("id, name").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "creative_campaign", entityId: row.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name },
  });
  return NextResponse.json({ id: row.id, name: row.name, error: null });
}
