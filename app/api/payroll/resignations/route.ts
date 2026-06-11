import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { createResignation, listResignations } from "@/lib/payroll-resignations-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  try {
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "1000", 10) || 1000;
    const rows = await listResignations(limit);
    return NextResponse.json({ data: rows, total: rows.length, error: null });
  } catch (e) {
    return NextResponse.json({
      data: [],
      error: e instanceof Error ? e.message : "โหลดรายการแจ้งลาออกไม่สำเร็จ",
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    const row = await createResignation(body);
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : "สร้างคำขอแจ้งลาออกไม่สำเร็จ",
    }, { status: 500 });
  }
}
