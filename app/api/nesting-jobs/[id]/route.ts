/**
 * /api/nesting-jobs/[id] — งานจัดเรียงงานพิมพ์ 1 งาน
 *   GET    → รายละเอียด — nesting.view
 *   PATCH  { name?, status?, print_type_id?, settings?, items?, result? } → แก้ — nesting.run
 *   DELETE → ซ่อนงาน (is_active=false กู้คืนได้) — nesting.delete
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SELECT, actorOf, cleanItems, cleanName, cleanResult, cleanSettings, cleanStatus, cleanUuid, toJob,
} from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  const id = cleanUuid((await params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
  const { data, error } = await supabaseAdmin().from("erp_nesting_jobs").select(SELECT).eq("id", id).eq("is_active", true).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  return NextResponse.json({ data: toJob(data as Record<string, unknown>), error: null });
}

export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  const id = cleanUuid((await params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = cleanName(b.name);
    if (!name) return NextResponse.json({ error: "ใส่ชื่องานก่อนบันทึก" }, { status: 400 });
    patch.name = name;
  }
  if (b.status !== undefined) {
    const status = cleanStatus(b.status);
    if (!status) return NextResponse.json({ error: "สถานะงานไม่ถูกต้อง" }, { status: 400 });
    patch.status = status;
  }
  if (b.print_type_id !== undefined) patch.print_type_id = cleanUuid(b.print_type_id);
  if (b.settings !== undefined) {
    const s = cleanSettings(b.settings);
    if (!s) return NextResponse.json({ error: "ข้อมูลงานไม่ถูกต้อง" }, { status: 400 });
    patch.settings = s;
  }
  if (b.items !== undefined) {
    const items = cleanItems(b.items);
    if (!items) return NextResponse.json({ error: "ข้อมูลงานไม่ถูกต้อง" }, { status: 400 });
    patch.items = items;
  }
  if (b.result !== undefined) patch.result = b.result ? cleanResult(b.result) : null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีอะไรเปลี่ยน" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = await actorOf(request, admin);
  const { data, error } = await admin.from("erp_nesting_jobs")
    .update({ ...patch, updated_by: actor.id, updated_by_name: actor.name, updated_at: new Date().toISOString() })
    .eq("id", id).eq("is_active", true).select(SELECT).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  await writeAuditFor(request, admin, { action: "update", entityType: "erp_nesting_jobs", entityId: id,
    metadata: { changes: Object.keys(patch), ...(patch.status ? { status: patch.status } : {}) } });
  return NextResponse.json({ data: toJob(data as Record<string, unknown>), error: null });
}

export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.delete"); if (denied) return denied;
  const id = cleanUuid((await params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
  const admin = supabaseAdmin();
  const actor = await actorOf(request, admin);
  const { data, error } = await admin.from("erp_nesting_jobs")
    .update({ is_active: false, updated_by: actor.id, updated_by_name: actor.name, updated_at: new Date().toISOString() })
    .eq("id", id).eq("is_active", true).select("id, name").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  await writeAuditFor(request, admin, { action: "delete", entityType: "erp_nesting_jobs", entityId: id, metadata: { name: data.name } });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
