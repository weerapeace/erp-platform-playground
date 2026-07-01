/**
 * /api/goals/[id] — ดูรายละเอียด (GET) · แก้ไข/เปลี่ยนสถานะ (PATCH) · ลบ (DELETE)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { getGoal, updateGoal, deleteGoal } from "@/lib/goals-db";
import { GOALS_VIEW, GOALS_EDIT } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const msg = (e: unknown) => (e instanceof Error ? e.message : "เกิดข้อผิดพลาด");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_VIEW); if (denied) return denied;
  const { id } = await params;
  try {
    const goal = await getGoal(id);
    if (!goal) return NextResponse.json({ error: "ไม่พบเป้าหมาย" }, { status: 404 });
    return NextResponse.json({ data: goal });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  try {
    const patch = await request.json();
    return NextResponse.json({ data: await updateGoal(id, patch) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  try {
    await deleteGoal(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}
