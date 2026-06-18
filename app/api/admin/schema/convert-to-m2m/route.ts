/**
 * POST /api/admin/schema/convert-to-m2m
 * แปลงฟิลด์ความสัมพันธ์เดี่ยว (FK column เช่น department_id) → many2many (เลือกได้หลายค่า)
 *
 * body: { module_key, column, target_table, target_label_field?, label?, actor? }
 *
 * ทำให้ครบในที่เดียว:
 *  1) สร้างตารางเชื่อม (junction) ผ่าน RPC erp_admin_create_m2m
 *  2) ลงทะเบียน field ชนิด many2many ใน Field Registry
 *  3) ย้ายค่าเดิมจากคอลัมน์ FK → junction (src_id, tgt_id) [เฉพาะแถวที่มีค่า]
 *  4) ซ่อนคอลัมน์เดิม (is_visible/show_in_form=false) — ไม่ลบ column จริง (กู้ได้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.schema.create_table"); if (denied) return denied;
  let b: { module_key?: string; column?: string; target_table?: string; target_label_field?: string; label?: string; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const moduleKey = b.module_key ?? "";
  const column = b.column ?? "";
  const targetTable = b.target_table ?? "";
  if (!moduleKey || !column || !targetTable) return NextResponse.json({ error: "ต้องระบุ module_key, column, target_table" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: mod } = await admin.from("erp_modules").select("id, table_name").eq("module_key", moduleKey).maybeSingle();
  if (!mod) return NextResponse.json({ error: "ไม่พบ module " + moduleKey }, { status: 404 });
  const table = mod.table_name as string;

  // field_key ใหม่ (ไม่ชน) — department_id → department_m2m
  const base = column.replace(/_id$/, "");
  let fieldKey = `${base}_m2m`;
  if (!KEY_RE.test(fieldKey)) fieldKey = `${column}_m2m`.replace(/[^a-z0-9_]/g, "");
  for (let n = 2; n < 50; n++) {
    const { data: exist } = await admin.from("erp_module_fields").select("id").eq("module_id", mod.id).eq("field_key", fieldKey).maybeSingle();
    if (!exist) break;
    fieldKey = `${base}_m2m${n}`;
  }

  // 1) สร้าง junction
  const r = await admin.rpc("erp_admin_create_m2m", { p_src_table: table, p_field_key: fieldKey, p_target_table: targetTable });
  if (r.error) return NextResponse.json({ error: "สร้างตารางเชื่อมไม่สำเร็จ: " + r.error.message }, { status: 500 });
  const junction = (r.data as { junction?: string })?.junction;
  if (!junction) return NextResponse.json({ error: "ไม่ได้ชื่อตารางเชื่อม" }, { status: 500 });

  const { data: tgtMod } = await admin.from("erp_modules").select("module_key").eq("table_name", targetTable).maybeSingle();
  const targetModuleKey = tgtMod?.module_key ?? targetTable;
  const labelField = b.target_label_field || "name";

  // 2) ลงทะเบียน field many2many
  const { data: maxRow } = await admin.from("erp_module_fields").select("display_order").eq("module_id", mod.id).order("display_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow?.display_order as number) ?? 0) + 10;
  const { error: insErr } = await admin.from("erp_module_fields").insert({
    module_id: mod.id, field_key: fieldKey, column_name: null,
    field_label: (b.label?.trim() || base) + " (หลายค่า)",
    ui_field_type: "many2many", data_type: "text", source: "physical",
    group_key: "core", is_visible: true, is_required: false, is_editable: true,
    is_filterable: false, is_sortable: false, is_searchable: false, width: 200,
    options: {}, relation_config: { kind: "many2many", junction_table: junction, target_table: targetTable, target_module_key: targetModuleKey, target_label_field: labelField },
    display_order: nextOrder, show_in_form: true, is_inline_editable: false, is_bulk_editable: false, is_sensitive: false,
  });
  if (insErr) return NextResponse.json({ error: "ลงทะเบียน field ไม่สำเร็จ: " + insErr.message }, { status: 500 });

  // 3) ย้ายค่าเดิม FK → junction (chunk)
  let migrated = 0;
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await admin.from(table).select(`id, ${column}`).not(column, "is", null).range(from, from + 999);
    if (error) break;
    const batch = (rows ?? []) as unknown as Record<string, unknown>[];
    if (batch.length === 0) break;
    const links = batch.filter((x) => x[column]).map((x) => ({ src_id: x.id, tgt_id: x[column] }));
    if (links.length > 0) { await admin.from(junction).insert(links); migrated += links.length; }
    if (batch.length < 1000) break;
  }

  // 4) ซ่อนคอลัมน์เดิม (ไม่ลบ)
  await admin.from("erp_module_fields").update({ is_visible: false, show_in_form: false })
    .eq("module_id", mod.id).eq("column_name", column);

  await writeAudit(admin, {
    action: "schema.convert_m2m", entityType: table, actorName: b.actor ?? "system",
    metadata: { module: moduleKey, from_column: column, new_field: fieldKey, junction, target: targetTable, migrated },
  });

  return NextResponse.json({ ok: true, field_key: fieldKey, junction, migrated, error: null });
}
