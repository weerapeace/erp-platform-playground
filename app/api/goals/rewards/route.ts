/** /api/goals/rewards — รายการรางวัลที่แลกได้ (GET) */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { listRewards } from "@/lib/goals-game-db";
import { GOALS_VIEW } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_VIEW); if (denied) return denied;
  try {
    return NextResponse.json({ data: await listRewards() });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
