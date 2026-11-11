/**
 * งาน Task Manager ที่รอฉัน — แท็บ "Task" ในศูนย์แจ้งเตือน (ตัว Pet)
 *
 * GET /api/creative-tasks/inbox
 *   → { data: { review: InboxItem[], revision: InboxItem[], assigned: InboxItem[] } }
 *   review = รอคุณตรวจ · revision = งานของคุณที่ถูกตีกลับ · assigned = งานของคุณที่ยังไม่จบ (รายละเอียด lib/task-inbox-server)
 *
 * สิทธิ์: tasks.view (ดูรายการ) · งานรอตรวจที่ไม่ได้ตั้งผู้ตรวจ → โชว์เฉพาะคนที่มี tasks.approve
 * อ่านอย่างเดียว · การอนุมัติ/ตีกลับจากแท็บ ไปที่ PATCH /api/creative-tasks/[id] เดิม (บันทึกประวัติที่นั่น)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { loadTaskInbox } from "@/lib/task-inbox-server";
import { emptyInbox } from "@/lib/task-inbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user?.id) return NextResponse.json({ data: emptyInbox(), error: null }, { headers: { "Cache-Control": "no-store" } });
  const r = await loadTaskInbox(supabaseAdmin(), user.id, await apiCan(request, "tasks.approve"));
  if ("error" in r) return NextResponse.json({ data: null, error: friendlyDbError(r.error) }, { status: 500 });
  return NextResponse.json({ data: r.data, error: null }, { headers: { "Cache-Control": "no-store" } });
}
