/**
 * ข้อมูลแผงตรวจสินค้าเร็ว (ดูอย่างเดียว) — ปุ่ม "ตรวจเร็ว" + แถบความพร้อมในลิ้นชักงาน + กล่อง "เหลือทำอะไร"
 *
 * GET /api/creative-tasks/[id]/quick-check
 *   → { data: { parents: ReadinessParent[] } } — ตัวเช็ก (lib/product-listing-checks · lib/task-readiness) รันฝั่งหน้าเว็บ
 *
 * ตัวโหลด = lib/task-readiness-server (loadReadinessParents) → ตัวโหลดเดียวกับปุ่ม "ดูรูป" นับรูปตรงกันเสมอ
 * ราคา = ราคาขาย (list_price) + ราคาขีดฆ่า (fake_price) เท่านั้น — ไม่ส่งต้นทุน (standard_price)
 * สิทธิ์: tasks.view · อ่านอย่างเดียว ไม่แก้ข้อมูล → ไม่มีประวัติ (audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { loadReadinessParents } from "@/lib/task-readiness-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ data: null, error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
  const r = await loadReadinessParents(supabaseAdmin(), id);
  if (!r.ok) return NextResponse.json({ data: null, error: r.status === 404 ? r.error : friendlyDbError(r.error) }, { status: r.status });
  return NextResponse.json({ data: { parents: r.parents }, error: null }, { headers: { "Cache-Control": "no-store" } });
}
