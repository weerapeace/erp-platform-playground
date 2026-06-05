/**
 * POST /api/admin/schema/add-field
 * เพิ่ม field ใหม่จากเว็บ → สร้าง column จริงใน Supabase + ลงทะเบียนใน Field Registry
 *
 * body: {
 *   module_key, table, field_key, label, ui_type,
 *   target_table?, target_label_field?,   // สำหรับ relation (many2one)
 *   options?: string[],                    // สำหรับ select
 *   is_visible?, is_filterable?, is_searchable?, group_key?, actor?
 * }
 *
 * ปลอดภัย: DDL ทำผ่าน SECURITY DEFINER function (allowlist เฉพาะ module table + validate ชื่อ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
  module_key: string;
  table?: string;        // optional — ถ้าไม่ส่ง จะหาเองจาก module_key
  field_key: string;
  label: string;
  ui_type: string;                 // text|textarea|number|date|boolean|select|relation|image|many2many|one2many|related
  target_table?: string;
  target_label_field?: string;
  target_fk_column?: string;       // สำหรับ one2many — column บน target ที่ชี้กลับมา
  // related: ดึงค่าจากตารางที่เชื่อม มาโชว์ (read-only, ไม่มี column จริง)
  via_field?: string;              // field_key ของ relation (FK) บน module นี้ที่จะเดินผ่าน
  via_column?: string;             // column FK จริงบนตารางนี้ (ปกติ = via_field)
  target_field?: string;           // column บน target ที่จะดึงมาโชว์
  // computed: ช่องคำนวณอัตโนมัติ (virtual, read-only) — เก็บสูตรไว้ใน relation_config
  formula?: string;                // เช่น "qty * price_est"
  compute_format?: string;         // number | currency | percent
  compute_decimals?: number;       // จำนวนทศนิยม
  compute_summary?: boolean;       // แสดงผลรวมท้ายตาราง
  options?: string[];
  is_visible?: boolean;
  is_filterable?: boolean;
  is_searchable?: boolean;
  group_key?: string;
  // ── ตั้งค่าเพิ่มเติม (advanced) — ตั้งได้ตั้งแต่ตอนสร้าง field ──
  is_required?: boolean;
  is_editable?: boolean;
  is_inline_editable?: boolean;   // แก้เร็วในตาราง (double-click)
  is_bulk_editable?: boolean;
  show_in_form?: boolean;
  is_sensitive?: boolean;
  sensitive_permission?: string | null;
  view_roles?: string[] | null;   // สิทธิ์ระดับฟิลด์ (ของกลาง) — ว่าง = ทุกคน
  edit_roles?: string[] | null;
  help_text?: string | null;
  description?: string | null;    // หมายเหตุภายใน (admin)
  default_value?: string | null;
  width?: number;
  validation_rules?: Record<string, unknown>;   // { rules: string[] }
  condition_rules?: Record<string, unknown>;     // { show_if: { field, operator, value } }
  actor?: string;
};

const FIELD_RE = /^[a-z][a-z0-9_]{0,62}$/;

export async function POST(request: NextRequest) {
  let b: Body;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!b.module_key || !b.field_key || !b.label || !b.ui_type) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ (module_key, field_key, label, ui_type)" }, { status: 400 });
  }
  if (!FIELD_RE.test(b.field_key)) {
    return NextResponse.json({ error: "ชื่อ field ต้องเป็น a-z, 0-9, _ และเริ่มด้วยตัวอักษร" }, { status: 400 });
  }
  if (b.ui_type === "relation" && !b.target_table) {
    return NextResponse.json({ error: "relation ต้องระบุ table ปลายทาง" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // หา module + table name จาก module_key (UI ไม่ต้องส่ง table)
  const { data: mod, error: modErr } = await admin
    .from("erp_modules").select("id, table_name").eq("module_key", b.module_key).maybeSingle();
  if (modErr || !mod) return NextResponse.json({ error: "ไม่พบ module " + b.module_key }, { status: 404 });
  const table = b.table || (mod.table_name as string);

  // related/m2m/o2m/computed = virtual (ไม่มี column จริงบนตารางนี้)
  const isComputed = b.ui_type === "computed";
  const isVirtual = b.ui_type === "many2many" || b.ui_type === "one2many" || b.ui_type === "related" || isComputed;
  const isRelated = b.ui_type === "related";
  // computed ต้องมีสูตร
  if (isComputed && !b.formula?.trim()) {
    return NextResponse.json({ error: "computed ต้องระบุสูตร (formula)" }, { status: 400 });
  }

  // 1) เพิ่ม column จริง (ยกเว้น m2m/o2m ที่ไม่มี column บนตารางนี้)
  if (!isVirtual) {
    const colRes = await admin.rpc("erp_admin_add_column", {
      p_table: table, p_column: b.field_key, p_type: b.ui_type,
    });
    if (colRes.error) return NextResponse.json({ error: "เพิ่ม column ไม่สำเร็จ: " + colRes.error.message }, { status: 500 });
  }

  // 2) relation config ตามชนิด
  let relationConfig: Record<string, unknown> = {};
  const labelField = b.target_label_field || "name";
  const { data: tgtMod } = b.target_table
    ? await admin.from("erp_modules").select("module_key").eq("table_name", b.target_table).maybeSingle()
    : { data: null };
  const targetModuleKey = tgtMod?.module_key ?? b.target_table;

  if (b.ui_type === "relation" && b.target_table) {
    const fkRes = await admin.rpc("erp_admin_add_fk", { p_table: table, p_column: b.field_key, p_target: b.target_table });
    if (fkRes.error) return NextResponse.json({ error: "เพิ่ม FK ไม่สำเร็จ: " + fkRes.error.message }, { status: 500 });
    relationConfig = { allow_create: false, target_table: b.target_table, target_module_key: targetModuleKey, target_label_field: labelField, target_search_fields: [labelField] };
  } else if (b.ui_type === "many2many" && b.target_table) {
    const r = await admin.rpc("erp_admin_create_m2m", { p_src_table: table, p_field_key: b.field_key, p_target_table: b.target_table });
    if (r.error) return NextResponse.json({ error: "สร้าง many2many ไม่สำเร็จ: " + r.error.message }, { status: 500 });
    const junction = (r.data as { junction?: string })?.junction;
    relationConfig = { kind: "many2many", junction_table: junction, target_table: b.target_table, target_module_key: targetModuleKey, target_label_field: labelField };
  } else if (b.ui_type === "one2many" && b.target_table) {
    if (!b.target_fk_column) return NextResponse.json({ error: "one2many ต้องระบุ column FK บน target" }, { status: 400 });
    relationConfig = { kind: "one2many", target_table: b.target_table, target_module_key: targetModuleKey, target_fk_column: b.target_fk_column, target_label_field: labelField };
  } else if (isRelated) {
    if (!b.via_field || !b.target_field) return NextResponse.json({ error: "related ต้องระบุ via_field + target_field" }, { status: 400 });
    relationConfig = {
      kind: "related",
      via_field: b.via_field,
      via_column: b.via_column || b.via_field,
      target_table: b.target_table,
      target_module_key: targetModuleKey,
      target_field: b.target_field,
    };
  } else if (isComputed) {
    relationConfig = {
      kind: "computed",
      formula: b.formula!.trim(),
      format: ["number", "currency", "percent"].includes(b.compute_format ?? "") ? b.compute_format : "number",
      decimals: typeof b.compute_decimals === "number" ? Math.max(0, Math.min(6, b.compute_decimals)) : 2,
      summary: !!b.compute_summary,
    };
  }

  // 3) ลงทะเบียนใน Field Registry (มี mod อยู่แล้วจากด้านบน)
  // display_order = ท้ายสุด
  const { data: maxRow } = await admin.from("erp_module_fields").select("display_order").eq("module_id", mod.id).order("display_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow?.display_order as number) ?? 0) + 10;

  // virtual (related/computed) บังคับ read-only เสมอ — กันตั้งค่าขัดแย้ง
  const editableDefault = !isRelated && !isComputed;
  const cleanRoles = (r: unknown): string[] | null => {
    const arr = Array.isArray(r) ? r.filter((x) => typeof x === "string" && x) : [];
    return arr.length ? (arr as string[]) : null;
  };

  const { error: insErr } = await admin.from("erp_module_fields").insert({
    module_id: mod.id,
    field_key: b.field_key,
    column_name: isVirtual ? null : b.field_key,   // m2m/o2m ไม่มี column จริง
    field_label: b.label,
    ui_field_type: b.ui_type,
    data_type: "text",
    source: "physical",
    group_key: b.group_key || "core",
    is_visible: b.is_visible ?? true,
    is_required: !isVirtual && (b.is_required ?? false),
    is_editable: editableDefault && (b.is_editable ?? true),   // related/computed = read-only เสมอ
    is_filterable: (isRelated || isComputed) ? false : (b.is_filterable ?? false),  // ไม่มี column จริง → กรอง/เรียงไม่ได้
    is_sortable: !isRelated && !isComputed,
    is_searchable: (isRelated || isComputed) ? false : (b.is_searchable ?? false),
    width: typeof b.width === "number" ? b.width : 150,
    options: b.ui_type === "select" && b.options ? { options: b.options } : {},
    relation_config: relationConfig,
    display_order: nextOrder,
    show_in_form: b.show_in_form ?? true,
    is_inline_editable: editableDefault && (b.is_inline_editable ?? false),
    // ของกลาง: field ใหม่ชนิดปกติ → เปิด bulk edit อัตโนมัติ (virtual/image ไม่เปิด) — ปิดเองได้ที่ Studio
    is_bulk_editable: b.is_bulk_editable ?? ["text", "number", "boolean", "select", "relation", "currency", "date", "textarea"].includes(b.ui_type),
    is_sensitive: !isVirtual && (b.is_sensitive ?? false),
    sensitive_permission: b.is_sensitive ? (b.sensitive_permission || null) : null,
    view_roles: cleanRoles(b.view_roles),
    edit_roles: cleanRoles(b.edit_roles),
    help_text: b.help_text || null,
    description: b.description || null,
    default_value: b.default_value || null,
    validation_rules: b.validation_rules ?? {},
    condition_rules: b.condition_rules ?? {},
  });
  if (insErr) return NextResponse.json({ error: "ลงทะเบียน field ไม่สำเร็จ: " + insErr.message }, { status: 500 });

  // 4) audit log (ของกลาง — ลง audit_logs, ไม่ throw)
  await writeAudit(admin, {
    action: "schema.add_field", entityType: table,
    actorName: b.actor ?? "system",
    metadata: { module: b.module_key, field: `${table}.${b.field_key}`, type: b.ui_type, target: b.target_table ?? null },
  });

  return NextResponse.json({ ok: true, field_key: b.field_key });
}
