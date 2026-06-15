/**
 * GET /api/pickers/real-employees?search=&limit=
 * ดึง "พนักงานจริง" จากตาราง employees (HR/payroll) — ไม่ใช่ข้อมูลตัวอย่าง erp_playground_employees
 * คืนรูปแบบที่ EmployeePicker ใช้: { data: [{ id, code, name, email, department, position }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: [], error: "ต้อง login" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const search = (sp.get("search") ?? "").trim().replace(/[%,()]/g, "");
  const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") ?? "10", 10)));
  const admin = supabaseAdmin();

  let q = admin.from("employees")
    .select("id, employee_code, first_name, last_name, nickname, email, department_id, position_id")
    .order("employee_code", { ascending: true })
    .limit(limit);
  if (search) {
    q = q.or([
      `employee_code.ilike.%${search}%`, `first_name.ilike.%${search}%`,
      `last_name.ilike.%${search}%`, `nickname.ilike.%${search}%`, `email.ilike.%${search}%`,
    ].join(","));
  }
  const { data: emps, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (emps ?? []) as Array<Record<string, unknown>>;

  // ชื่อแผนก/ตำแหน่ง (batch)
  const deptIds = [...new Set(rows.map((r) => r.department_id).filter(Boolean).map(String))];
  const posIds = [...new Set(rows.map((r) => r.position_id).filter(Boolean).map(String))];
  const [{ data: depts }, { data: poss }] = await Promise.all([
    deptIds.length ? admin.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] }),
    posIds.length ? admin.from("positions").select("id, name").in("id", posIds) : Promise.resolve({ data: [] }),
  ]);
  const deptMap = new Map((depts ?? []).map((d: Record<string, unknown>) => [String(d.id), String(d.name ?? "")]));
  const posMap = new Map((poss ?? []).map((p: Record<string, unknown>) => [String(p.id), String(p.name ?? "")]));

  const data = rows.map((r) => {
    const clean = (s: unknown) => { const v = String(s ?? "").trim(); return v && v !== "-" ? v : ""; };
    const full = [clean(r.first_name), clean(r.last_name)].filter(Boolean).join(" ");
    const nick = clean(r.nickname);
    const name = (full && nick && full !== nick) ? `${full} (${nick})` : (full || nick || String(r.employee_code ?? ""));
    return {
      id: String(r.id),
      code: (r.employee_code as string) ?? "",
      name,
      email: (r.email as string) || null,
      department: r.department_id ? deptMap.get(String(r.department_id)) ?? null : null,
      position: r.position_id ? posMap.get(String(r.position_id)) ?? null : null,
    };
  });
  return NextResponse.json({ data, error: null });
}
