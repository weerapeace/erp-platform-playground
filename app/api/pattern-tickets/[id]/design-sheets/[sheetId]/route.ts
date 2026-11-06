/**
 * /api/pattern-tickets/[id]/design-sheets/[sheetId] — ดู Design sheet ที่แนบกับตั๋ว (ดูอย่างเดียว)
 *
 * GET → { data: DesignSheetView, error }   (pattern.view)
 *   ด่าน: ใบนี้ต้องแนบอยู่ในตั๋วนี้จริง · คนดูต้องเปิดได้ (canOpenTicketSheet — พนักงานเห็นแค่การ์ด กดเปิดไม่ได้)
 *   ข้อมูล = รูป · ชื่อ · รายละเอียด · comment ลูกค้า (ไม่มีราคา/ตีราคา/เสนอราคา โดยตั้งใจ — lib/design-sheet-view-server)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { canOpenTicketSheet, cleanSheetIds } from "@/lib/pattern-tickets";
import { loadActor, PATTERN_TABLE } from "@/lib/pattern-tickets-server";
import { loadSheetView } from "@/lib/design-sheet-view-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string; sheetId: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const { id, sheetId } = await params;
  const admin = supabaseAdmin();
  const [{ data: t }, actor] = await Promise.all([
    admin.from(PATTERN_TABLE).select("id, design_sheet_ids").eq("id", id).maybeSingle(),
    loadActor(request, admin),
  ]);
  if (!t) return NextResponse.json({ error: "ไม่พบตั๋วนี้" }, { status: 404 });
  if (!canOpenTicketSheet(actor)) return NextResponse.json({ error: "คุณไม่มีสิทธิ์เปิดดู Design sheet" }, { status: 403 });
  if (!cleanSheetIds(t.design_sheet_ids).includes(sheetId.toLowerCase())) return NextResponse.json({ error: "Design sheet นี้ไม่ได้แนบกับตั๋วนี้" }, { status: 404 });
  const view = await loadSheetView(admin, sheetId);
  if (!view) return NextResponse.json({ error: "ไม่พบ Design sheet นี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  return NextResponse.json({ data: view, error: null });
}
