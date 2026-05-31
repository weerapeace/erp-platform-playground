/**
 * Image upload — Sprint 6
 *
 * POST /api/admin/upload
 *   FormData: file (image), folder (e.g., "parent-skus")
 *   → upload to R2 + return { r2_key, content_type, size }
 *
 * ใช้กับ ImageInput component ใน MasterCRUDPage form
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { r2PutObject } from "@/lib/r2";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE = 5 * 1024 * 1024;  // 5 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  // auth check
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "ต้องแนบไฟล์" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `ประเภทไฟล์ไม่รองรับ: ${file.type}` }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน 5MB (${(file.size / 1024 / 1024).toFixed(1)}MB)` }, { status: 400 });
  }

  const folder = (formData.get("folder") as string ?? "uploads").replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  // unique key — folder/user_id/timestamp.ext (no random — deterministic OK for now)
  const key = `${folder}/${user.id}/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await r2PutObject(key, buf, file.type);
    return NextResponse.json({
      r2_key:       key,
      content_type: file.type,
      size:         file.size,
      error:        null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `upload failed: ${(e as Error).message ?? e}` },
      { status: 500 }
    );
  }
}
