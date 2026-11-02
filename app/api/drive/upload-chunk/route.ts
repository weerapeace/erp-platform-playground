/**
 * ส่งต่อไฟล์ "ทีละชิ้น" เข้า Google Drive resumable session (ของกลาง)
 *
 * POST /api/drive/upload-chunk   body = ไบต์ของชิ้น (application/octet-stream, ≤ ~3.75MB)
 *   หัว: x-upload-url (resumable session จาก driveCreateResumableSession) · x-range-start · x-total-size
 *   → { done:false, next }  ยังไม่ครบ (next = ไบต์ถัดไปที่ Google ต้องการ)
 *   → { done:true, file_id } ชิ้นสุดท้าย Google สร้างไฟล์แล้ว
 *
 * ทำไมต้องผ่านแอป: เบราว์เซอร์ PUT ตรงเข้า Google โดน CORS · Vercel รับ body ได้ราว 4.5MB ต่อคำขอ
 * ความปลอดภัย: รับเฉพาะลิงก์ upload ของ googleapis (กันใช้เป็นตัวยิงไปที่อื่น) · ต้องล็อกอิน + สิทธิ์อัปไฟล์
 * ฝั่งจอใช้ lib/drive-chunk-upload (uploadFileToDrive) · กติกาขนาดชิ้นอยู่ที่ lib/drive-upload-relay
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { DRIVE_CHUNK_BYTES, isDriveUploadUrl, chunkContentRange, nextOffsetFromRange } from "@/lib/drive-upload-relay";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "files.upload"); if (denied) return denied;
  const uploadUrl = request.headers.get("x-upload-url") ?? "";
  const start = Number(request.headers.get("x-range-start"));
  const total = Number(request.headers.get("x-total-size"));
  if (!isDriveUploadUrl(uploadUrl)) return NextResponse.json({ error: "ลิงก์อัปโหลดไม่ถูกต้อง" }, { status: 400 });
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(total) || total <= 0 || start >= total) return NextResponse.json({ error: "ช่วงไบต์ไม่ถูกต้อง" }, { status: 400 });

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > DRIVE_CHUNK_BYTES) return NextResponse.json({ error: "ขนาดชิ้นไม่ถูกต้อง" }, { status: 400 });
  if (start + bytes.length > total) return NextResponse.json({ error: "ชิ้นเกินขนาดไฟล์" }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Range": chunkContentRange(start, bytes.length, total) }, body: bytes });
  } catch (e) {
    return NextResponse.json({ error: `ส่งชิ้นไฟล์เข้า Drive ไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
  if (res.status === 308) return NextResponse.json({ done: false, next: nextOffsetFromRange(res.headers.get("range")) });
  if (res.status === 200 || res.status === 201) {
    const j = await res.json().catch(() => ({})) as { id?: string };
    if (!j.id) return NextResponse.json({ error: "Drive ไม่ได้ส่งรหัสไฟล์กลับมา" }, { status: 502 });
    return NextResponse.json({ done: true, file_id: j.id });
  }
  const msg = await res.text().catch(() => "");
  return NextResponse.json({ error: `Drive ปฏิเสธชิ้นไฟล์ (${res.status}) ${msg.slice(0, 200)}` }, { status: 502 });
}
