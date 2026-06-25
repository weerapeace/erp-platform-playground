/**
 * Record Tasks — เช็คลิสต์/โน้ตแบบ task ผูกกับ module หรือ record ใด ๆ (ของกลาง)
 *
 * GET  /api/record-tasks?module_key=design_sheets[&record_id=<id>]  → list
 *      ไม่ส่ง record_id = รายการ "ส่วนกลางของหน้า/โมดูล" (record_id is null)
 * POST /api/record-tasks  body { module_key, record_id?, record_type?, title, actor? }  → สร้าง (status='open')
 *
 * เก็บที่ตาราง erp_record_tasks · guardApi (products.view/edit) + audit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE = /^[a-z0-9_]+$/i;

export type RecordTask = {
  id: string; module_key: string; record_type: string | null; record_id: string | null;
  title: string; description: string | null; status: string; priority: string | null;
  assigned_to: string | null; created_by: string | null; due_at: string | null;
  created_at: string; updated_at: string;
};

const COLS = "id, module_key, record_type, record_id, title, description, status, priority, assigned_to, created_by, due_at, created_at, updated_at";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const moduleKey = (sp.get("module_key") ?? "").trim();
  if (!moduleKey || !SAFE.test(moduleKey)) return NextResponse.json({ data: [], error: "invalid module_key" }, { status: 400 });
  // record_id เป็น NOT NULL ในตาราง → page-level ใช้ค่าว่าง "" · มี record_id = รายการของเรคคอร์ดนั้น
  const recordId = (sp.get("record_id") ?? "").trim();

  const { data, error } = await supabaseAdmin().from("erp_record_tasks").select(COLS)
    .eq("module_key", moduleKey)
    .eq("record_id", recordId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as RecordTask[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { module_key?: string; record_id?: string | null; record_type?: string | null; title?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const moduleKey = (body.module_key ?? "").trim();
  const title = (body.title ?? "").trim();
  if (!moduleKey || !SAFE.test(moduleKey)) return NextResponse.json({ error: "invalid module_key" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "กรุณาใส่ชื่อรายการ" }, { status: 400 });

  const actor = body.actor ?? user.email ?? "system";
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_record_tasks").insert({
    module_key: moduleKey, record_id: body.record_id ?? "", record_type: body.record_type ?? "",   // NOT NULL → ใช้ "" สำหรับ page-level
    title, status: "open", created_by: actor,
  }).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "create", entityType: "record_task", entityId: data.id as string, actorId: user.id, actorName: actor, metadata: { module_key: moduleKey, title } });
  return NextResponse.json({ data, error: null });
}
