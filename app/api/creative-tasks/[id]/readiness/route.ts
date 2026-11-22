/**
 * บันทึกผลเช็กความพร้อมสินค้าของงาน (ค่าที่คำนวณได้ — ไม่ใช่ข้อมูลกรอกเอง)
 *
 * POST /api/creative-tasks/[id]/readiness  body { done, total }
 *   ลิ้นชักงานเรียกหลังคำนวณแถบความพร้อม (นับข้อลงร้านด้วย) → แถบบนการ์ดบอร์ดงานใช้ค่านี้ (เจ้าของเลือก 2026-11-22)
 *   ค่าเดิมเท่ากัน = ไม่เขียนซ้ำ · สิทธิ์ tasks.view (ใครเห็นงานก็อัปเดตผลเช็กได้ — ผลคิดจากข้อมูลจริง ไม่มีใครกำหนดเอง)
 *   ไม่ลงประวัติ (audit) เพราะเป็นค่าคำนวณ ไม่ใช่การแก้ข้อมูล
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
  let body: { done?: unknown; total?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const done = Number(body.done), total = Number(body.total);
  if (!Number.isInteger(done) || !Number.isInteger(total) || total < 0 || total > 50 || done < 0 || done > total) return NextResponse.json({ error: "ค่าไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("erp_creative_tasks").select("readiness_done, readiness_total").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
  const c = cur as { readiness_done: number | null; readiness_total: number | null };
  if (c.readiness_done === done && c.readiness_total === total) return NextResponse.json({ ok: true, changed: false });
  const { error } = await admin.from("erp_creative_tasks").update({ readiness_done: done, readiness_total: total, readiness_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ ok: true, changed: true });
}
