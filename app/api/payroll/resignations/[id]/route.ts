import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { transitionResignation } from "@/lib/payroll-resignations-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  if (!["approve", "reject", "cancel"].includes(action)) {
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const { id } = await ctx.params;
    const row = await transitionResignation(id, {
      action: action as "approve" | "reject" | "cancel",
      review_note: body.review_note,
      actor: body.actor,
    });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : "อัปเดตคำขอแจ้งลาออกไม่สำเร็จ",
    }, { status: 500 });
  }
}
