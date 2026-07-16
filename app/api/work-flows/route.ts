/**
 * GET /api/work-flows → คู่มือ Flow งาน (แต่ละงาน + ขั้นตอน + เก็บที่ไหน + ลิงก์)
 * เปิดให้ผู้ล็อกอินทุกคนดูได้ (เป็นคู่มือ ไม่ sensitive)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";

const FLOW_FIELDS = ["name", "icon", "description", "sort_order", "is_active"];
const STEP_FIELDS = ["flow_id", "step_no", "title", "icon", "files_note", "storage_label", "storage_kind", "link_url", "sort_order", "is_active"];
const pick = (obj: Record<string, unknown>, keys: string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type WorkFlowStep = {
  id: string; step_no: number; title: string; icon: string | null;
  files_note: string | null; storage_label: string | null; storage_kind: string | null; link_url: string | null;
};
export type WorkFlow = {
  id: string; flow_key: string; name: string; icon: string | null; description: string | null; steps: WorkFlowStep[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: [], error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const admin = supabaseAdmin();
  const [{ data: flows }, { data: steps }] = await Promise.all([
    admin.from("erp_work_flows").select("id, flow_key, name, icon, description").eq("is_active", true).order("sort_order"),
    admin.from("erp_work_flow_steps").select("id, flow_id, step_no, title, icon, files_note, storage_label, storage_kind, link_url").eq("is_active", true).order("sort_order"),
  ]);

  const byFlow = new Map<string, WorkFlowStep[]>();
  for (const s of (steps ?? []) as (WorkFlowStep & { flow_id: string })[]) {
    const arr = byFlow.get(s.flow_id) ?? [];
    arr.push({ id: s.id, step_no: s.step_no, title: s.title, icon: s.icon, files_note: s.files_note, storage_label: s.storage_label, storage_kind: s.storage_kind, link_url: s.link_url });
    byFlow.set(s.flow_id, arr);
  }
  const data: WorkFlow[] = ((flows ?? []) as Omit<WorkFlow, "steps">[]).map((f) => ({ ...f, steps: byFlow.get(f.id) ?? [] }));
  return NextResponse.json({ data, error: null });
}

// สร้างงาน (flow) หรือ ขั้นตอน (step) ใหม่
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  if (body.target === "flow") {
    const row: Record<string, unknown> = { ...pick(body, FLOW_FIELDS), flow_key: `flow_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}` };
    if (!row.name) return NextResponse.json({ error: "ต้องมีชื่องาน" }, { status: 400 });
    const { data, error } = await admin.from("erp_work_flows").insert(row).select().single();
    return NextResponse.json({ data, error: error ? friendlyDbError(error.message) : null }, { status: error ? 400 : 200 });
  }
  // step
  const row = pick(body, STEP_FIELDS);
  if (!row.flow_id || !row.title) return NextResponse.json({ error: "ต้องมี flow_id + ชื่อขั้นตอน" }, { status: 400 });
  const { data, error } = await admin.from("erp_work_flow_steps").insert(row).select().single();
  return NextResponse.json({ data, error: error ? friendlyDbError(error.message) : null }, { status: error ? 400 : 200 });
}

// แก้ไข flow หรือ step (body: { target, id, patch })
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { target?: string; id?: string; patch?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id || !body.patch) return NextResponse.json({ error: "ต้องมี id + patch" }, { status: 400 });
  const isFlow = body.target === "flow";
  const clean = { ...pick(body.patch, isFlow ? FLOW_FIELDS : STEP_FIELDS), updated_at: new Date().toISOString() };
  const { error } = await supabaseAdmin().from(isFlow ? "erp_work_flows" : "erp_work_flow_steps").update(clean).eq("id", body.id);
  return NextResponse.json({ error: error ? friendlyDbError(error.message) : null }, { status: error ? 400 : 200 });
}

// ลบ flow (พร้อมขั้นตอน — FK cascade) หรือ step · ?target=flow|step&id=...
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const id = sp.get("id"); const isFlow = sp.get("target") === "flow";
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from(isFlow ? "erp_work_flows" : "erp_work_flow_steps").delete().eq("id", id);
  if (!error) {   // ลบถาวร (FK cascade) → ต้องตามรอยได้
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: "delete", entityType: isFlow ? "work_flow" : "work_flow_step", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { hard: true } });
  }
  return NextResponse.json({ error: error ? friendlyDbError(error.message) : null }, { status: error ? 400 : 200 });
}
