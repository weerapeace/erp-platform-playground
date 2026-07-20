/**
 * POST /api/record-files/sign-upload — ขอ URL อัปไฟล์ตรงเข้า Supabase Storage
 *   body { entity_type, entity_id, file_name }
 *   เบราว์เซอร์เอา { path, token } ไปอัปตรง (supabaseBrowser.uploadToSignedUrl) → ข้ามลิมิต body ~4.5MB ของ Vercel
 *   → { path, token }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RECORD_FILES_BUCKET } from "@/lib/record-files";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { entity_type?: string; entity_id?: string; file_name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const entityType = String(body.entity_type ?? "").trim();
  const entityId = String(body.entity_id ?? "").trim();
  const fileName = String(body.file_name ?? "").trim();
  if (!entityType || !UUID_RE.test(entityId)) return NextResponse.json({ error: "ระบุ record ไม่ถูกต้อง" }, { status: 400 });

  const ext = (fileName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${entityType}/${entityId}/${Date.now()}-${rand}${ext}`;

  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from(RECORD_FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: `ขอสิทธิ์อัปโหลดไม่สำเร็จ: ${error?.message ?? ""}` }, { status: 500 });

  return NextResponse.json({ path: data.path ?? path, token: data.token, error: null });
}
