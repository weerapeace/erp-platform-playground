import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { listLineMembers, updateLineMemberStatus, type LineMemberAction } from "@/lib/line-employee-portal-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await listLineMembers(), error: null });
  } catch (e) {
    return NextResponse.json({ data: { linked: [], not_linked: [] }, error: e instanceof Error ? e.message : "Load LINE members failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    const action = String(body.action ?? "").trim() as LineMemberAction;
    if (!id || !["reset", "block", "unblock"].includes(action)) {
      return NextResponse.json({ data: null, error: "invalid action" }, { status: 400 });
    }
    return NextResponse.json({ data: await updateLineMemberStatus(id, action, body.actor), error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "Update LINE member failed" }, { status: 500 });
  }
}

