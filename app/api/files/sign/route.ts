/**
 * POST /api/files/sign — ขอลิงก์เปิดดูไฟล์จาก ref หลายตัวในครั้งเดียว · body { refs: string[] } (≤ 50)
 *   → { data: { [ref]: url | null } }
 *   R2 key   → /api/r2-image?key=… (ทางเดิม)
 *   Supabase → ลิงก์ชั่วคราว 10 นาที เฉพาะหมวดที่ผู้ใช้มีสิทธิ์ดู (STORAGE_CATEGORY_PERMISSIONS[หมวด].view) · ไม่มีสิทธิ์ = null
 * หน้าจอเรียกผ่าน components/file-ref (useFileRefUrls) — <img src> ส่ง token เองไม่ได้ จึงต้องขอลิงก์ก่อน
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseFileRef } from "@/lib/file-ref";
import { r2ViewUrl, signSupabaseRefs } from "@/lib/file-ref-server";
import { STORAGE_CATEGORY_PERMISSIONS } from "@/lib/storage-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_REFS = 50;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { refs?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }
  const refs = [...new Set((Array.isArray(body.refs) ? body.refs : []).map((r) => String(r ?? "").trim()).filter(Boolean))].slice(0, MAX_REFS);

  const out: Record<string, string | null> = {};
  const allowed: string[] = [];
  const canCache = new Map<string, boolean>();
  for (const ref of refs) {
    const p = parseFileRef(ref);
    if (!p) { out[ref] = null; continue; }
    if (p.provider === "r2") { out[ref] = r2ViewUrl(p.key); continue; }
    const perm = p.category ? STORAGE_CATEGORY_PERMISSIONS[p.category]?.view : undefined;
    if (!perm) { out[ref] = null; continue; }
    if (!canCache.has(perm)) canCache.set(perm, await apiCan(request, perm));
    if (canCache.get(perm)) allowed.push(ref); else out[ref] = null;
  }

  if (allowed.length) {
    const signed = await signSupabaseRefs(supabaseAdmin(), allowed);
    for (const ref of allowed) out[ref] = signed.get(ref) ?? null;
  }
  return NextResponse.json({ data: out, error: null });
}
