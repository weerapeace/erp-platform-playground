/**
 * จัดการ "กลุ่มฟิลด์" (Field Groups / หมวดในฟอร์ม) ต่อโมดูล — ของกลาง
 *
 * เก็บ meta (label + icon) ของแต่ละ group_key ไว้ใน erp_modules.config.field_groups
 *   { "<group_key>": { label, icon } }
 *
 * PATCH /api/admin/field-groups
 *   body: { module_key, action: "upsert"|"rename", key, new?, label?, icon?, actor? }
 *   - upsert : ตั้ง/แก้ label+icon ของกลุ่ม
 *   - rename : เปลี่ยน key (ย้าย group_key ของทุกฟิลด์ old → new) + ย้าย meta
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GMeta = { label?: string; icon?: string };

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (data !== true) return "ไม่มีสิทธิ์จัดการกลุ่มฟิลด์ (admin.users)";
  return null;
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await requireAdmin(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  let b: { module_key?: string; action?: string; key?: string; new?: string; label?: string; icon?: string; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const moduleKey = String(b.module_key ?? "").trim();
  const action = b.action ?? "upsert";
  const key = String(b.key ?? "").trim();
  if (!moduleKey || !key) return NextResponse.json({ error: "ต้องมี module_key + key" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const { data: mod } = await admin.from("erp_modules").select("id, config").eq("module_key", moduleKey).maybeSingle();
  if (!mod) return NextResponse.json({ error: "ไม่พบโมดูล" }, { status: 404 });

  const config = { ...((mod.config ?? {}) as Record<string, unknown>) };
  const groups: Record<string, GMeta> = { ...((config.field_groups ?? {}) as Record<string, GMeta>) };

  if (action === "rename") {
    const newKey = String(b.new ?? "").trim();
    if (!newKey) return NextResponse.json({ error: "ต้องระบุชื่อกลุ่มใหม่" }, { status: 400 });
    if (newKey !== key) {
      // ย้าย group_key ของทุกฟิลด์ในโมดูลนี้ old → new
      const { error: e1 } = await admin.from("erp_module_fields").update({ group_key: newKey }).eq("module_id", mod.id).eq("group_key", key);
      if (e1) return NextResponse.json({ error: "ย้ายกลุ่มไม่สำเร็จ: " + e1.message }, { status: 500 });
      groups[newKey] = { label: b.label ?? newKey, icon: b.icon ?? groups[key]?.icon ?? "📁" };
      delete groups[key];
    } else {
      groups[key] = { label: b.label ?? groups[key]?.label ?? key, icon: b.icon ?? groups[key]?.icon ?? "📁" };
    }
  } else {
    // upsert
    groups[key] = {
      label: b.label ?? groups[key]?.label ?? key,
      icon: b.icon ?? groups[key]?.icon ?? "📁",
    };
  }

  config.field_groups = groups;
  const { error: e2 } = await admin.from("erp_modules").update({ config }).eq("id", mod.id);
  if (e2) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + e2.message }, { status: 500 });

  await writeAudit(admin, {
    action: "field_group.update", entityType: "erp_modules", entityId: mod.id,
    actorId: user?.id ?? null, actorName: b.actor ?? user?.email ?? null,
    metadata: { module: moduleKey, action, key, new: b.new ?? null, icon: b.icon ?? null },
  });

  return NextResponse.json({ ok: true, field_groups: groups });
}
