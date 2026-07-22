/**
 * /api/calendar/events — ปฏิทินรวม (โหมดปฏิทิน): เดดไลน์จริงจากทุกแผนกในช่วงวันที่
 *
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → RPC erp_calendar_events (SECURITY DEFINER)
 *   คืน [{ id, module, date, title, link }] · module = production/purchasing/design/billing/tasks/sales
 * ต้อง login (ข้อมูลปฏิบัติการรวม) — RPC อ่านข้ามตารางให้เอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CalendarEvent = { id: string; module: string; date: string; title: string; link: string };
export type CalendarEventsResponse = { data: CalendarEvent[]; error: string | null };

export async function GET(request: NextRequest) {
  const supabase = supabaseFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: [], error: "ต้อง login" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ data: [], error: "ต้องระบุ from/to" }, { status: 400 });

  const { data, error } = await supabase.rpc("erp_calendar_events", { p_from: from, p_to: to });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json(
    { data: (data ?? []) as CalendarEvent[], error: null },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
