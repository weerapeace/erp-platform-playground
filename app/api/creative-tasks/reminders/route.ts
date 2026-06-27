/**
 * Creative Tasks — sweep แจ้งเตือนกำหนดส่ง (lazy, เรียกตอนเปิดหน้า /tasks)
 * GET /api/creative-tasks/reminders → สร้างแจ้งเตือน "ใกล้/เกินกำหนด" ให้ผู้รับผิดชอบ (กันซ้ำวันละครั้ง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { runDueReminders } from "@/lib/creative-reminders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  try { const r = await runDueReminders(supabaseAdmin()); return NextResponse.json({ created: r.created, error: null }); }
  catch { return NextResponse.json({ created: 0, error: null }); }
}
