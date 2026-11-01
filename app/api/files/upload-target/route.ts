/**
 * POST /api/files/upload-target — ตัวอัปกลาง: ถามว่าไฟล์หมวดนี้ต้องส่งไปที่เก็บไหน (ตามกฎ erp_storage_rules)
 *   body { category, file_name, size_bytes }
 *   → { provider: "supabase", bucket, path, token, ref }   เบราว์เซอร์อัปตรงด้วย uploadToSignedUrl (ข้ามลิมิต ~4.5 MB ของ Vercel)
 *   → { provider: "r2" }                                    เบราว์เซอร์อัปทางเดิม /api/admin/upload (≤ 4 MB)
 *   หมวดที่ตั้งเป็น Drive = 400 (ช่องอัปทั่วไปยังไม่รู้ว่าจะลงโฟลเดอร์ไหน)
 * ตรวจ: สิทธิ์อัปของหมวด (STORAGE_CATEGORY_PERMISSIONS) + ชนิด/ขนาดตามกฎ · ฝั่งหน้าจอ: lib/file-upload.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STORAGE_CATEGORY_PERMISSIONS, STORAGE_RULE_SELECT, fileRuleProblem, type StorageRule } from "@/lib/storage-policy";
import { ERP_FILES_BUCKET, newCategoryPath, supabaseFileRef } from "@/lib/file-ref";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const R2_SMALL_MAX = 4 * 1024 * 1024;          // ทาง /api/admin/upload ผ่าน Vercel (รับ body ได้ ~4.5 MB)
const SUPABASE_FALLBACK_MAX = 50 * 1024 * 1024; // = file_size_limit ของ bucket erp-files

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { category?: string; file_name?: string; size_bytes?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }
  const category = String(body.category ?? "").trim();
  const fileName = String(body.file_name ?? "").trim();
  const size = Number(body.size_bytes) || 0;

  const perms = STORAGE_CATEGORY_PERMISSIONS[category];
  if (!perms) return NextResponse.json({ error: "หมวดไฟล์นี้ยังไม่เปิดให้อัปผ่านตัวอัปกลาง" }, { status: 400 });
  const denied = await guardApi(request, perms.upload); if (denied) return denied;
  if (!fileName) return NextResponse.json({ error: "ไม่มีชื่อไฟล์" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("erp_storage_rules").select(STORAGE_RULE_SELECT).eq("rule_key", category).eq("is_active", true).maybeSingle();
  if (error) return NextResponse.json({ error: "โหลดกฎที่เก็บไฟล์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบกฎที่เก็บไฟล์ของหมวดนี้" }, { status: 404 });
  const rule = row as StorageRule;

  if (rule.provider === "drive")
    return NextResponse.json({ error: "หมวดนี้ตั้งให้เก็บใน Google Drive — ช่องอัปนี้ยังส่งไป Drive ไม่ได้ (เปลี่ยนกฎเป็น R2 หรือ Supabase ที่หน้า “กฎที่เก็บไฟล์”)" }, { status: 400 });

  // R2 ผ่านทางเดิมได้ไม่เกิน 4 MB ไม่ว่ากฎตั้งไว้เท่าไร
  const effective = rule.provider === "r2" ? { ...rule, max_bytes: Math.min(rule.max_bytes ?? R2_SMALL_MAX, R2_SMALL_MAX) } : rule;
  const problem = fileRuleProblem(effective, { name: fileName, size }, SUPABASE_FALLBACK_MAX);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  if (rule.provider === "r2") return NextResponse.json({ provider: "r2", error: null });

  const path = newCategoryPath(category, fileName);
  const { data: signed, error: signErr } = await admin.storage.from(ERP_FILES_BUCKET).createSignedUploadUrl(path);
  if (signErr || !signed) return NextResponse.json({ error: "ขอสิทธิ์อัปโหลดไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const finalPath = signed.path ?? path;
  return NextResponse.json({ provider: "supabase", bucket: ERP_FILES_BUCKET, path: finalPath, token: signed.token, ref: supabaseFileRef(ERP_FILES_BUCKET, finalPath), error: null });
}
