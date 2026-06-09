import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import {
  applyPayrollEmployeeSettingTemplate,
  getPayrollEmployeeSettingTemplates,
  updatePayrollEmployeeSettingTemplates,
} from "@/lib/payroll-employee-setting-templates-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return NextResponse.json({ error: "ตรวจสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  if (data !== true) return NextResponse.json({ error: "ต้องมีสิทธิ์ admin.users เพื่อแก้ template เงินเดือนรายคน" }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  try {
    const data = await getPayrollEmployeeSettingTemplates(supabaseAdmin());
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : "โหลด template เงินเดือนรายคนไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: { templates?: unknown; actor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();
    const { data: { user } } = await supabaseFromRequest(req).auth.getUser();
    const result = await updatePayrollEmployeeSettingTemplates(admin, body.templates);

    await writeAudit(admin, {
      action: "payroll.employee_setting_templates.update",
      entityType: "erp_modules",
      entityId: result.module.id,
      actorId: user?.id ?? null,
      actorName: body.actor ?? user?.email ?? null,
      metadata: {
        module: result.module.key,
        previous: result.previous,
        templates: result.templates,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        storageReady: true,
        storageReason: "เก็บ template รายคนตามประเภทสัญญาไว้ใน erp_modules.config.payroll_employee_setting_templates",
        module: result.module,
        templates: result.templates,
        updatedAt: result.updatedAt,
      },
      error: null,
    });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : "บันทึก template เงินเดือนรายคนไม่สำเร็จ" },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: { action?: string; templateKey?: string; actor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.action !== "apply") {
    return NextResponse.json({ error: "action ไม่รองรับ" }, { status: 400 });
  }
  if (!body.templateKey) {
    return NextResponse.json({ error: "ต้องระบุ templateKey" }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();
    const { data: { user } } = await supabaseFromRequest(req).auth.getUser();
    const result = await applyPayrollEmployeeSettingTemplate(admin, body.templateKey);

    await writeAudit(admin, {
      action: "payroll.employee_setting_templates.apply",
      entityType: "employee_payroll_settings",
      entityId: body.templateKey,
      actorId: user?.id ?? null,
      actorName: body.actor ?? user?.email ?? null,
      metadata: result,
    });

    return NextResponse.json({ ok: true, data: result, error: null });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : "นำ template ไปใช้ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
