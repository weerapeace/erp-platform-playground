import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { getPayrollGlobalRules, updatePayrollGlobalRules } from "@/lib/payroll-global-rules-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return NextResponse.json({ error: "ตรวจสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  if (data !== true) return NextResponse.json({ error: "ต้องมีสิทธิ์ admin.users เพื่อแก้กฎคำนวณ Payroll" }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  try {
    const data = await getPayrollGlobalRules(supabaseAdmin());
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : "โหลดกฎคำนวณ Payroll ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: { rules?: unknown; ruleSets?: unknown; actor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();
    const { data: { user } } = await supabaseFromRequest(req).auth.getUser();
    const result = await updatePayrollGlobalRules(admin, { rules: body.rules, ruleSets: body.ruleSets });

    await writeAudit(admin, {
      action: "payroll.global_rules.update",
      entityType: "erp_modules",
      entityId: result.module.id,
      actorId: user?.id ?? null,
      actorName: body.actor ?? user?.email ?? null,
      metadata: {
        module: result.module.key,
        previous: result.previous,
        previousRuleSets: result.previousRuleSets,
        next: result.rules,
        ruleSets: result.ruleSets,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        storageReady: true,
        storageReason: "เก็บกฎกลางแยกตามประเภทสัญญาไว้ใน erp_modules.config.payroll_rule_sets",
        module: result.module,
        rules: result.rules,
        ruleSets: result.ruleSets,
        updatedAt: result.updatedAt,
      },
      error: null,
    });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : "บันทึกกฎคำนวณ Payroll ไม่สำเร็จ" },
      { status: 400 },
    );
  }
}
