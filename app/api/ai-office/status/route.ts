/**
 * GET /api/ai-office/status — สถานะสดของ "ออฟฟิศทีม AI" (/master/ai-office)
 * ตัวอ่านข้อมูลอยู่ที่ ../live.ts · ทะเบียนผู้ช่วยอยู่ที่ lib/ai-office.ts · อ่านอย่างเดียว
 * สิทธิ์ ai_office.view (ตอนนี้ = แอดมิน) — มีชื่อคนที่กดใช้ AI อยู่ในความเคลื่อนไหว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { AI_OFFICE_PERM } from "@/lib/ai-office";
import { buildOfficeLive } from "../live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, AI_OFFICE_PERM); if (denied) return denied;
  const data = await buildOfficeLive(supabaseAdmin());
  return NextResponse.json({ data, error: null });
}
