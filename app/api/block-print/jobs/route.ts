/**
 * 🧱 บล็อกพิมพ์ — รายการงาน / สร้างงานใหม่
 * GET  /api/block-print/jobs?trash=1   → { data: rows[] } (ไม่มีเส้นของชิ้น · trash=1 = งานที่ลบไว้)
 * POST /api/block-print/jobs           → { data: row }   body {name, source_file_name?, unit?, paper?, pieces}
 * สิทธิ์ block_print.view / block_print.edit · audit create
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { bad, cleanJobBody, EDIT_PERM, ENTITY, LIST_COLS, TABLE, VIEW_PERM } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const { data, error } = await supabaseAdmin().from(TABLE).select(LIST_COLS)
    .eq("is_active", !trash).order("updated_at", { ascending: false }).limit(2000);
  if (error) return bad(friendlyDbError(error.message), 500);
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = cleanJobBody(body, false);
  if (!v.ok) return bad(v.error);
  if (!v.patch.pieces?.length) return bad("ไฟล์นี้ไม่มีชิ้นเวกเตอร์ให้ใช้");
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(TABLE).insert({ ...v.patch, is_active: true }).select("*").single();
  if (error) return bad(friendlyDbError(error.message));
  await writeAuditFor(request, admin, {
    action: "create", entityType: ENTITY, entityId: data.id,
    metadata: { code: data.code, name: data.name, file: data.source_file_name, pieces: data.piece_count },
  });
  return NextResponse.json({ data, error: null });
}
