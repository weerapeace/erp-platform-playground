/**
 * /api/goals/[id]/progress — บันทึกความคืบหน้าเป็นจำนวน (เช่น ฝากเงินเก็บ) (POST)
 * บวกเข้าค่าเป้า + ลง check-in ไทม์ไลน์
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { addProgress } from "@/lib/goals-db";
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
    const amount = Number(body?.amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
    return NextResponse.json({ data: await addProgress(id, amount, String(body?.note ?? ""), owner) });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}
