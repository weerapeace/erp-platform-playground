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

/** รูปนิ่งที่เบราว์เซอร์เปิดแล้วย่อได้ (GIF ไม่อยู่ในนี้ — ย่อแล้วภาพเคลื่อนไหวหาย) */
export const SHRINKABLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/avif"];

/**
 * ย่อรูปนิ่งให้ไฟล์ "ไม่เกิน maxBytes" สำหรับใช้บนเว็บ (เช่น รูปเปิดหน้าสินค้า) — ด้านยาวสุด 3200 → 2560 → 1920 px · WebP (คงพื้นใส)
 * - คุณภาพ 0.9 ก่อน แล้วค่อยลด 0.82 · ภาพเล็กกว่าขนาดนั้นอยู่แล้ว = คงขนาดเดิม แค่เข้ารหัสใหม่
 * - เบราว์เซอร์ทำ WebP ไม่ได้ (Safari รุ่นเก่า) = JPEG พื้นขาว
 * - ย่อแล้วยังเกิน / เปิดรูปไม่ได้ (TIFF/HEIC/PSD) / ไม่ใช่รูปนิ่ง = null
 */
export async function shrinkImageToFit(file: File, maxBytes: number): Promise<{ file: File; width: number; height: number } | null> {
  if (!SHRINKABLE_IMAGE_TYPES.includes(file.type)) return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    if (!long) return null;
    // ภาพเล็กกว่า 3200 อยู่แล้ว = เริ่มที่ขนาดจริง (ไม่ขยาย · ไม่ลองขนาดเดิมซ้ำ)
    for (const side of [...new Set([3200, 2560, 1920].map((s) => Math.min(s, long)))]) {
      const scale = side / long;
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const q of [0.9, 0.82]) {
        let blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/webp", q));
        if (blob && blob.type !== "image/webp") {
          // ทำ WebP ไม่ได้ → JPEG (ถมพื้นขาวก่อน ไม่งั้นส่วนใสกลายเป็นดำ)
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
          blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", q));
        }
        if (blob && blob.size <= maxBytes) {
          const ext = blob.type === "image/webp" ? "webp" : "jpg";
          const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.${ext}`;
          return { file: new File([blob], name, { type: blob.type, lastModified: file.lastModified }), width: w, height: h };
        }
      }
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}
