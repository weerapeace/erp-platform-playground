/**
 * ปัญหา/ของเสียของใบสั่งผลิต (defect_logs) — /api/mo/issues
 * GET ?mo_no=   → รายการปัญหาที่ผูกกับงานนี้ (ใหม่→เก่า)
 * POST { mo_no, defect_type, severity?, qty?, cause? } → ลงปัญหาใหม่
 * DELETE ?id=   → ลบ (soft: is_active=false)
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MoIssue = {
  id: string; defect_no: string | null; defect_type: string | null; severity: string | null;
  qty: number | null; cause: string | null; created_at: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return NextResponse.json({ data: [], error: null });
  const { data, error } = await supabaseAdmin().from("defect_logs")
    .select("id, defect_no, defect_type, severity, qty, cause, created_at")
    .eq("source_job", moNo).eq("is_active", true).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const out: MoIssue[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), defect_no: (r.defect_no as string) ?? null, defect_type: (r.defect_type as string) ?? null,
    severity: (r.severity as string) ?? null, qty: r.qty != null ? Number(r.qty) : null, cause: (r.cause as string) ?? null, created_at: String(r.created_at ?? ""),
  }));
  return NextResponse.json({ data: out, error: null });
}

type PostBody = { mo_no?: string; defect_type?: string; severity?: string; qty?: unknown; cause?: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PostBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const moNo = (b.mo_no ?? "").trim();
  const dtype = (b.defect_type ?? "").trim();
  if (!moNo || !dtype) return NextResponse.json({ error: "ต้องระบุงานและรายละเอียดปัญหา" }, { status: 400 });

  const admin = supabaseAdmin();
  let defectNo = "";
  try { const { data: n } = await admin.rpc("erp_next_number", { p_key: "defect" }); if (n) defectNo = String(n); } catch { /* ไม่มี numbering ก็ปล่อยว่าง */ }

  const qty = b.qty != null && b.qty !== "" ? Number(b.qty) : null;
  const { data, error } = await admin.from("defect_logs").insert({
    defect_no: defectNo || null, source_job: moNo, defect_type: dtype, severity: (b.severity ?? "").trim() || "medium",
    qty: qty != null && isFinite(qty) ? qty : null, cause: (b.cause ?? "").trim() || null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "defect_log", entityId: (data as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { mo_no: moNo, defect_type: dtype, severity: b.severity } });
  return NextResponse.json({ id: (data as { id: string }).id, defect_no: defectNo || null, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("defect_logs").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "defect_log", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
