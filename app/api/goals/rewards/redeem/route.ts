/** /api/goals/rewards/redeem — แลกรางวัล (POST { rewardId }) */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { redeem } from "@/lib/goals-game-db";
import { getRequestOwner, GOALS_EDIT } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const me = await getRequestOwner(request);
  if (!me.id) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  try {
    const body = await request.json();
    const rewardId = String(body?.rewardId ?? "");
    if (!rewardId) return NextResponse.json({ error: "ต้องระบุรางวัล" }, { status: 400 });
    const result = await redeem(me.id, me.name, rewardId);
    if (!result.ok) return NextResponse.json({ error: "เหรียญไม่พอ", data: result.player }, { status: 400 });
    return NextResponse.json({ data: result.player });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
