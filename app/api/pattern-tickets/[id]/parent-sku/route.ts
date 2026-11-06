/**
 * /api/pattern-tickets/[id]/parent-sku — ดูรุ่นสินค้า (Parent SKU) ของตั๋ว แบบดูอย่างเดียว
 *
 * GET → { data: ParentSkuView, error }   (pattern.view)
 *   ด่าน: คนดูต้องเปิดได้ (canOpenTicketSheet — พนักงานเห็นแค่การ์ด กดเปิดไม่ได้ · กติกาเดียวกับ Design sheet)
 *   ข้อมูล = รูป · สเปค · BOM ต่อ SKU ลูก (ไม่มีราคา/ต้นทุน โดยตั้งใจ — lib/parent-sku-view-server)
 *   ไม่มีลิงก์ไปหน้า SKU / BOM — เจ้าของขอปิดทางออกไปหน้าอื่นจากแอปตั๋วงาน (2026-11-06)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { canOpenTicketSheet } from "@/lib/pattern-tickets";
import { loadActor, PATTERN_TABLE } from "@/lib/pattern-tickets-server";
import { loadParentView } from "@/lib/parent-sku-view-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: t }, actor] = await Promise.all([
    admin.from(PATTERN_TABLE).select("id, parent_sku_id").eq("id", id).maybeSingle(),
    loadActor(request, admin),
  ]);
  if (!t) return NextResponse.json({ error: "ไม่พบตั๋วนี้" }, { status: 404 });
  if (!canOpenTicketSheet(actor)) return NextResponse.json({ error: "คุณไม่มีสิทธิ์เปิดดูรุ่นสินค้า" }, { status: 403 });
  if (!t.parent_sku_id) return NextResponse.json({ error: "ตั๋วนี้ไม่ได้ระบุรุ่นสินค้า" }, { status: 404 });
  const view = await loadParentView(admin, String(t.parent_sku_id));
  if (!view) return NextResponse.json({ error: "ไม่พบรุ่นสินค้านี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  return NextResponse.json({ data: view, error: null });
}
