/**
 * Design Sheets — ตัวเช็ครหัส Parent SKU (เฟส 5)
 *
 * GET /api/design-sheets/parent-sku-check?code=CTL085
 * → { exists, latest, suggested, skipped, max_code }
 *   exists    = รหัสนี้มีใน parent_skus_v2 แล้ว (ห้ามบันทึก — กรอบแดง)
 *   latest    = รหัสที่ "ตั้งล่าสุด" (ตามวันที่สร้าง เฉพาะรูปแบบ prefix+เลข) — ฐานคิดเลขถัดไป
 *               (ไม่ใช้เลขสูงสุด เพราะมีรหัสโดดเช่น CTL999 ที่เป็นรหัสพิเศษ/ทดสอบ)
 *   suggested = รหัสถัดไป (เลขของ latest + 1 คงจำนวนหลัก)
 *   skipped   = ตั้งข้ามเลข (เกิน latest+1) → เตือนแต่ตั้งได้
 *   max_code  = เลขสูงสุดของ prefix (ข้อมูลเสริม โชว์เมื่อต่างจาก latest)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ParentSkuCheck = {
  exists: boolean; latest: string | null; suggested: string | null; skipped: boolean; max_code: string | null;
  matches: string[];   // รหัสที่มีอยู่แล้วในกลุ่ม prefix เดียวกัน (เรียงเลขมาก→น้อย ≤20) — โชว์เป็นลิสต์แนะนำ
};

/** แยกรหัสเป็น prefix + เลขท้าย เช่น CTL084 → { prefix: "CTL", num: 84, digits: 3 } */
function splitCode(code: string): { prefix: string; num: number | null; digits: number } {
  const m = code.match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: code, num: null, digits: 0 };
  return { prefix: m[1], num: parseInt(m[2], 10), digits: m[2].length };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ data: null, error: "ต้องส่ง code" }, { status: 400 });

  const admin = supabaseAdmin();
  const { prefix, num } = splitCode(code);

  const { data, error } = await admin.from("parent_skus_v2").select("code, created_at")
    .ilike("code", `${prefix.replace(/[%_]/g, "")}%`)
    .order("created_at", { ascending: false }).limit(5000);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  let exists = false;
  let latestCode: string | null = null;   // ตัวแรกที่เจอ (เรียงตามวันที่สร้างใหม่→เก่า) ในรูปแบบ prefix+เลขล้วน
  let maxNum = -1; let maxCode: string | null = null;
  const matchList: { code: string; num: number }[] = [];
  for (const r of (data ?? []) as Array<{ code: string }>) {
    const c = (r.code ?? "").toUpperCase();
    if (c === code) exists = true;
    const s = splitCode(c);
    if (s.prefix !== prefix || s.num == null) continue;   // ตัดรหัสพิเศษ เช่น CTL095_DUP_x / CTL098-01S
    if (latestCode == null) latestCode = r.code;
    if (s.num > maxNum) { maxNum = s.num; maxCode = r.code; }
    matchList.push({ code: r.code, num: s.num });
  }
  const matches = matchList.sort((a, b) => b.num - a.num).map((m) => m.code)
    .filter((c, i, arr) => arr.indexOf(c) === i).slice(0, 20);

  const base = latestCode ? splitCode(latestCode.toUpperCase()) : null;
  const suggested = base && base.num != null ? `${prefix}${String(base.num + 1).padStart(base.digits, "0")}` : null;
  const skipped = num != null && base?.num != null && num > base.num + 1;

  return NextResponse.json({
    data: {
      exists, latest: latestCode, suggested, skipped,
      max_code: maxCode && maxCode !== latestCode ? maxCode : null,
      matches,
    } satisfies ParentSkuCheck,
    error: null,
  });
}
