/**
 * ย่อรูปฝั่ง client ก่อนอัปโหลด — จำกัด "ด้านกว้าง" ไม่เกิน maxWidth (คงสัดส่วน)
 * - ไฟล์ที่ไม่ใช่รูป / gif / svg → คืนไฟล์เดิม (ไม่ยุ่ง)
 * - รูปที่กว้าง ≤ maxWidth อยู่แล้ว → คืนไฟล์เดิม (ไม่ย่อ ไม่ทำให้คุณภาพเสีย)
 * - คงชนิดไฟล์เดิม (jpeg/png/webp) เพื่อไม่ทำลายความโปร่งใสของ PNG
 */
export async function downscaleImageWidth(file: File, maxWidth = 1200, quality = 0.85): Promise<File> {
  const type = file.type || "";
  if (!type.startsWith("image/") || type === "image/gif" || type === "image/svg+xml") return file;

  let bitmap: ImageBitmap | null = null;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  const { width, height } = bitmap;
  if (!width || width <= maxWidth) { bitmap.close?.(); return file; }

  const scale = maxWidth / width;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close?.(); return file; }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const outType = type === "image/png" ? "image/png" : (type === "image/webp" ? "image/webp" : "image/jpeg");
  const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), outType, quality));
  if (!blob || blob.size >= file.size) return file;   // ย่อแล้วไม่เล็กลง → ใช้ของเดิม

  return new File([blob], file.name, { type: outType, lastModified: file.lastModified });
}
