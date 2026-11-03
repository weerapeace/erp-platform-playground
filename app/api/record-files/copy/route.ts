/**
 * POST /api/record-files/copy — แนบไฟล์ที่อัปแล้ว 1 ไฟล์ ให้ record อื่นอีกหลายตัว (ไม่ต้องอัปซ้ำจากเบราว์เซอร์)
 *   body { from_id, targets: [{ entity_type, entity_id }], actor? }   (สูงสุด 300 ตัว)
 *   → { data: { copied, failed } }
 * ก๊อปตัวไฟล์ใน Storage ฝั่งเซิร์ฟเวอร์ (storage.copy) — แต่ละ record ได้ไฟล์ของตัวเอง ลบที่หนึ่งไม่กระทบที่อื่น
 * ใช้ตอน: สลิปโอนเงิน 1 ใบจ่ายหลาย PO (หน้ากระแสเงินสด) · สิทธิ์เดียวกับแนบไฟล์ (products.edit) · audit ต่อ record
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAuditMany } from "@/lib/audit";
import { RECORD_FILES_BUCKET } from "@/lib/record-files";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_RE = /^[a-z0-9_-]{1,60}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { from_id?: string; targets?: { entity_type?: string; entity_id?: string }[]; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const fromId = String(body.from_id ?? "");
  if (!UUID_RE.test(fromId)) return NextResponse.json({ error: "ไม่ระบุไฟล์ต้นทาง" }, { status: 400 });
  const targets = (Array.isArray(body.targets) ? body.targets : []).slice(0, 300)
    .map((t) => ({ type: String(t?.entity_type ?? "").trim(), id: String(t?.entity_id ?? "").trim() }))
    .filter((t) => TYPE_RE.test(t.type) && UUID_RE.test(t.id));
  if (!targets.length) return NextResponse.json({ error: "ไม่มี record ปลายทาง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: src } = await admin.from("erp_record_files").select("*").eq("id", fromId).maybeSingle();
  if (!src) return NextResponse.json({ error: "ไม่พบไฟล์ต้นทาง" }, { status: 404 });

  const ext = (String(src.storage_path).match(/\.[^./]+$/)?.[0] ?? "").toLowerCase();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = String(body.actor ?? "").slice(0, 120) || user?.email || null;
  let copied = 0;
  const failed: string[] = [];
  const audits: Parameters<typeof writeAuditMany>[1] = [];
  for (const t of targets) {
    const path = `${t.type}/${t.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const { error: cpErr } = await admin.storage.from(RECORD_FILES_BUCKET).copy(String(src.storage_path), path);
    if (cpErr) { failed.push(t.id); continue; }
    const { data: ins, error } = await admin.from("erp_record_files").insert({
      entity_type: t.type, entity_id: t.id, bucket: RECORD_FILES_BUCKET, storage_path: path,
      file_name: src.file_name, content_type: src.content_type, size_bytes: src.size_bytes, sort_order: 0, uploaded_by: actor,
    }).select("id").single();
    if (error || !ins) { await admin.storage.from(RECORD_FILES_BUCKET).remove([path]); failed.push(t.id); continue; }
    copied += 1;
    audits.push({ action: "create", entityType: "record_file", entityId: String(ins.id), actorId: user?.id ?? null, actorName: user?.email ?? actor, metadata: { entity_type: t.type, entity_id: t.id, file_name: src.file_name, copied_from: fromId } });
  }
  if (audits.length) await writeAuditMany(admin, audits);
  return NextResponse.json({ data: { copied, failed }, error: null });
}
