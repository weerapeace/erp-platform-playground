/**
 * POST /api/admin/schema/delete-field
 * ลบ field ออกจาก Field Registry — และ (ถ้า drop_column) DROP คอลัมน์จริงใน Supabase ด้วย
 *
 * body: { module_key, field_key, drop_column?: boolean, actor? }
 *
 * ⚠️ ถ้า drop_column = true → ข้อมูลในคอลัมน์นั้นหายถาวร (กู้คืนไม่ได้)
 * ปลอดภัย: DDL ผ่าน RPC erp_admin_drop_column (กัน system field + allowlist module table)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_FIELDS = new Set(["id", "created_at", "updated_at", "is_active"]);

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "admin.schema.delete_field");
  if (denied) return denied;

  // ต้อง login
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let b: { module_key?: string; field_key?: string; drop_column?: boolean; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.module_key || !b.field_key) return NextResponse.json({ error: "ต้องมี module_key + field_key" }, { status: 400 });
  if (SYSTEM_FIELDS.has(b.field_key)) return NextResponse.json({ error: `ห้ามลบ system field: ${b.field_key}` }, { status: 400 });

  const admin = supabaseAdmin();

  // หา module + field registry row
  const { data: mod } = await admin.from("erp_modules").select("id, table_name").eq("module_key", b.module_key).maybeSingle();
  if (!mod) return NextResponse.json({ error: "ไม่พบ module " + b.module_key }, { status: 404 });

  const { data: field } = await admin.from("erp_module_fields")
    .select("id, column_name, ui_field_type")
    .eq("module_id", mod.id).eq("field_key", b.field_key).maybeSingle();

  // virtual = ไม่มีคอลัมน์จริง (computed/o2m/m2m/related) → ลบแค่ทะเบียน
  const isVirtual = !field?.column_name
    || ["computed", "one2many", "many2many", "related"].includes(String(field?.ui_field_type ?? ""));

  // 1) DROP คอลัมน์จริง (ถ้าขอ + เป็นคอลัมน์จริง)
  if (b.drop_column && !isVirtual) {
    const r = await admin.rpc("erp_admin_drop_column", { p_table: mod.table_name, p_column: b.field_key });
    if (r.error) return NextResponse.json({ error: "ลบคอลัมน์ไม่สำเร็จ: " + r.error.message }, { status: 500 });
  }

  // 2) ลบออกจากทะเบียน field
  const { error: delErr } = await admin.from("erp_module_fields").delete().eq("module_id", mod.id).eq("field_key", b.field_key);
  if (delErr) return NextResponse.json({ error: "ลบทะเบียน field ไม่สำเร็จ: " + delErr.message }, { status: 500 });

  // 3) audit log (ของกลาง — ลง audit_logs, ไม่ throw)
  await writeAudit(admin, {
    action: b.drop_column && !isVirtual ? "schema.drop_field" : "schema.remove_field",
    entityType: mod.table_name as string,
    actorId: user.id, actorName: b.actor ?? user.email ?? null,
    metadata: {
      module: b.module_key, field: `${mod.table_name}.${b.field_key}`,
      ui_type: field?.ui_field_type ?? null, dropped_column: !!b.drop_column && !isVirtual,
    },
  });

  return NextResponse.json({ ok: true, dropped_column: !!b.drop_column && !isVirtual });
}
