/**
 * ⬆ ตัวอัปไฟล์กลางตามกฎที่เก็บไฟล์ (ฝั่งหน้าจอ) — ช่องอัปบอกแค่ "หมวด" ระบบเลือกที่เก็บให้ตามกฎ (/master/storage-rules)
 *
 *   const ref = await uploadFileByRule({ category: "supplier_bills", file, r2Folder: "goods-receipts", onProgress: setPct });
 *
 * 1) ถาม /api/files/upload-target (ตรวจสิทธิ์ + ชนิด/ขนาดตามกฎ)
 * 2) Supabase → เบราว์เซอร์ส่งไฟล์ตรงเข้าลิงก์อัปชั่วคราว (ไฟล์ใหญ่ได้ ไม่ผ่าน Vercel · มี % + ยกเลิกได้) → ref "sb:erp-files/…"
 *    R2       → ทางเดิม /api/admin/upload (≤ 4 MB · ลงคลังไฟล์กลางอัตโนมัติ · ไม่มี %) → ref = R2 key
 * ค่าที่ได้ (ref) เก็บในคอลัมน์เดิมได้เลย · เปิดดูด้วย components/file-ref · รูปแบบ ref: lib/file-ref.ts
 * หน้าจอระหว่างอัป: ของกลาง components/upload-progress
 * ⚠️ ห้าม import ไฟล์นี้จาก API route (ใช้ XMLHttpRequest / apiFetch ของเบราว์เซอร์)
 */
import { apiFetch } from "@/lib/api";

export class FileUploadError extends Error {
  /** aborted = ผู้ใช้กดยกเลิกเอง (ไม่ต้องโชว์เป็นข้อผิดพลาด) */
  constructor(message: string, public aborted = false) {
    super(message);
  }
}

export interface FileUploadHandle {
  /** ยกเลิกการส่งไฟล์ (เฉพาะทาง Supabase ที่มี %) */
  abort: () => void;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new FileUploadError(res.status === 413 ? "ไฟล์ใหญ่เกินกว่าที่ส่งผ่านเว็บได้" : `อัปโหลดไม่สำเร็จ (${res.status})`); }
}

/** ส่งไฟล์เข้าลิงก์อัปชั่วคราวของ Supabase (แบบเดียวกับ supabase-js uploadToSignedUrl แต่ใช้ XHR เพื่อให้รู้ %) */
function putToSignedUrl(url: string, file: File, onProgress?: (pct: number) => void, onStart?: (h: FileUploadHandle) => void): Promise<void> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (key) { xhr.setRequestHeader("apikey", key); xhr.setRequestHeader("Authorization", `Bearer ${key}`); }
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "";
      try { msg = String((JSON.parse(xhr.responseText) as { message?: string }).message ?? ""); } catch { /* ไม่มีข้อความ */ }
      reject(new FileUploadError(`อัปโหลดไม่สำเร็จ (${xhr.status})${msg ? `: ${msg}` : ""}`));
    };
    xhr.onerror = () => reject(new FileUploadError("ส่งไฟล์ไม่สำเร็จ — เน็ตหลุดหรือช้าเกินไป กรุณาลองใหม่"));
    xhr.onabort = () => reject(new FileUploadError("ยกเลิกการอัปโหลดแล้ว", true));
    onStart?.({ abort: () => xhr.abort() });
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

export async function uploadFileByRule({ category, file, r2Folder, onProgress, onStart }: {
  category: string;
  file: File;
  r2Folder: string;
  /** 0–100 ระหว่างส่งไฟล์ (ทาง Supabase) · ทาง R2 ไม่เรียก = หน้าจอโชว์แบบไม่รู้ % */
  onProgress?: (pct: number) => void;
  /** ได้ตัวยกเลิกเมื่อเริ่มส่งไฟล์ (ทาง Supabase) */
  onStart?: (h: FileUploadHandle) => void;
}): Promise<string> {
  const target = await readJson(await apiFetch("/api/files/upload-target", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, file_name: file.name, size_bytes: file.size }),
  }));
  if (target.error) throw new FileUploadError(String(target.error));

  if (target.provider === "supabase") {
    if (!target.upload_url) throw new FileUploadError("ขอสิทธิ์อัปโหลดไม่สำเร็จ กรุณาลองใหม่");
    await putToSignedUrl(String(target.upload_url), file, onProgress, onStart);
    return String(target.ref);
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", r2Folder);
  const up = await readJson(await apiFetch("/api/admin/upload", { method: "POST", body: fd }));
  if (up.error || !up.r2_key) throw new FileUploadError(String(up.error ?? "อัปโหลดไม่สำเร็จ"));
  return String(up.r2_key);
}
