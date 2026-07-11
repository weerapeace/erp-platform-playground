/**
 * รายการปัญหาของสินค้า — ผูกที่ Parent SKU (แชร์ทุกสี/ตัวลูก)
 *
 * GET    ?parent_sku_id=... | ?sku=<child sku>   → รายการปัญหา (active, ใหม่→เก่า) + ชื่อสาเหตุ
 * POST   { parent_sku_id? | sku?, reason_id?, problem_text? }  → เพิ่มปัญหา (กันซ้ำต่อ parent)
 * DELETE ?id=...                                  → ลบ (soft is_active=false)
 *
 * resolve parent จาก sku ลูกให้เอง (skus_v2.parent_sku_id). ใช้ของกลาง guardApi + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ParentIssue = {
  id: string; parent_sku_id: string; reason_id: string | null;
  problem_text: string; source: string; note: string | null;
  created_by_name: string | null; created_at: string;
};

// หา parent_sku_id จาก sku ลูก (หรือรับ parent_sku_id ตรง ๆ)
async function resolveParentId(admin: ReturnType<typeof supabaseAdmin>, parentSkuId: string, sku: string): Promise<string | null> {
  if (parentSkuId) return parentSkuId;
  if (!sku) return null;
  const { data } = await admin.from("skus_v2").select("parent_sku_id").eq("code", sku).maybeSingle();
  return (data as { parent_sku_id: string | null } | null)?.parent_sku_id ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const parentId = await resolveParentId(admin, (sp.get("parent_sku_id") ?? "").trim(), (sp.get("sku") ?? "").trim());
  if (!parentId) return NextResponse.json({ data: [], parent_sku_id: null, error: null });

  const { data, error } = await admin.from("parent_sku_issues")
    .select("id, parent_sku_id, reason_id, problem_text, source, note, created_by_name, created_at")
    .eq("parent_sku_id", parentId).eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ data: [], parent_sku_id: parentId, error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as ParentIssue[], parent_sku_id: parentId, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.defect"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const body = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const parentId = await resolveParentId(admin, String(body.parent_sku_id ?? "").trim(), String(body.sku ?? "").trim());
  if (!parentId) return NextResponse.json({ error: "หาสินค้า (Parent SKU) ไม่พบ" }, { status: 400 });

  const reasonId = String(body.reason_id ?? "").trim() || null;
  let text = String(body.problem_text ?? "").trim();
  // เลือกจากสาเหตุกลาง → ใช้ชื่อสาเหตุเป็นข้อความ (ถ้าไม่ได้พิมพ์เอง)
  if (reasonId && !text) {
    const { data: r } = await admin.from("qc_defect_reasons").select("name").eq("id", reasonId).maybeSingle();
    text = String((r as { name?: string } | null)?.name ?? "").trim();
  }
  if (!text) return NextResponse.json({ error: "เลือกสาเหตุ หรือพิมพ์ปัญหาก่อน" }, { status: 400 });

  // กันซ้ำ: ปัญหาข้อความเดียวกันต่อ parent ที่ยัง active อยู่ → ไม่เพิ่มซ้ำ
  const { data: dup } = await admin.from("parent_sku_issues")
    .select("id").eq("parent_sku_id", parentId).eq("is_active", true).ilike("problem_text", text).maybeSingle();
  if (dup) return NextResponse.json({ error: null, duplicated: true, id: (dup as { id: string }).id });

  const source = String(body.source ?? "manual").trim() || "manual";
  const { data: ins, error } = await admin.from("parent_sku_issues").insert({
    parent_sku_id: parentId, reason_id: reasonId, problem_text: text, source,
    note: String(body.note ?? "").trim() || null,
    created_by: user?.id ?? null, created_by_name: user?.email ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "parent_sku_issue", entityId: (ins as { id: string }).id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { parent_sku_id: parentId, problem_text: text, source },
  });
  return NextResponse.json({ error: null, id: (ins as { id: string }).id });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.defect"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("parent_sku_issues").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "parent_sku_issue", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ error: null });
}
