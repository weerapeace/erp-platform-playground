/**
 * PATCH /api/storage-rules/[id] — แก้กฎที่เก็บไฟล์ 1 หมวด { provider?, max_bytes? }
 *   ตรวจด้วย validateRulePatch (หมวดที่ล็อกเปลี่ยนที่เก็บไม่ได้ · ต้องอยู่ในรายการที่อนุญาต) + ฐานข้อมูลกันอีกชั้น
 *   ทุกการแก้ลง audit_logs (action storage_rule.update) · ไม่ย้ายไฟล์เดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { STORAGE_RULE_SELECT, validateRulePatch, type StorageRule, type StorageRulePatch } from "@/lib/storage-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const { id } = await params;
  let body: StorageRulePatch;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: cur, error: curErr } = await admin.from("erp_storage_rules").select(STORAGE_RULE_SELECT).eq("id", id).maybeSingle();
  if (curErr) return NextResponse.json({ error: "โหลดกฎไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "ไม่พบหมวดนี้" }, { status: 404 });
  const rule = cur as StorageRule;

  const checked = validateRulePatch(rule, { provider: body.provider, max_bytes: body.max_bytes });
  if (checked.error !== undefined) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (!Object.keys(checked.patch).length) return NextResponse.json({ data: rule, error: null });

  const actor = await requestActor(supabaseFromRequest(request));
  const { data, error } = await admin.from("erp_storage_rules")
    .update({ ...checked.patch, updated_by: actor.name, updated_at: new Date().toISOString() })
    .eq("id", id).select(STORAGE_RULE_SELECT).single();
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(checked.patch)) changes[k] = { from: rule[k as keyof StorageRule], to: v };
  await writeAudit(admin, {
    action: "storage_rule.update", entityType: "erp_storage_rules", entityId: id,
    actorId: actor.id, actorName: actor.name,
    metadata: { rule_key: rule.rule_key, label: rule.label, changes },
  });
  return NextResponse.json({ data: data as StorageRule, error: null });
}
