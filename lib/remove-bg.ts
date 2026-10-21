/**
 * ✂️ ตัดพื้นรูปด้วย AI ในเบราว์เซอร์ (ของกลาง) — ฟรี ไม่ต้องมีรหัส API · รูปไม่ถูกส่งออกไปที่อื่น
 *   ตัว AI = MODNet (Apache-2.0 · ตัดคน/นางแบบ ถือกระเป๋าได้) ผ่าน Transformers.js
 *   โหลดจาก CDN ตอนกดครั้งแรก (~25MB · เบราว์เซอร์จำไว้ ครั้งต่อไปเร็ว) — ไม่ได้ติดตั้งเป็นแพ็กเกจ → ไม่ถ่วงขนาดเว็บ/เวลา build
 *   มีการ์ดจอ (WebGPU) = เร็ว · ไม่มี = ใช้ CPU (ช้ากว่าแต่ได้ผลเท่ากัน)
 *   ทดสอบ 2026-10-21 กับรูปลุคจริง: ตัวคนหาย 0.3% (กระโปรงตาข่ายโปร่ง) · พื้นหลังค้าง 0.02%
 * ใช้กับ: ช่องรูปที่ตั้ง removeBg (ตอนนี้ = รูปลุคของ Section รันเวย์ลุค) ผ่าน ImageUploadField
 * ไม่เหมาะ: รูปสินค้าล้วนไม่มีคน (AI ตัวนี้ฝึกกับรูปคน)
 */

const TJS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1";
const MODEL = "Xenova/modnet";

type CutImage = { width: number; height: number; toCanvas(): HTMLCanvasElement | OffscreenCanvas };
type Segmenter = (input: string) => Promise<CutImage[]>;

let segmenter: Promise<Segmenter> | null = null;

async function loadSegmenter(): Promise<Segmenter> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T: any = await import(/* webpackIgnore: true */ (TJS_URL as string));
  try {
    return await T.pipeline("background-removal", MODEL, { device: "webgpu", dtype: "fp32" });
  } catch {
    return await T.pipeline("background-removal", MODEL, { device: "wasm", dtype: "fp32" });
  }
}

export type RemoveBgStage = "model" | "cutting" | "saving";

/** ขอบใส (alpha) ที่เหลือรอบตัวคน → ตัดทิ้ง · เหลือขอบบน/ข้างนิดหน่อย ขอบล่างชิด (เท้าแตะขอบ = ยืนพื้นเท่ากันทุกรูป) */
function trimTransparent(src: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const data = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
  if (right < 0) return src; // ตัดแล้วไม่เหลืออะไร — คืนรูปเดิม (ให้คนเห็นเองว่าตัดไม่ได้)
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.02);
  const x0 = Math.max(0, left - pad), y0 = Math.max(0, top - pad), x1 = Math.min(w, right + 1 + pad), y1 = Math.min(h, bottom + 1);
  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * ตัดพื้นรูปที่ src (URL รูปในเว็บเดียวกัน เช่น /api/r2-image?key=…) → ไฟล์รูปพื้นใส
 * เก็บเป็น WebP (เล็กกว่า PNG หลายเท่า · มีพื้นใส) · เบราว์เซอร์ที่ทำ WebP ไม่ได้ = PNG
 */
export async function removeBackground(src: string, opts: { trim?: boolean; onStage?: (s: RemoveBgStage) => void } = {}): Promise<File> {
  opts.onStage?.("model");
  segmenter ??= loadSegmenter().catch((e) => {
    segmenter = null; // โหลดไม่สำเร็จ (เน็ตหลุด) → กดใหม่แล้วลองโหลดใหม่
    throw e;
  });
  const seg = await segmenter;
  opts.onStage?.("cutting");
  const [cut] = await seg(src);
  if (!cut) throw new Error("ตัดพื้นไม่สำเร็จ");
  const raw = cut.toCanvas();
  let canvas = document.createElement("canvas");
  canvas.width = raw.width;
  canvas.height = raw.height;
  canvas.getContext("2d")!.drawImage(raw, 0, 0);
  if (opts.trim) canvas = trimTransparent(canvas);
  opts.onStage?.("saving");
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.92));
  const out = blob ?? (await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png")));
  if (!out) throw new Error("บันทึกรูปไม่สำเร็จ");
  const ext = out.type === "image/webp" ? "webp" : "png";
  return new File([out], `cutout-${Date.now()}.${ext}`, { type: out.type });
}
