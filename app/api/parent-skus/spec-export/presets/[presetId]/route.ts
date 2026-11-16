/**
 * 📤 ชุดช่องส่งออกรายละเอียดสินค้า — PATCH { name?, config? } แก้ · DELETE ลบ (ซ่อน is_active=false · กู้ได้ในฐานข้อมูล)
 *   สิทธิ์: products.edit · audit spec_export_preset_update / spec_export_preset_delete (เก็บค่าเดิมไว้)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanPresetConfig } from "@/lib/spec-export";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ presetId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Ctx) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { presetId } = await params;
  if (!UUID.test(presetId)) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  let body: { name?: unknown; config?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("spec_export_presets").select("name, config").eq("id", presetId).eq("is_active", true).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const patch: Record<string, unknown> = { updated_by: user?.id ?? null, updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "ตั้งชื่อชุดก่อน" }, { status: 400 });
    patch.name = name;
  }
  if (body.config !== undefined) patch.config = cleanPresetConfig(body.config);
  const { error } = await admin.from("spec_export_presets").update(patch).eq("id", presetId);
  if (error) return NextResponse.json({ error: "บันทึกชุดช่องไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, {
    action: "spec_export_preset_update", entityType: "spec_export_preset", entityId: presetId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { changes: { name: patch.name !== undefined ? { old: before.name, new: patch.name } : undefined, config: patch.config !== undefined ? { old: before.config, new: patch.config } : undefined } },
  });
  return NextResponse.json({ data: { id: presetId, name: patch.name ?? before.name, config: patch.config ?? cleanPresetConfig(before.config) }, error: null });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { presetId } = await params;
  if (!UUID.test(presetId)) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("spec_export_presets").select("name, config").eq("id", presetId).eq("is_active", true).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบชุดนี้" }, { status: 404 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { error } = await admin.from("spec_export_presets").update({ is_active: false, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", presetId);
  if (error) return NextResponse.json({ error: "ลบชุดช่องไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, {
    action: "spec_export_preset_delete", entityType: "spec_export_preset", entityId: presetId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { name: before.name, config: before.config },
  });
  return NextResponse.json({ data: { id: presetId }, error: null });
}
