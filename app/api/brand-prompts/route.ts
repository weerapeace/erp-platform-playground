/**
 * Prompt ต่อแบรนด์ (override) — /api/brand-prompts
 * GET   ?brand_id=  (tasks.view)        → prompt ที่แบรนด์ตั้งไว้ ต่อชนิดงานย่อย
 * PATCH { brand_id, subtask_type, prompt_template } (task_template.edit)
 *        prompt_template ว่าง/null = กลับไปใช้ค่าเริ่มต้น (ลบ row)
 * ตาราง erp_brand_subtask_prompts (PK brand_id+subtask_type)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type BrandPrompt = { brand_id: string; subtask_type: string; prompt_template: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!brandId) return NextResponse.json({ data: [], error: "ต้องระบุ brand_id" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("erp_brand_subtask_prompts").select("brand_id, subtask_type, prompt_template").eq("brand_id", brandId);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as BrandPrompt[], error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "task_template.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; subtask_type?: string; prompt_template?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  const subtask_type = (body.subtask_type ?? "").trim();
  if (!brand_id || !subtask_type) return NextResponse.json({ error: "ต้องมี brand_id + subtask_type" }, { status: 400 });
  const tmpl = (body.prompt_template ?? "").trim();
  const admin = supabaseAdmin();
  if (!tmpl) {
    // ว่าง = กลับค่าเริ่มต้น (ลบ override)
    const { error } = await admin.from("erp_brand_subtask_prompts").delete().eq("brand_id", brand_id).eq("subtask_type", subtask_type);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await admin.from("erp_brand_subtask_prompts")
      .upsert({ brand_id, subtask_type, prompt_template: tmpl, updated_at: new Date().toISOString(), updated_by: user?.id ?? null }, { onConflict: "brand_id,subtask_type" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await writeAudit(admin, { action: "update", entityType: "brand_subtask_prompt", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id, subtask_type, reset: !tmpl } });
  return NextResponse.json({ ok: true, error: null });
}
