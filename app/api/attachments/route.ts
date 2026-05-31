import { NextRequest, NextResponse } from "next/server";
import { r2PutObject, isR2Configured, R2_PUBLIC_URL } from "@/lib/r2";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type Attachment = {
  id:           string;
  entity_type:  string;
  entity_id:    string;
  file_name:    string;
  file_path:    string;
  public_url:   string;
  content_type: string | null;
  size_bytes:   number | null;
  is_primary:   boolean;
  sort_order:   number;
  uploaded_by:  string | null;
  created_at:   string;
};

export type AttachmentsResponse = { data: Attachment[]; error: string | null };

// ---- GET /api/attachments?entity_type=..&entity_id=.. ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type");
  const entityId   = searchParams.get("entity_id");
  if (!entityType || !entityId) {
    return NextResponse.json({ data: [], error: "entity_type & entity_id required" }, { status: 400 });
  }
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_attachments_list", {
    p_entity_type: entityType, p_entity_id: entityId,
  });
  if (error) {
    return NextResponse.json({ data: [], error: error.message } satisfies AttachmentsResponse, { status: 500 });
  }
  return NextResponse.json({ data: (data as Attachment[]) ?? [], error: null } satisfies AttachmentsResponse);
}

// ---- POST /api/attachments (multipart: file + entity_type + entity_id + actor) ----
// upload ไป R2 → บันทึก metadata ใน Supabase → คืน attachment row

export async function POST(request: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า Cloudflare R2 — ต้องใส่ R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_PUBLIC_URL ใน .env.local" },
      { status: 503 }
    );
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "ต้องเป็น multipart/form-data" }, { status: 400 }); }

  const file       = form.get("file") as File | null;
  const entityType = String(form.get("entity_type") ?? "");
  const entityId   = String(form.get("entity_id") ?? "");
  const actor      = form.get("actor") ? String(form.get("actor")) : null;

  if (!file || !entityType || !entityId) {
    return NextResponse.json({ error: "ต้องมี file, entity_type, entity_id" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });
  }

  // สร้าง path: entityType/entityId/timestamp-random.ext
  const ext  = (file.name.split(".").pop() || "bin").toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${entityType}/${entityId}/${Date.now()}-${rand}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await r2PutObject(path, buffer, file.type || "application/octet-stream");
  } catch (err: unknown) {
    console.error("[api/attachments] R2 upload", err);
    return NextResponse.json({ error: "อัปโหลดไป R2 ไม่สำเร็จ: " + (err instanceof Error ? err.message : "") }, { status: 500 });
  }

  const publicUrl = `${R2_PUBLIC_URL}/${path}`;

  // บันทึก metadata
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_attachments_add", {
    p_entity_type: entityType, p_entity_id: entityId,
    p_file_name: file.name, p_file_path: path, p_public_url: publicUrl,
    p_content_type: file.type || null, p_size_bytes: file.size, p_uploaded_by: actor,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}
