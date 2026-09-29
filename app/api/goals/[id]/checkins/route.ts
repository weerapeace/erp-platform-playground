/**
 * /api/goals/[id]/checkins — บันทึกอัปเดตความคืบหน้า (POST) + อัปเดตสุขภาพ/ค่าปัจจุบันของเป้า
 *   PATCH  { checkin_id, note?, health? }  → แก้ข้อความ (ทุกรายการ) / สถานะ (เฉพาะรายการล่าสุด)
 *   DELETE ?checkin_id=                     → ยกเลิกรายการล่าสุด (คืนยอดสะสม + หักเหรียญที่ได้คืน) — ใช้กับ ฝากเงิน/ออกกำลังกาย ด้วย
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { addCheckin, updateCheckin, undoLatestCheckin } from "@/lib/goals-db";
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
    return NextResponse.json({ data: await addCheckin(id, body, owner) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  const owner = await getRequestOwner(request);
  try {
    const body = await request.json();
    const checkinId = String(body?.checkin_id ?? "").trim();
    if (!checkinId) return NextResponse.json({ error: "ต้องระบุรายการ" }, { status: 400 });
    return NextResponse.json({ data: await updateCheckin(id, checkinId, { note: body?.note, health: body?.health }, owner) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, GOALS_EDIT); if (denied) return denied;
  const { id } = await params;
  const owner = await getRequestOwner(request);
  const checkinId = (new URL(request.url).searchParams.get("checkin_id") ?? "").trim();
  if (!checkinId) return NextResponse.json({ error: "ต้องระบุรายการ" }, { status: 400 });
  try {
    const out = await undoLatestCheckin(id, checkinId, owner);
    return NextResponse.json({ data: out.goal, coins_back: out.coins_back });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 400 });
  }
}
