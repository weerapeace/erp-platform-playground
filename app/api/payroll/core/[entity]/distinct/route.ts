/**
 * GET /api/payroll/core/<entity>/distinct?column=<col>&limit=1000
 * ค่าที่มีจริง (distinct) ของคอลัมน์ — สำหรับตัวเลือกในตัวกรอง (DataTable)
 * relation → แปลง id เป็นชื่อ (ผ่าน relation_config ใน Field Registry) กันโชว์ UUID ดิบ
 *
 * เหตุผล: payroll core ใช้ /api/payroll/core/[entity] (คนละชุดกับ master-v2) ที่ไม่มี /distinct
 * → ตัวกรอง relation (เช่น แผนก department_id) เลยตกไปโชว์ UUID ดิบ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE = /^[a-z_][a-z0-9_]*$/i;

// entity → ตารางจริง + module_key (ไว้หา relation_config ในทะเบียน field)
const ENTITY_META: Record<string, { table: string; moduleKey: string }> = {
  employees: { table: "employees", moduleKey: "payroll-employees" },
  contracts: { table: "employee_contracts", moduleKey: "payroll-contracts" },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }): Promise<NextResponse> {
  const denied = await guardPayroll(req); if (denied) return denied;

  const { entity } = await params;
  const meta = ENTITY_META[entity];
  if (!meta) return NextResponse.json({ values: [], options: [], error: "entity ไม่รองรับ" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const column = (searchParams.get("column") ?? "").trim();
  if (!SAFE.test(column)) return NextResponse.json({ values: [], options: [], error: "column ไม่ถูกต้อง" }, { status: 400 });
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") ?? "1000", 10)));

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("erp_distinct_values", { p_table: meta.table, p_column: column, p_limit: limit });
  if (error) return NextResponse.json({ values: [], options: [], error: error.message }, { status: 500 });

  const values = ((data ?? []) as { value: string }[]).map((r) => r.value).filter(Boolean);
  let options: { value: string; label: string }[] = values.map((v) => ({ value: v, label: v }));

  // relation? → หา relation_config จากทะเบียน field แล้ว map id→ชื่อ
  if (values.length) {
    const { data: mod } = await admin.from("erp_modules").select("id").eq("module_key", meta.moduleKey).maybeSingle();
    if (mod) {
      const { data: fld } = await admin.from("erp_module_fields")
        .select("ui_field_type, relation_config").eq("module_id", mod.id).eq("column_name", column).maybeSingle();
      const rc = (fld?.relation_config ?? {}) as { target_table?: string; target_label_field?: string; secondary_label_field?: string };
      const tbl = rc.target_table, lf = rc.target_label_field ?? "name", sec = rc.secondary_label_field;
      if (fld?.ui_field_type === "relation" && tbl && SAFE.test(tbl) && SAFE.test(lf) && (!sec || SAFE.test(sec))) {
        const sel = sec ? `id, ${lf}, ${sec}` : `id, ${lf}`;
        const { data: td } = await admin.from(tbl).select(sel).in("id", values);
        const labelMap = new Map<string, string>();
        for (const row of (td ?? []) as unknown as Record<string, unknown>[]) {
          const lbl = String(row[lf] ?? row.id ?? "");
          const s = sec ? String(row[sec] ?? "") : "";
          labelMap.set(String(row.id), s ? `${lbl} (${s})` : lbl);
        }
        options = values.map((v) => ({ value: v, label: labelMap.get(v) ?? v }))
          .sort((a, b) => a.label.localeCompare(b.label, "th"));
      }
    }
  }

  return NextResponse.json({ values, options, error: null });
}
