/**
 * GET /api/admin/reverse-relations?module=<moduleKey>
 * หา "relation ที่ชี้กลับมาหาโมดูลนี้" (incoming relations) จากทะเบียน field ทั้งหมด
 * → ใช้โชว์ reverse one2many อัตโนมัติในหน้า detail (ของกลาง)
 *
 * คืน: [{ source_module_key, source_label, fk_column, label_field, sub_fields, image_field }]
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const moduleKey = new URL(request.url).searchParams.get("module");
  if (!moduleKey) return NextResponse.json({ data: [], error: "module required" }, { status: 400 });

  const admin = supabaseAdmin();
  // หา table ของโมดูลนี้
  const { data: mod } = await admin.from("erp_modules").select("table_name").eq("module_key", moduleKey).maybeSingle();
  if (!mod) return NextResponse.json({ data: [], error: null });
  const myTable = mod.table_name as string;

  // หา relation fields (ทุกโมดูล) ที่ target_table = myTable
  const { data: flds } = await admin.from("erp_module_fields")
    .select("column_name, field_label, relation_config, module_id, erp_modules!inner(module_key, table_name, label)")
    .eq("ui_field_type", "relation").eq("is_active", true);

  const out: Array<{ source_module_key: string; source_label: string; fk_column: string; label_field: string; sub_fields: string[]; image_field: string | null }> = [];
  for (const f of (flds ?? []) as unknown as Array<Record<string, unknown>>) {
    const rc = (f.relation_config ?? {}) as Record<string, unknown>;
    if (String(rc.target_table ?? "") !== myTable) continue;
    const src = (Array.isArray(f.erp_modules) ? f.erp_modules[0] : f.erp_modules) as Record<string, unknown> | undefined;
    if (!src?.module_key) continue;
    out.push({
      source_module_key: String(src.module_key),
      source_label: String(src.label ?? src.module_key),
      fk_column: String(f.column_name),
      label_field: "name_th",   // RelationOne2Many จะ fallback หา title เองถ้าไม่มี
      sub_fields: ["code"],
      image_field: "cover_image_r2_key",
    });
  }
  // Phase 3a — cache 5 นาที (โครงสร้าง relation แทบไม่เปลี่ยน)
  return NextResponse.json({ data: out, error: null }, { headers: { "Cache-Control": "private, max-age=300" } });
}
