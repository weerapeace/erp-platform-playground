/**
 * GET /api/jobs/{id} — ดูสถานะงานเบื้องหลัง (สำหรับ poll จากหน้าจอ)
 * คืน { status, progress_done, progress_total, result (เมื่อ done), error }
 * RLS: ผู้ล็อกอินอ่านได้ (policy erp_jobs_read)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(req)
    .from("erp_jobs")
    .select("id, type, status, progress_done, progress_total, result, error, updated_at")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ data: null, error: "ไม่พบงาน" }, { status: 404 });
  return NextResponse.json({ data, error: null });
}
