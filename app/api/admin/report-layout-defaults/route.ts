import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { prepareReportLayoutForSave, reportLayoutFromStoredValue, type ReportLayoutSettings } from "@/lib/report-layout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ReportLayoutDefaultRow = {
  entity_type: string;
  layout_settings: ReportLayoutSettings;
  updated_at: string | null;
  updated_by_email: string | null;
};

export type ReportLayoutDefaultResponse = {
  data: ReportLayoutDefaultRow | null;
  error: string | null;
};

function normalizeEntityType(value: unknown): string {
  const entityType = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9_:-]+$/.test(entityType) ? entityType : "";
}

export async function GET(request: NextRequest): Promise<NextResponse<ReportLayoutDefaultResponse>> {
  const denied = await guardApi(request, "reports.view");
  if (denied) return denied as NextResponse<ReportLayoutDefaultResponse>;

  const entityType = normalizeEntityType(request.nextUrl.searchParams.get("entity_type"));
  if (!entityType) {
    return NextResponse.json({ data: null, error: "entity_type required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("report_layout_defaults")
    .select("entity_type, layout_settings, updated_at, updated_by_email")
    .eq("entity_type", entityType)
    .maybeSingle();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ data: null, error: null });

  return NextResponse.json({
    data: {
      entity_type: String(data.entity_type),
      layout_settings: reportLayoutFromStoredValue(data.layout_settings),
      updated_at: data.updated_at ?? null,
      updated_by_email: data.updated_by_email ?? null,
    },
    error: null,
  });
}

type SaveBody = {
  entity_type?: unknown;
  layout_settings?: Partial<ReportLayoutSettings>;
};

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "reports.edit");
  if (denied) return denied;

  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 });
  }

  const entityType = normalizeEntityType(body.entity_type);
  if (!entityType) {
    return NextResponse.json({ data: null, error: "entity_type required" }, { status: 400 });
  }

  const layout = prepareReportLayoutForSave(body.layout_settings ?? {});
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("report_layout_defaults")
    .upsert({
      entity_type: entityType,
      layout_settings: layout,
      updated_at: now,
      updated_by: user.id,
      updated_by_email: user.email ?? null,
    }, { onConflict: "entity_type" })
    .select("entity_type, layout_settings, updated_at, updated_by_email")
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "update",
    entityType: "report_layout_defaults",
    entityId: entityType,
    actorId: user.id,
    actorName: user.email ?? "",
    metadata: { entity_type: entityType, layout_settings: layout },
  });

  return NextResponse.json({
    data: {
      entity_type: String(data.entity_type),
      layout_settings: reportLayoutFromStoredValue(data.layout_settings),
      updated_at: data.updated_at ?? null,
      updated_by_email: data.updated_by_email ?? null,
    },
    error: null,
  } satisfies ReportLayoutDefaultResponse);
}
