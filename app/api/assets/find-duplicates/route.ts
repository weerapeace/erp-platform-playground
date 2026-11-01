/**
 * 🔁 ถามคลังกลางว่า "มีรูปนี้อยู่แล้วไหม" ก่อนอัปโหลด — POST /api/assets/find-duplicates
 *
 *   { checksums: string[],                              sha256 hex ของไฟล์ที่จะอัป (คำนวณในเบราว์เซอร์ ไม่ต้องส่งไฟล์มาก่อน)
 *     looks?: ({ phash, color } | null)[] }             ลายนิ้วมือหน้าตารูป (lib/image-hash) ต่อไฟล์ · เรียงตามไฟล์
 *   → { data: { [checksum]: DuplicateAsset },           ไฟล์เดียวกันทุกจุด (เฉพาะตัวที่เจอ · active)
 *       looks: (DuplicateAsset | null)[],               รูปหน้าตาเหมือนกันแต่คนละไฟล์ (ตัวที่ใกล้สุด · เรียงตาม looks)
 *       error: null }
 *
 * ใช้คู่กับของกลาง components/duplicate-upload (ป๊อปถาม "ใช้รูปเดิม / อัปโหลดใหม่") — ใช้รูปเดิม = ไม่ส่งไฟล์ซ้ำเข้าที่เก็บไฟล์
 * อ่านอย่างเดียว (ไม่แก้ข้อมูล) · สิทธิ์เดียวกับการอัปโหลด (files.upload) · ตัวค้นอยู่ที่ lib/asset-duplicates-server
 * ค้นหน้าตารูปไม่สำเร็จ = looks ว่าง · ตรวจไฟล์เดียวกันยังทำงานตามปกติ
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findDuplicateAssets } from "@/lib/asset-duplicates-server";

export type { DuplicateAsset } from "@/lib/asset-duplicates-server";
export const dynamic = "force-dynamic";

const HEX64 = /^[a-f0-9]{64}$/;
const PHASH = /^[a-f0-9]{32}$/;
const PCOLOR = /^[a-f0-9]{1536}$/;
const MAX_CHECKSUMS = 50;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload");
  if (denied) return denied;

  let body: { checksums?: unknown; looks?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const checksums = [...new Set((Array.isArray(body.checksums) ? body.checksums : []).map((c) => String(c).toLowerCase()).filter((c) => HEX64.test(c)))].slice(0, MAX_CHECKSUMS);
  const looks = (Array.isArray(body.looks) ? body.looks : []).slice(0, MAX_CHECKSUMS).map((l) => {
    const o = l && typeof l === "object" ? (l as Record<string, unknown>) : {};
    const phash = String(o.phash ?? "").toLowerCase(), color = String(o.color ?? "").toLowerCase();
    return PHASH.test(phash) && PCOLOR.test(color) ? { phash, color } : null;
  });
  if (!checksums.length && !looks.some(Boolean)) return NextResponse.json({ data: {}, looks: [], error: null });

  try {
    return NextResponse.json({ ...(await findDuplicateAssets(supabaseAdmin(), checksums, looks)), error: null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
