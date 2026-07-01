/** /api/goals/leaderboard — กระดานทีม (GET) เรียงตามเหรียญ */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { leaderboard } from "@/lib/goals-game-db";
import { getRequestOwner, GOALS_VIEW } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_VIEW); if (denied) return denied;
  const me = await getRequestOwner(request);
  try {
    return NextResponse.json({ data: await leaderboard(me.id) });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
