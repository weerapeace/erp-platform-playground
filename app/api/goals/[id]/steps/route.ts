/**
 * /api/goals/[id]/steps — ขั้นบันได: เพิ่ม (POST) · แก้/สลับเสร็จ (PATCH {stepId,...}) · ลบ (DELETE ?stepId=)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { addStep, updateStep, deleteStep } from "@/lib/goals-db";
import { GOALS_EDIT } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const msg = (e: unknown) => (e instanceof Error ? e.message : "เกิดข้อผิดพลาด");

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  try {
    const body = await request.json();
    if (!String(body?.title ?? "").trim()) return NextResponse.json({ error: "ต้องระบุชื่อขั้นบันได" }, { status: 400 });
    return NextResponse.json({ data: await addStep(id, body) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  try {
    const body = await request.json();
    const stepId = String(body?.stepId ?? "");
    if (!stepId) return NextResponse.json({ error: "ต้องระบุ stepId" }, { status: 400 });
    const { stepId: _omit, ...patch } = body;
    return NextResponse.json({ data: await updateStep(id, stepId, patch) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  const stepId = new URL(request.url).searchParams.get("stepId") ?? "";
  if (!stepId) return NextResponse.json({ error: "ต้องระบุ stepId" }, { status: 400 });
  try {
    return NextResponse.json({ data: await deleteStep(id, stepId) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}
