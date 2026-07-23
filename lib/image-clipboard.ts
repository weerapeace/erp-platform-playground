/**
 * ของกลาง — คัดลอกรูปลง clipboard + ดาวน์โหลดรูปเป็น JPG
 *
 * รูปในระบบเสิร์ฟผ่าน proxy /api/r2-image (โดเมนเดียวกัน) → วาดลง canvas แล้ว export ได้
 * โดยไม่ติด CORS (canvas ไม่ "taint"). ถ้าเป็นรูปข้ามโดเมนที่ไม่มี CORS จะ throw → ให้ผู้เรียกจัดการ fallback
 *
 * ใช้:
 *   await copyImageToClipboard(url)          // คัดลอกลงคลิปบอร์ด (Ctrl+V วางได้)
 *   await downloadImageAsJpg(url, "ชื่อไฟล์") // ดาวน์โหลดเป็น .jpg
 */

/** โหลดรูป → วาดลง canvas → คืน Blob ชนิดที่ต้องการ (jpeg เติมพื้นขาวเพราะไม่มีพื้นโปร่ง) */
function imageToBlob(url: string, type: "image/png" | "image/jpeg", quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        if (!ctx) { reject(new Error("no ctx")); return; }
        if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
      } catch (e) { reject(e instanceof Error ? e : new Error("draw failed")); }
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

/** เบราว์เซอร์รองรับคัดลอก "รูป" ลงคลิปบอร์ดไหม (ต้อง https + มี ClipboardItem) */
export function canCopyImage(): boolean {
  return typeof navigator !== "undefined" && !!navigator.clipboard && typeof navigator.clipboard.write === "function" && typeof ClipboardItem !== "undefined";
}

/** คัดลอกรูปลง clipboard (เป็น PNG — คลิปบอร์ดรองรับดีสุด) · ต้องเรียกใน user gesture (onClick) */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (!canCopyImage()) throw new Error("เบราว์เซอร์นี้ไม่รองรับการคัดลอกรูป (ลองดาวน์โหลดแทน)");
  // ส่ง Promise<Blob> เข้า ClipboardItem โดยตรง → Safari/Chrome รองรับ (คงสิทธิ์ user gesture ระหว่างโหลดรูป)
  const item = new ClipboardItem({ "image/png": imageToBlob(url, "image/png") });
  await navigator.clipboard.write([item]);
}

/** ทำชื่อไฟล์ให้ปลอดภัย + ลงท้าย .jpg */
function jpgName(name: string): string {
  const base = (name || "image").replace(/\.[^.]+$/, "").replace(/[^\w฀-๿.-]+/g, "_").slice(0, 60) || "image";
  return `${base}.jpg`;
}

/** ดาวน์โหลดรูปเป็นไฟล์ JPG */
export async function downloadImageAsJpg(url: string, filename: string): Promise<void> {
  const blob = await imageToBlob(url, "image/jpeg", 0.95);
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = jpgName(filename); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
