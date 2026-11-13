/**
 * /api/subscriptions/catalog/[id] — แก้ / ลบ แอปในคลังแพ็กเกจ
 *
 * PATCH  → { name?, category?, site?, logo_url?, plans? }  (subscriptions.view) — แก้แพ็กเกจ = ส่ง plans ทั้งชุด
 * DELETE → ลบแอปออกจากคลัง (subscriptions.edit) — รายการที่เลือกแพ็กเกจไว้ยังโชว์ชื่อแพ็กเกจเดิม (เก็บใน subscriptions.plan_name)
 * ⚠️ เปลี่ยนราคาแพ็กเกจ ไม่แก้ราคาในรายการเดิม (ฟอร์มขึ้นเตือน "ราคาไม่ตรงแพ็กเกจ" ให้กดเอง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAuditFor } from "@/lib/audit";
import { toCatalogApp, toCatalogRow, validateCatalogInput, type CatalogInput } from "@/lib/subscription-catalog";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;
  const { id } = await params;

  let body: CatalogInput;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const err = validateCatalogInput(body, false);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const db = supabaseAdmin();
  const { data: before } = await db.from("subscription_app_catalog").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบแอปนี้ในคลัง" }, { status: 404 });

  const patch = toCatalogRow(body);
  const { data, error } = await db.from("subscription_app_catalog").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error?.code === "23505") return NextResponse.json({ error: `มีแอปชื่อ "${String(patch.name ?? "")}" ในคลังอยู่แล้ว` }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "บันทึกไม่สำเร็จ" }, { status: 500 });

  const app = toCatalogApp(data as Record<string, unknown>);
  await writeAuditFor(request, db, {
    action: "update", entityType: "subscription_app_catalog", entityId: id,
    metadata: { name: app.name, changes: auditDiff(before as Record<string, unknown>, patch) },
  });
  return NextResponse.json({ data: app, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { id } = await params;

  const db = supabaseAdmin();
  const { data: before } = await db.from("subscription_app_catalog").select("name, plans").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบแอปนี้ในคลัง" }, { status: 404 });
  const { error } = await db.from("subscription_app_catalog").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditFor(request, db, {
    action: "delete", entityType: "subscription_app_catalog", entityId: id,
    metadata: { name: (before as { name: string }).name, plans: (before as { plans: unknown }).plans },
  });
  return NextResponse.json({ ok: true, error: null });
}
