/**
 * 🔎 ตรวจไฟล์ในคลังที่ตัวจริงอยู่ Google Drive ว่ายังอยู่ไหม — /api/cron/content-drive-check
 *
 * ทุกวัน (vercel.json) · Drive ไม่แจ้งเมื่อมีคนลบไฟล์ → ตัวนี้ไล่ถาม แล้วขึ้นป้าย "หายจาก Drive" (assets.drive_missing_at)
 * ไฟล์ที่กู้คืนจากถังขยะ Drive แล้ว = ล้างป้ายให้เอง · ตอบไม่ได้ (เน็ต/สิทธิ์) = ไม่แตะ (กันขึ้นป้ายผิด)
 * ครั้งละ BATCH รายการ (ไฟล์เยอะกว่านั้น = วันละช่วง วนจนครบ)
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) หรือคนที่มีสิทธิ์ assets.manage (กดเอง/ทดสอบ)
 * กติกาตรวจ: lib/content-albums-server checkDriveFiles (ใช้ร่วมปุ่ม "ดึงไฟล์ใหม่จาก Drive" ในอัลบั้ม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { driveConfigured } from "@/lib/google-drive";
import { checkDriveFiles } from "@/lib/content-albums-server";
import { recordWorkerRun } from "@/lib/ai-office-runs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const BATCH = 800;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) {
    const denied = await guardApi(request, "assets.manage");
    if (denied) return denied;
  }
  const admin = supabaseAdmin();
  if (!driveConfigured()) {
    await recordWorkerRun(admin, "drive-check", { ok: true, summary: "ข้าม: ยังไม่ได้ตั้งค่า Google Drive" });
    return NextResponse.json({ data: { checked: 0 }, error: null });
  }
  const base = () => admin.from("assets").select("id, drive_file_id, drive_missing_at", { count: "exact" }).eq("status", "active").not("drive_file_id", "is", null);
  // ไฟล์เยอะเกิน BATCH → แต่ละวันตรวจคนละช่วง (วนครบเองทุก ⌈ทั้งหมด/BATCH⌉ วัน)
  const { count } = await base().limit(1);
  const total = count ?? 0;
  const day = Math.floor(Date.now() / 86400000);
  const offset = total > BATCH ? (day * BATCH) % total : 0;
  const { data, error } = await base().order("id").range(offset, offset + BATCH - 1);
  if (error) {
    await recordWorkerRun(admin, "drive-check", { ok: false, error: `อ่านคลังไม่สำเร็จ: ${error.message}` });
    return NextResponse.json({ error: "อ่านคลังไม่สำเร็จ" }, { status: 500 });
  }
  const rows = (data ?? []) as { id: string; drive_file_id: string; drive_missing_at: string | null }[];
  const r = await checkDriveFiles(admin, rows, 8);
  await recordWorkerRun(admin, "drive-check", { ok: true, summary: `ตรวจ ${r.checked} ไฟล์ · หาย ${r.missing} · กลับมา ${r.restored}` });
  return NextResponse.json({ data: { ...r, total, offset }, error: null });
}
