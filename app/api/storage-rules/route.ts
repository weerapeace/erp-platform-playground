/**
 * /api/storage-rules — กฎที่เก็บไฟล์กลาง (หมวดไฟล์ → R2 / Supabase / Google Drive)
 *   GET → ทุกหมวดที่เปิดใช้ (เรียงตาม sort_order) · แก้ทีละหมวดที่ /api/storage-rules/[id]
 * กฎตรวจ/ชนิดข้อมูล: lib/storage-policy.ts · คู่มือ docs/storage-policy.md
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STORAGE_RULE_SELECT, type StorageRule } from "@/lib/storage-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_storage_rules")
    .select(STORAGE_RULE_SELECT)
    .eq("is_active", true).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: "โหลดกฎที่เก็บไฟล์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as StorageRule[], error: null });
}
