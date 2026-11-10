/**
 * 📁 ฝั่งหน้าจอ: โฟลเดอร์ Drive ของใบงานออกแบบ (ใช้คู่กับของกลาง DriveUploadBox) — ป๊อปอัปจอคอม + หน้าใบงานมือถือ
 *   fetchSheetDriveFolder  → ลิงก์โฟลเดอร์ (null = ยังไม่มี · สร้างตอนอัปไฟล์แรก)
 *   startSheetDriveUpload  → API หา/สร้างโฟลเดอร์ + เปิด session + ลงประวัติ → DriveUploadBox ส่งตัวไฟล์ต่อเอง
 * ฝั่งเซิร์ฟเวอร์: app/api/design-sheets/[id]/drive · lib/design-sheet-drive-server.ts · doc: docs/drive-upload-box.md
 */
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import type { DriveUploadStart } from "@/components/drive-upload-box";

export async function fetchSheetDriveFolder(sheetId: string): Promise<string | null> {
  const j = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheetId)}/drive`).then((r) => r.json()).catch(() => null) as { data?: { folder_url?: string | null }; error?: string | null } | null;
  return j && !j.error ? j.data?.folder_url ?? null : null;
}

export async function startSheetDriveUpload(sheetId: string, file: File): Promise<DriveUploadStart> {
  const res = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheetId)}/drive`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mime: file.type || "application/octet-stream", size: file.size }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error || !j.data?.upload_url) throw new Error(j.error || tr(`เริ่มอัปไม่สำเร็จ (${res.status})`, `Could not start upload (${res.status})`));
  return { upload_url: j.data.upload_url, folder_url: j.data.folder_url };
}
