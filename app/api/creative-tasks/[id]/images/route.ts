/**
 * รูปทั้งหมดของงาน (ดูอย่างเดียว) — ปุ่ม "ดูรูป" ในลิ้นชักงาน Task Manager
 *
 * GET /api/creative-tasks/[id]/images
 *   → { data: { parents: [{ id, code, name, images, description, skus: [{ id, code, color, images }] }], contents: [{ id, title, status, images }] } }
 *   รูป = { key: r2 key, cover?: true } — หน้าเว็บทำ URL เอง (r2ImageUrl)
 *
 * Parent ของงาน = Parent หลักของงาน + Parent ที่ผูกเพิ่ม + Parent ของ SKU ที่ผูกงาน (สูงสุด 10)
 * SKU ลูกที่ปิดใช้แล้วไม่แสดง · คอนเทนต์ที่ลบ/ยกเลิกแล้วไม่แสดง · แสดงเฉพาะรูป (ไม่รวมวิดีโอ)
 * โหลดด้วย lib/task-images-server (ใช้ร่วมกับแผงตรวจสินค้าเร็ว) → ประกอบด้วย lib/task-images
 *
 * สิทธิ์: tasks.view · อ่านอย่างเดียว ไม่แก้ข้อมูล → ไม่มีประวัติ (audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { loadTaskImages } from "@/lib/task-images-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ data: null, error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
  const r = await loadTaskImages(supabaseAdmin(), id);
  if (!r.ok) return NextResponse.json({ data: null, error: r.status === 404 ? r.error : friendlyDbError(r.error) }, { status: r.status });
  return NextResponse.json({ data: r.data, error: null }, { headers: { "Cache-Control": "no-store" } });
}
