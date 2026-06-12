import { NextRequest, NextResponse } from "next/server";
import { employeeLineMe } from "@/lib/line-employee-portal-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({ data: await employeeLineMe(body), error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "Employee LINE profile failed" }, { status: 400 });
  }
}

