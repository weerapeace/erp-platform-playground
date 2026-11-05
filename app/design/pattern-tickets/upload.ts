"use client";

/**
 * อัปไฟล์แนบของตั๋ว Pattern ขึ้นโฟลเดอร์ Drive ของตั๋ว (ไฟล์ใหญ่ได้ — ส่งทีละชิ้นผ่านของกลาง lib/drive-chunk-upload)
 */
import { apiFetch } from "@/lib/api";
import { uploadFileToDrive } from "@/lib/drive-chunk-upload";

export async function uploadTicketFile(ticketId: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  const res = await apiFetch(`/api/pattern-tickets/${ticketId}/drive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mime: file.type || "application/octet-stream", size: file.size }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error || !j.data?.upload_url) throw new Error(j.error || `เริ่มอัปไม่สำเร็จ (${res.status})`);
  await uploadFileToDrive(file, j.data.upload_url as string, (sent, total) => onProgress?.(total ? Math.round((sent / total) * 100) : 0));
}

export const fmtBytes = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;
