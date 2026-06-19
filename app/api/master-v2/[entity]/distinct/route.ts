/**
 * GET /api/master-v2/<entity>/distinct?column=<col>&limit=500
 * ดึง "ค่าที่มีจริง" (distinct) ของคอลัมน์ — สำหรับทำ dropdown filter แบบไม่ hardcode
 * ใช้ฟังก์ชันกลาง erp_distinct_values (validate identifier กัน injection)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveEntity } from "@/app/api/master-v2/[entity]/route";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE = /^[a-z_][a-z0-9_]*$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
): Promise<NextResponse> {
  const { entity } = await params;
  // ตรวจสิทธิ์ก่อน — endpoint นี้ใช้ service-role อ่านค่าตรง ๆ จึงต้องกันคนไม่ล็อกอิน
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ values: [], error: "entity ไม่รองรับ" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const column = (searchParams.get("column") ?? "").trim();
  if (!SAFE.test(column)) return NextResponse.json({ values: [], error: "column ไม่ถูกต้อง" }, { status: 400 });
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") ?? "500", 10)));

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("erp_distinct_values", {
    p_table: cfg.table, p_column: column, p_limit: limit,
  });
  if (error) {
    console.error("[api/master-v2/distinct] GET", error);
    return NextResponse.json({ values: [], options: [], error: error.message }, { status: 500 });
  }
  const values = ((data ?? []) as { value: string }[]).map((r) => r.value).filter(Boolean);

  // ถ้าเป็นคอลัมน์เชื่อมตาราง (relation) → แปลง id เป็นชื่อที่อ่านออก เพื่อทำ dropdown filter
  const rel = (cfg.relationResolves ?? []).find((r) => r.column === column);
  let options: { value: string; label: string }[] = values.map((v) => ({ value: v, label: v }));
  if (rel && values.length) {
    const sel = rel.secondaryField ? `id, ${rel.labelField}, ${rel.secondaryField}` : `id, ${rel.labelField}`;
    const { data: td } = await admin.from(rel.targetTable).select(sel).in("id", values);
    const labelMap = new Map<string, string>();
    for (const row of (td ?? []) as unknown as Record<string, unknown>[]) {
      const lbl = String(row[rel.labelField] ?? row.id ?? "");
      const sec = rel.secondaryField ? String(row[rel.secondaryField] ?? "") : "";
      labelMap.set(String(row.id), sec ? `${lbl} (${sec})` : lbl);
    }
    options = values
      .map((v) => ({ value: v, label: labelMap.get(v) ?? v }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
  }
  return NextResponse.json({ values, options, error: null });
}
