/**
 * POST /api/plan/close-day — ปิดวัน (แผนงานส่วนตัว)
 *
 * body { carry?: boolean }  (ค่าเริ่มต้น true)
 *  1. งานที่ทำเสร็จแล้ว → เก็บออกจากบอร์ด (archived_at) แต่ยังอยู่ในฐานข้อมูลให้ย้อนดูได้
 *  2. carry=true → งานค้างของวันนี้ (และที่ค้างมาจากวันก่อน) ยกไปเป็นแผนพรุ่งนี้ทั้งหมด
 *
 * ส่วนตัวล้วน — ใช้ token ผู้ใช้ ให้ RLS กรองเอง (ดู /api/plan)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { bangkokDate, type PlanItem } from "@/lib/planner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, user_id, bucket, plan_date, sort_order, title, note, source_type, source_id, link, module, due_at, done_at, archived_at, created_at, updated_at";

export async function POST(request: NextRequest) {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  const uid = user?.id ?? null;
  if (!uid) return NextResponse.json({ data: [], error: "ต้องเข้าสู่ระบบก่อนใช้แผนงาน" }, { status: 401 });

  let carry = true;
  try { const b = await request.json() as { carry?: boolean }; if (typeof b?.carry === "boolean") carry = b.carry; } catch { /* ไม่ส่ง body = ยกงานค้างไปพรุ่งนี้ */ }

  const now      = new Date().toISOString();
  const today    = bangkokDate(0);
  const tomorrow = bangkokDate(1);

  // 1) งานที่เสร็จแล้ว (ทุกช่อง) → เก็บออกจากบอร์ด
  const { data: archived, error: aErr } = await client.from("erp_plan_items")
    .update({ archived_at: now, updated_at: now })
    .eq("user_id", uid).is("archived_at", null).not("done_at", "is", null)
    .select("id");
  if (aErr) return NextResponse.json({ data: [], error: aErr.message }, { status: 500 });

  // 2) งานค้างที่ถึงกำหนดวันนี้หรือก่อนหน้า → ยกไปพรุ่งนี้
  let carried = 0;
  if (carry) {
    const { data: moved, error: cErr } = await client.from("erp_plan_items")
      .update({ plan_date: tomorrow, bucket: "tomorrow", updated_at: now })
      .eq("user_id", uid).is("archived_at", null).is("done_at", null).lte("plan_date", today)
      .select("id");
    if (cErr) return NextResponse.json({ data: [], error: cErr.message }, { status: 500 });
    carried = (moved ?? []).length;
  }

  const { data, error } = await client.from("erp_plan_items").select(COLS)
    .eq("user_id", uid).is("archived_at", null)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  return NextResponse.json({
    data: (data ?? []) as unknown as PlanItem[],
    archived: (archived ?? []).length,
    carried,
    error: null,
  });
}
