/**
 * ส่งไฟล์ใหญ่ขึ้น Google Drive ทีละชิ้นผ่านแอป (ของกลาง — ใช้ได้ทั้งจอและ API)
 * เหตุผล: เบราว์เซอร์ PUT ตรงเข้า Google โดน CORS · เซิร์ฟเวอร์ Vercel รับ body ได้ราว 4.5MB ต่อคำขอ
 * → หั่นไฟล์ชิ้นละ 3.75MB (Google บังคับให้เป็นจำนวนเท่าของ 256KB ยกเว้นชิ้นสุดท้าย) แล้วให้ /api/drive/upload-chunk ส่งต่อเข้า resumable session
 */
export const DRIVE_CHUNK_BYTES = 15 * 256 * 1024;   // 3,932,160 bytes

/** ลิงก์อัปโหลดต้องเป็น resumable session ของ Google Drive เท่านั้น (กันใช้ตัวส่งต่อยิงไปที่อื่น) */
export function isDriveUploadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "www.googleapis.com" && u.pathname.startsWith("/upload/drive/v3/files") && u.searchParams.has("upload_id");
  } catch { return false; }
}

/** หัว Content-Range ของชิ้น (start = ไบต์แรก, len = ขนาดชิ้น) */
export function chunkContentRange(start: number, len: number, total: number): string {
  return `bytes ${start}-${start + len - 1}/${total}`;
}

/** Google ตอบ 308 พร้อม Range: bytes=0-N → ชิ้นถัดไปเริ่มที่ N+1 · ไม่มีหัว Range = ยังไม่ได้อะไรเลย (เริ่ม 0) */
export function nextOffsetFromRange(range: string | null | undefined): number {
  const m = /bytes=\d+-(\d+)/.exec(range ?? "");
  return m ? Number(m[1]) + 1 : 0;
}
