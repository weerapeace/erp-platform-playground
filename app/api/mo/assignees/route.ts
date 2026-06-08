/**
 * รายชื่อผู้รับงาน (สำหรับใบจ่ายงาน) — ช่าง (พนักงาน) + แผนก
 * GET /api/mo/assignees  → { craftsmen: [...], departments: [...] }
 * อ่านผ่าน auth (RLS)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Assignee = { id: string; name: string; code: string | null; department_id?: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = supabaseFromRequest(request);
  const [{ data: emps }, { data: deps }] = await Promise.all([
    supabase.from("employees")
      .select("id, employee_code, nickname, first_name_th, last_name_th, first_name, last_name, resign_date, department_id")
      .is("resign_date", null).limit(1000),
    supabase.from("departments").select("id, code, name, status").limit(500),
  ]);

  const craftsmen: Assignee[] = (emps ?? []).map((e: Record<string, unknown>) => {
    const th = [e.first_name_th, e.last_name_th].filter(Boolean).join(" ").trim();
    const en = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
    const nick = (e.nickname as string) || "";
    const name = [th || en, nick && `(${nick})`].filter(Boolean).join(" ") || (e.employee_code as string) || "—";
    return { id: String(e.id), name, code: (e.employee_code as string) ?? null, department_id: (e.department_id as string) ?? null };
  }).sort((a, b) => a.name.localeCompare(b.name, "th"));

  const departments: Assignee[] = (deps ?? [])
    .filter((d: Record<string, unknown>) => !d.status || d.status === "active")
    .map((d: Record<string, unknown>) => ({ id: String(d.id), name: (d.name as string) ?? "—", code: (d.code as string) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return NextResponse.json({ craftsmen, departments, error: null });
}
