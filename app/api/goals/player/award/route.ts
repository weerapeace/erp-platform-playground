/** /api/goals/player/award — ให้เหรียญผู้ใช้ปัจจุบัน (POST { coins, reason }) */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { awardCoins } from "@/lib/goals-game-db";
import { getRequestOwner, GOALS_EDIT } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const me = await getRequestOwner(request);
  if (!me.id) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  try {
    const body = await request.json();
    const coins = Number(body?.coins) || 0;
    const reason = String(body?.reason ?? "");
    return NextResponse.json({ data: await awardCoins(me.id, me.name, coins, reason) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
