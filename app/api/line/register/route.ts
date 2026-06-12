import { NextRequest, NextResponse } from "next/server";
import { registerLineMember } from "@/lib/line-employee-portal-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({ data: await registerLineMember(body), error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "LINE register failed" }, { status: 400 });
  }
}

