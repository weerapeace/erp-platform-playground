"use client";

/**
 * อัปไฟล์ใหญ่ขึ้น Google Drive ทีละชิ้นผ่านแอป (ฝั่งจอ · ของกลาง)
 *   uploadFileToDrive(file, uploadUrl, onProgress) → file_id
 *   uploadUrl = resumable session ที่ API ฝั่งโมดูลสร้างให้ (เช่น POST /api/creative-content/[id]/drive)
 * ชิ้นละ 3.75MB ผ่าน /api/drive/upload-chunk · ชิ้นไหนพลาดลองใหม่ 3 ครั้ง (Google บอกว่ารับถึงไหน → ต่อจากตรงนั้น)
 */
import { apiFetch } from "@/lib/api";
import { DRIVE_CHUNK_BYTES } from "@/lib/drive-upload-relay";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadFileToDrive(file: File, uploadUrl: string, onProgress?: (sent: number, total: number) => void): Promise<string> {
  const total = file.size;
  if (!total) throw new Error("ไฟล์ว่าง");
  let start = 0;
  let stall = 0;   // Google ไม่ขยับรับต่อหลายรอบติด = หยุด (กันวนไม่จบ)
  while (start < total) {
    const end = Math.min(start + DRIVE_CHUNK_BYTES, total);
    let lastErr = "";
    let result: { done?: boolean; next?: number; file_id?: string } | null = null;
    for (let attempt = 1; attempt <= 3 && !result; attempt++) {
      try {
        const res = await apiFetch("/api/drive/upload-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "x-upload-url": uploadUrl, "x-range-start": String(start), "x-total-size": String(total) },
          body: file.slice(start, end),
        });
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (res.ok && !j.error) result = j;
        else lastErr = j.error || `HTTP ${res.status}`;
      } catch (e) { lastErr = (e as Error).message; }
      if (!result && attempt < 3) await sleep(1500 * attempt);
    }
    if (!result) throw new Error(`อัปขึ้น Drive ไม่สำเร็จ: ${lastErr}`);
    if (result.done && result.file_id) { onProgress?.(total, total); return result.file_id; }
    const next = typeof result.next === "number" ? result.next : end;
    stall = next > start ? 0 : stall + 1;
    if (stall >= 3) throw new Error("อัปขึ้น Drive ไม่สำเร็จ: Drive ไม่รับชิ้นไฟล์ต่อ");
    start = next;
    onProgress?.(start, total);
  }
  throw new Error("อัปขึ้น Drive ไม่ครบ");
}
