/**
 * 🖼 เตรียมรูปให้เบราว์เซอร์เปิดได้ก่อนย่อ/อัป (ของกลาง · ใช้ในเบราว์เซอร์เท่านั้น)
 *   - ไฟล์ว่าง / อ่านไม่ได้ (เช่น ไฟล์ Google Drive ที่ยังไม่ได้โหลดลงเครื่อง) → ImageOpenError บอกสาเหตุ
 *   - รูป HEIC (iPhone) → แปลงเป็น JPG ในเครื่อง (heic2any · โหลดเฉพาะตอนเจอไฟล์ HEIC จริง)
 *   - เปิดไม่ได้ด้วยเหตุอื่น → imageOpenErrorFor() ดูหัวไฟล์แล้วบอกว่าเป็น TIFF/PSD/PDF/ไฟล์เสีย ฯลฯ
 * กฎ/ข้อความ: lib/image-open-error · ชนิดจากหัวไฟล์: lib/media-upload-limits sniffMediaType
 * ใช้ที่: components/image-attach (resizeImage → uploadResizedImage/prepareResizedImage) · lib/media-upload normalizeMediaFile
 */
import { sniffMediaType } from "@/lib/media-upload-limits";
import { ImageOpenError, imageOpenProblem } from "@/lib/image-open-error";

/** 16 ไบต์แรกของไฟล์ · null = อ่านไม่ได้ */
export async function readFileHead(file: Blob): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    return null;
  }
}

/** HEIC → JPG (คงชื่อเดิมแต่เปลี่ยนนามสกุล) · แปลงไม่ได้ = ImageOpenError("heic_failed") */
export async function heicToJpeg(file: File, quality = 0.92): Promise<File> {
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality });
    const blob = Array.isArray(out) ? out[0] : out;
    if (!blob || !blob.size) throw new Error("empty");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    throw new ImageOpenError("heic_failed");
  }
}

/** ไฟล์ที่พร้อมให้เบราว์เซอร์เปิด: ตรวจไฟล์ว่าง/อ่านไม่ได้ก่อน · HEIC แปลงเป็น JPG · อื่น ๆ คืนไฟล์เดิม */
export async function toDecodableImage(file: File): Promise<File> {
  if (file.size === 0) throw new ImageOpenError("empty");
  const head = await readFileHead(file);
  if (!head) throw new ImageOpenError("unreadable");
  return sniffMediaType(head) === "image/heic" ? heicToJpeg(file) : file;
}

/** หลังเปิดรูปไม่สำเร็จ: ดูหัวไฟล์อีกรอบ แล้วคืน error ที่บอกสาเหตุ */
export async function imageOpenErrorFor(file: File): Promise<ImageOpenError> {
  const head = file.size === 0 ? new Uint8Array(0) : await readFileHead(file);
  return new ImageOpenError(imageOpenProblem(file.size, head ? sniffMediaType(head) : null));
}
