/**
 * /api/goals/[id]/exercise — บันทึกออกกำลังกาย (POST)
 * บันทึกลง erp_exercise_logs + บวกเข้าค่าเป้า + ลง check-in ไทม์ไลน์
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { addExerciseLog } from "@/lib/goals-db";
import { getRequestOwner, GOALS_EDIT } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const msg = (e: unknown) => (e instanceof Error ? e.message : "เกิดข้อผิดพลาด");

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  const owner = await getRequestOwner(request);
  try {
    const body = await request.json();
    if (!String(body?.title ?? "").trim()) return NextResponse.json({ error: "ต้องระบุประเภทกิจกรรม" }, { status: 400 });
    return NextResponse.json({ data: await addExerciseLog(id, body, owner) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}
