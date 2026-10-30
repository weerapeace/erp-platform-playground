/**
 * 🧹 ลบรูปลูกค้าของลายรีดที่ครบวันเก็บ (PDPA) — /api/cron/print-uploads-purge
 *
 * ทุกวัน (vercel.json) · ออเดอร์ส่งแล้ว/สำเร็จ/ยกเลิก เกิน 90 วัน · แบบที่ไม่ได้สั่งเกิน 14 วัน (lib/website-print-design-server)
 * ข้อมูลแบบ (ลาย/ตำแหน่ง ซม.) ยังอยู่ — ลบเฉพาะไฟล์รูป
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) หรือคนที่มีสิทธิ์ products.edit (กดเองจากหลังบ้าน/ทดสอบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { purgePrintUploads } from "@/lib/website-print-design-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) {
    const denied = await guardApi(request, "products.edit");
    if (denied) return denied;
  }
  const r = await purgePrintUploads(supabaseAdmin());
  return NextResponse.json({ ok: true, ...r });
}
