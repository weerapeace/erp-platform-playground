/**
 * รายการปัญหาของสินค้า — ผูกที่ Parent SKU (แชร์ทุกสี/ตัวลูก)
 *
 * GET    ?parent_sku_id=... | ?sku=<child sku>   → รายการปัญหา (active, ใหม่→เก่า) + ชื่อสาเหตุ
 *        ?sku= → ปัญหาทั้งรุ่น + ปัญหาเฉพาะสีนี้ (ไม่เอาปัญหาเฉพาะสีอื่น) · ?parent_sku_id= → ทุกแถว (มี sku บอกว่าเฉพาะสีไหน)
 * POST   { parent_sku_id? | sku?, reason_id?, problem_text?, scope?: "sku" }  → เพิ่มปัญหา (กันซ้ำต่อ parent + ขอบเขตเดียวกัน)
 *        scope "sku" = จดเฉพาะสีนี้ (เก็บ sku) · ไม่ส่ง = ทั้งรุ่น (sku = null แบบเดิม)
 * PATCH  { id, problem_text }                     → แก้ข้อความที่พิมพ์ผิด (ปัญหาที่มาจาก QC แก้ไม่ได้ — เป็นบันทึกจากการตรวจ)
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
  /** null = ปัญหาของทั้งรุ่น (ทุกสี) · มีค่า = เฉพาะ SKU นี้ */
  sku: string | null;
};

// ค่า sku ใช้ในตัวกรอง .or() ของ PostgREST — ตัดอักขระที่ทำให้ตัวกรองเพี้ยน (รหัสจริงเป็นตัวอักษร/ตัวเลข/ขีด)
const skuForFilter = (s: string) => s.replace(/["(),]/g, "");

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
  const byParent = (sp.get("parent_sku_id") ?? "").trim();
  const sku = (sp.get("sku") ?? "").trim();
  const parentId = await resolveParentId(admin, byParent, sku);
  if (!parentId) return NextResponse.json({ data: [], parent_sku_id: null, error: null });

  let query = admin.from("parent_sku_issues")
    .select("id, parent_sku_id, reason_id, problem_text, source, note, created_by_name, created_at, sku")
    .eq("parent_sku_id", parentId).eq("is_active", true);
  // ดูจากสีใดสีหนึ่ง → เห็นปัญหาทั้งรุ่น + ของสีนี้ (ปัญหาเฉพาะสีอื่นไม่เกี่ยว)
  if (!byParent && sku) query = query.or(`sku.is.null,sku.eq."${skuForFilter(sku)}"`);
  const { data, error } = await query.order("created_at", { ascending: false });
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

  // ขอบเขต: เฉพาะสีนี้ (เก็บ sku) หรือทั้งรุ่น (null แบบเดิม)
  const scopeSku = body.scope === "sku" ? String(body.sku ?? "").trim() : "";
  if (body.scope === "sku" && !scopeSku) return NextResponse.json({ error: "ไม่รู้ว่าเป็นสีไหน (ไม่มีรหัส SKU)" }, { status: 400 });

  // กันซ้ำ: ข้อความเดียวกัน ขอบเขตเดียวกัน ต่อ parent ที่ยัง active อยู่ → ไม่เพิ่มซ้ำ
  const dupQ = admin.from("parent_sku_issues").select("id").eq("parent_sku_id", parentId).eq("is_active", true).ilike("problem_text", text);
  const { data: dup } = await (scopeSku ? dupQ.eq("sku", scopeSku) : dupQ.is("sku", null)).limit(1).maybeSingle();
  if (dup) return NextResponse.json({ error: null, duplicated: true, id: (dup as { id: string }).id });

  const source = String(body.source ?? "manual").trim() || "manual";
  const { data: ins, error } = await admin.from("parent_sku_issues").insert({
    parent_sku_id: parentId, reason_id: reasonId, problem_text: text, source, sku: scopeSku || null,
    note: String(body.note ?? "").trim() || null,
    created_by: user?.id ?? null, created_by_name: user?.email ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "parent_sku_issue", entityId: (ins as { id: string }).id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { parent_sku_id: parentId, problem_text: text, source, sku: scopeSku || null },
  });
  return NextResponse.json({ error: null, id: (ins as { id: string }).id });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.defect"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  const text = String(body.problem_text ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "พิมพ์ปัญหาก่อน" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("parent_sku_issues").select("id, parent_sku_id, problem_text, source, is_active, sku").eq("id", id).maybeSingle();
  const c = cur as { parent_sku_id: string; problem_text: string; source: string; is_active: boolean; sku: string | null } | null;
  if (!c || c.is_active === false) return NextResponse.json({ error: "ไม่พบรายการปัญหานี้" }, { status: 404 });
  if (c.source === "qc") return NextResponse.json({ error: "ปัญหานี้บันทึกมาจากการตรวจ QC แก้ข้อความไม่ได้ — ถ้าไม่ใช่ให้ลบแล้วเพิ่มใหม่" }, { status: 400 });
  if (text === c.problem_text) return NextResponse.json({ error: null, updated: false });

  // กันซ้ำกับปัญหาอื่นของสินค้าเดียวกัน (ขอบเขตเดียวกัน: ทั้งรุ่น / สีเดียวกัน)
  const dupQ = admin.from("parent_sku_issues")
    .select("id").eq("parent_sku_id", c.parent_sku_id).eq("is_active", true).ilike("problem_text", text).neq("id", id);
  const { data: dup } = await (c.sku ? dupQ.eq("sku", c.sku) : dupQ.is("sku", null)).limit(1).maybeSingle();
  if (dup) return NextResponse.json({ error: "มีปัญหาข้อความนี้อยู่แล้ว" }, { status: 400 });

  // พิมพ์เองแล้ว = ไม่ผูกกับสาเหตุกลางอีก (ข้อความไม่ตรงกับชื่อสาเหตุแล้ว)
  const { error } = await admin.from("parent_sku_issues").update({ problem_text: text, reason_id: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "parent_sku_issue", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { parent_sku_id: c.parent_sku_id, old: c.problem_text, new: text } });
  return NextResponse.json({ error: null, updated: true });
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
