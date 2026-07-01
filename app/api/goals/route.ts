/**
 * /api/goals — รายการเป้าหมาย (GET) + สร้างใหม่ (POST)
 * ทุก handler: guardApi (ล็อกอิน) → goals-db (service role) — ไม่ query ตรงในหน้า UI
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { listGoals, createGoal } from "@/lib/goals-db";
import { getRequestOwner, GOALS_VIEW, GOALS_EDIT } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const msg = (e: unknown) => (e instanceof Error ? e.message : "เกิดข้อผิดพลาด");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_VIEW); if (denied) return denied;
  try {
    return NextResponse.json({ data: await listGoals() });
  } catch (e) {
    return NextResponse.json({ data: [], error: msg(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const owner = await getRequestOwner(request);
  if (!owner.id) return NextResponse.json({ error: "ไม่พบผู้ใช้ที่ล็อกอิน" }, { status: 401 });
  try {
    const body = await request.json();
    if (!String(body?.title ?? "").trim()) return NextResponse.json({ error: "ต้องระบุชื่อเป้าหมาย" }, { status: 400 });
    const goal = await createGoal(body, owner);
    return NextResponse.json({ data: goal });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}
