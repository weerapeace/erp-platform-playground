/**
 * Subtask Type Registry (กลาง) — /api/subtask-types
 * GET  (tasks.view)        → รายการชนิดงานย่อย (registry) ที่ใช้งานอยู่
 * PATCH (task_template.edit) → upsert ชนิด (แก้ค่าความสามารถ/ค่าเริ่มต้น) by key
 * POST  (task_template.create) → สร้างชนิด custom ใหม่
 * ตาราง erp_subtask_types · เขียนผ่าน supabaseAdmin หลังเช็คสิทธิ์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// คอลัมน์ที่อนุญาตให้แก้ผ่าน API (กันแก้ key/builtin/timestamps มั่ว)
const EDITABLE = new Set([
  "label_th", "label_en", "icon", "color", "sort_order", "is_active",
  "accepts_text", "accepts_image", "accepts_multi_image", "accepts_link", "accepts_file",
  "requires_approval", "approve_target", "has_copy_prompt", "applies_to",
  "default_required", "default_due_offset_days", "default_assignee_id", "prompt_template",
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  let q = supabaseAdmin().from("erp_subtask_types").select("*").order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "task_template.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { key?: string; patch?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = (body.key ?? "").trim();
  if (!key || !body.patch) return NextResponse.json({ error: "ต้องมี key + patch" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body.patch)) if (EDITABLE.has(k)) patch[k] = v;
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_subtask_types").update(patch).eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "subtask_type", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { key, changes: Object.keys(patch).filter((k) => k !== "updated_at") } });
  return NextResponse.json({ ok: true, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "task_template.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { key?: string; label_th?: string; patch?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = (body.key ?? "").trim().toLowerCase();
  const label_th = (body.label_th ?? "").trim();
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) return NextResponse.json({ error: "key: a-z 0-9 _ เริ่มด้วยตัวอักษร" }, { status: 400 });
  if (!label_th) return NextResponse.json({ error: "ต้องมีชื่อ (label_th)" }, { status: 400 });
  const row: Record<string, unknown> = { key, label_th, is_builtin: false };
  for (const [k, v] of Object.entries(body.patch ?? {})) if (EDITABLE.has(k)) row[k] = v;
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_subtask_types").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "subtask_type", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { key, label_th } });
  return NextResponse.json({ ok: true, error: null });
}
