/**
 * POST /api/admin/schema/create-table
 * สร้าง table ใหม่จากเว็บ → CREATE TABLE + register module + field 'name'
 * body: { table, label, icon? }
 * → ใช้งานได้ทันทีที่ /m/<table> (catch-all page) โดยไม่ต้องเขียนโค้ด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NAME_RE = /^[a-z][a-z0-9_]{1,62}$/;

export async function POST(request: NextRequest) {
  let b: { table?: string; label?: string; icon?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.table || !b.label) return NextResponse.json({ error: "ต้องมี table + label" }, { status: 400 });
  if (!NAME_RE.test(b.table)) return NextResponse.json({ error: "ชื่อ table: a-z, 0-9, _ เริ่มด้วยตัวอักษร" }, { status: 400 });

  const admin = supabaseAdmin();

  // 1) สร้าง table (DDL ผ่าน SECURITY DEFINER)
  const r = await admin.rpc("erp_admin_create_table", { p_table: b.table });
  if (r.error) return NextResponse.json({ error: "สร้าง table ไม่สำเร็จ: " + r.error.message }, { status: 500 });

  // 2) register module
  const { data: mod, error: e2 } = await admin.from("erp_modules").insert({
    module_key: b.table, table_name: b.table, label: b.label,
    description: "สร้างจากเว็บ", primary_field: "name", source_type: "physical",
    config: { api_path: `/api/master-v2/${b.table}`, entity_type: b.table, icon: b.icon ?? "🧩" },
    is_active: true, sort_order: 200,
  }).select("id").maybeSingle();
  if (e2 || !mod) return NextResponse.json({ error: "register module ไม่สำเร็จ: " + (e2?.message ?? "") }, { status: 500 });

  // 3) field 'name' (core, visible, searchable, required)
  await admin.from("erp_module_fields").insert({
    module_id: mod.id, field_key: "name", column_name: "name", field_label: "ชื่อ",
    ui_field_type: "text", data_type: "text", source: "physical", group_key: "core",
    is_visible: true, is_required: true, is_editable: true, is_filterable: false,
    is_sortable: true, is_searchable: true, width: 220, display_order: 10, show_in_form: true,
  });

  // 4) audit (best-effort)
  await admin.from("erp_audit_logs").insert({
    actor_name: "system", action: "schema.create_table", module: b.table, record_label: b.table,
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, module_key: b.table });
}
