/**
 * ⬆ ตัวอัปไฟล์กลางตามกฎที่เก็บไฟล์ (ฝั่งหน้าจอ) — ช่องอัปบอกแค่ "หมวด" ระบบเลือกที่เก็บให้ตามกฎ (/master/storage-rules)
 *
 *   const ref = await uploadFileByRule({ category: "supplier_bills", file, r2Folder: "goods-receipts" });
 *
 * 1) ถาม /api/files/upload-target (ตรวจสิทธิ์ + ชนิด/ขนาดตามกฎ)
 * 2) Supabase → อัปตรงจากเบราว์เซอร์ด้วยลิงก์อัปชั่วคราว (ไฟล์ใหญ่ได้ ไม่ผ่าน Vercel) → ref "sb:erp-files/…"
 *    R2       → ทางเดิม /api/admin/upload (≤ 4 MB · ลงคลังไฟล์กลางอัตโนมัติ) → ref = R2 key
 * ค่าที่ได้ (ref) เก็บในคอลัมน์เดิมได้เลย · เปิดดูด้วย components/file-ref · รูปแบบ ref: lib/file-ref.ts
 * ⚠️ ห้าม import ไฟล์นี้จาก API route (ใช้ supabaseBrowser / apiFetch ของเบราว์เซอร์)
 */
import { apiFetch } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase-browser";

export class FileUploadError extends Error {}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new FileUploadError(res.status === 413 ? "ไฟล์ใหญ่เกินกว่าที่ส่งผ่านเว็บได้" : `อัปโหลดไม่สำเร็จ (${res.status})`); }
}

export async function uploadFileByRule({ category, file, r2Folder }: { category: string; file: File; r2Folder: string }): Promise<string> {
  const target = await readJson(await apiFetch("/api/files/upload-target", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, file_name: file.name, size_bytes: file.size }),
  }));
  if (target.error) throw new FileUploadError(String(target.error));

  if (target.provider === "supabase") {
    const { error } = await supabaseBrowser.storage.from(String(target.bucket))
      .uploadToSignedUrl(String(target.path), String(target.token), file, { contentType: file.type || undefined });
    if (error) throw new FileUploadError(`อัปโหลดไม่สำเร็จ: ${error.message}`);
    return String(target.ref);
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", r2Folder);
  const up = await readJson(await apiFetch("/api/admin/upload", { method: "POST", body: fd }));
  if (up.error || !up.r2_key) throw new FileUploadError(String(up.error ?? "อัปโหลดไม่สำเร็จ"));
  return String(up.r2_key);
}
