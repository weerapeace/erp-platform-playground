/**
 * GET /api/work-flows → คู่มือ Flow งาน (แต่ละงาน + ขั้นตอน + เก็บที่ไหน + ลิงก์)
 * เปิดให้ผู้ล็อกอินทุกคนดูได้ (เป็นคู่มือ ไม่ sensitive)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
