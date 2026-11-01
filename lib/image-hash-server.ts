/**
 * 👁️ ลายนิ้วมือหน้าตารูป ฝั่งเซิร์ฟเวอร์ (sharp) — ขั้นย่อรูปต้องตรงกับ lookHashOfBlob ในเบราว์เซอร์ (lib/image-hash)
 * ห้าม import จากไฟล์ "use client"
 */
import sharp from "sharp";
import { LOOK_SIZE, lookHashFromPixels, type LookHash } from "@/lib/image-hash";

export type ImageLook = { look: LookHash | null; width: number | null; height: number | null };

/** ลายนิ้วมือ + ขนาดรูป (หลังหมุนตาม EXIF) · อ่านไม่ได้/ไม่ใช่รูป = null (best-effort ห้าม throw) · รูปเรียบ = look null */
export async function analyzeImageBuffer(buf: ArrayBuffer | Uint8Array | Buffer): Promise<ImageLook | null> {
  try {
    const input = Buffer.isBuffer(buf) ? buf : Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const { data, info } = await sharp(input, { failOn: "none" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize(LOOK_SIZE, LOOK_SIZE, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const swap = (meta.orientation ?? 1) >= 5;
    return {
      look: lookHashFromPixels(data, info.width, info.height, info.channels),
      width: (swap ? meta.height : meta.width) ?? null,
      height: (swap ? meta.width : meta.height) ?? null,
    };
  } catch {
    return null;
  }
}
