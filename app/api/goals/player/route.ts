/** /api/goals/player — สถานะผู้เล่นปัจจุบัน (เหรียญ/XP/streak/ประวัติ/รางวัลที่แลก) */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { getPlayer } from "@/lib/goals-game-db";
import { getRequestOwner, GOALS_VIEW } from "@/lib/goals-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_VIEW); if (denied) return denied;
  const me = await getRequestOwner(request);
  if (!me.id) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  try {
    return NextResponse.json({ data: await getPlayer(me.id, me.name) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
