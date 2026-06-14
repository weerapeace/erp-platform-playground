/**
 * โกดัง QC — จัดการธง "ช่างเหมา" ที่พนักงาน (สำหรับ badge งานเหมา)
 * GET   → รายชื่อพนักงาน (id, name, code, is_subcontract)
 * PATCH { id, is_subcontract } → ตั้ง/ปลดธงช่างเหมา
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Subcontractor = { id: string; name: string; code: string | null; is_subcontract: boolean };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("employees")
    .select("id, employee_code, nickname, first_name_th, last_name_th, first_name, last_name, is_subcontract")
    .is("resign_date", null).limit(2000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows: Subcontractor[] = (data ?? []).map((e: Record<string, unknown>) => {
    const th = [e.first_name_th, e.last_name_th].filter(Boolean).join(" ").trim();
    const en = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
    const nick = (e.nickname as string) || "";
    const name = [th || en, nick && `(${nick})`].filter(Boolean).join(" ") || (e.employee_code as string) || "—";
    return { id: String(e.id), name, code: (e.employee_code as string) ?? null, is_subcontract: !!e.is_subcontract };
  }).sort((a, b) => Number(b.is_subcontract) - Number(a.is_subcontract) || a.name.localeCompare(b.name, "th"));
  return NextResponse.json({ data: rows, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.move"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("employees").update({ is_subcontract: !!body.is_subcontract }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "employees", entityId: String(body.id), actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { is_subcontract: !!body.is_subcontract } });
  return NextResponse.json({ error: null });
}
