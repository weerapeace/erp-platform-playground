/**
 * 👁️ เติมลายนิ้วมือหน้าตารูปให้รูปใหม่ในคลังที่ยังไม่มี — /api/cron/asset-look-hash
 *
 * ทุกวัน (vercel.json) · รูปที่อัปผ่าน /api/admin/upload ได้ลายนิ้วมือทันทีอยู่แล้ว
 * ตัวนี้ตามเก็บรูปที่เข้าคลังทางอื่น (คลังกลาง / Google Drive / รูปแม่ / งานพิมพ์ ฯลฯ) ภายใน 7 วันล่าสุด
 * ใช้กับของกลาง components/duplicate-upload (ป๊อปถามรูปซ้ำ) · วิธีคิด lib/image-hash.ts
 * เรียกได้ 2 ทาง: Vercel Cron (lib/cron-auth) หรือคนที่มีสิทธิ์ files.upload (กดเอง/ทดสอบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { r2GetObject } from "@/lib/r2";
import { analyzeImageBuffer } from "@/lib/image-hash-server";
import { recordWorkerRun } from "@/lib/ai-office-runs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const BATCH = 150;
const DAYS = 7;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) {
    const denied = await guardApi(request, "files.upload");
    if (denied) return denied;
  }
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const { data, error } = await admin.from("assets").select("id, r2_key, width, height")
    .eq("status", "active").eq("asset_type", "image").is("phash", null).not("r2_key", "is", null)
    .gte("created_at", since).order("created_at", { ascending: false }).limit(BATCH);
  if (error) {
    await recordWorkerRun(admin, "look-hash", { ok: false, error: `อ่านคลังไม่สำเร็จ: ${error.message}` });
    return NextResponse.json({ error: "อ่านคลังไม่สำเร็จ" }, { status: 500 });
  }

  const rows = (data ?? []) as { id: string; r2_key: string; width: number | null; height: number | null }[];
  let filled = 0, skipped = 0;
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < rows.length) {
      const r = rows[i++];
      try {
        const obj = await r2GetObject(r.r2_key);
        // อ่านจนจบเสมอ — ห้ามยกเลิกกลางทาง (บน Vercel ค้างได้)
        const buf = obj?.body ? await new Response(obj.body).arrayBuffer() : null;
        const img = buf ? await analyzeImageBuffer(buf) : null;
        if (!img?.look) { skipped++; continue; }
        await admin.from("assets").update({
          phash: img.look.phash, phash_color: img.look.color,
          width: r.width ?? img.width, height: r.height ?? img.height,
        }).eq("id", r.id);
        filled++;
      } catch { skipped++; }
    }
  }));
  await recordWorkerRun(admin, "look-hash", { ok: true, summary: `ทำลายนิ้วมือรูป ${filled} รูป · ข้าม ${skipped}` });
  return NextResponse.json({ ok: true, checked: rows.length, filled, skipped });
}
