/**
 * 🎞 แปลงคลิปเป็น "ภาพทีละเฟรม" สำหรับคลิปเล่นตามการเลื่อน (ผืนผ้าใบ ฉากค้าง) — ทำในเบราว์เซอร์ของคนจัดหน้า ไม่ต้องมีเซิร์ฟเวอร์แปลงวิดีโอ
 *
 * ทำไม: เลื่อนเวลาคลิปตรง ๆ กระตุกบนมือถือหลายรุ่น (คลิปบีบอัดแบบคีย์เฟรมห่าง) — เว็บ Apple ใช้ภาพทีละเฟรมวาดลง canvas แทน
 * วิธี: เปิดคลิป (ลิงก์ /api/r2-image โดเมนเดียวกัน — canvas ไม่ติดล็อกข้ามโดเมน) → กระโดดไปทีละเวลา → วาดลง canvas → WebP (ไม่ได้ = JPEG)
 *       → ส่งทีละ 8 เฟรมไป /api/website/scrub-frames → คืน { key, count, ext } ไว้ใส่ช่อง scrubKey/scrubCount/scrubExt ของชิ้น
 * ขนาด: ยาวสุด 120 เฟรม (≈ 24 เฟรม/วินาที คลิป 5 วิ) · กว้าง 720px · ~30–80KB/เฟรม
 */
import { CANVAS_SCRUB_MAX_FRAMES } from "@/lib/website-canvas";

export interface ScrubFramesResult {
  key: string;
  count: number;
  ext: "webp" | "jpg";
}

const once = (el: EventTarget, ev: string, ms = 15000) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => {
      el.removeEventListener(ev, ok);
      reject(new Error("คลิปตอบช้าเกินไป"));
    }, ms);
    const ok = () => {
      window.clearTimeout(t);
      el.removeEventListener(ev, ok);
      resolve();
    };
    el.addEventListener(ev, ok);
  });

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

/** จำนวนเฟรมที่จะดึง: ~24 ต่อวินาที อย่างน้อย 24 · ไม่เกินเพดาน */
export function scrubFrameCount(durationSec: number, max = CANVAS_SCRUB_MAX_FRAMES): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.max(24, Math.min(max, Math.round(durationSec * 24)));
}

/**
 * @param videoKey r2 key ของคลิปในชิ้น
 * @param onProgress (ขั้น, ทำไปแล้ว, ทั้งหมด) — "read" = ดึงเฟรม · "upload" = ส่งขึ้น
 */
export async function buildScrubFrames(
  videoKey: string,
  onProgress: (stage: "read" | "upload", done: number, total: number) => void,
  opts: { width?: number; signal?: AbortSignal } = {}
): Promise<ScrubFramesResult> {
  const width = opts.width ?? 720;
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = `/api/r2-image?key=${encodeURIComponent(videoKey)}`;
  await once(v, "loadedmetadata");
  const n = scrubFrameCount(v.duration);
  if (n < 2 || !v.videoWidth) throw new Error("อ่านความยาว/ขนาดคลิปไม่ได้");
  const w = Math.min(width, v.videoWidth);
  const h = Math.round((w * v.videoHeight) / v.videoWidth);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้วาดภาพไม่ได้");

  // ทดลองชนิดภาพ: WebP เล็กกว่า (Safari บางรุ่นแปลงไม่ได้ → JPEG)
  const probe = await toBlob(c, "image/webp", 0.72);
  const ext: "webp" | "jpg" = probe?.type === "image/webp" ? "webp" : "jpg";
  const mime = ext === "webp" ? "image/webp" : "image/jpeg";

  const set = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const send = async (form: FormData) => {
    form.set("set", set);
    form.set("ext", ext);
    const r = await fetch("/api/website/scrub-frames", { method: "POST", body: form, signal: opts.signal });
    const j = (await r.json().catch(() => ({}))) as { error?: string } & Partial<ScrubFramesResult>;
    if (!r.ok) throw new Error(j.error || `อัปไม่สำเร็จ (${r.status})`);
    return j;
  };

  const end = Math.max(0, v.duration - 0.05);
  let batch: Blob[] = [];
  let batchStart = 0;
  let uploaded = 0;
  const flush = async () => {
    if (!batch.length) return;
    const form = new FormData();
    form.set("start", String(batchStart));
    batch.forEach((b, i) => form.append("frame", b, `${batchStart + i}.${ext}`));
    await send(form);
    uploaded += batch.length;
    onProgress("upload", uploaded, n);
    batchStart += batch.length;
    batch = [];
  };

  for (let i = 0; i < n; i++) {
    if (opts.signal?.aborted) throw new Error("ยกเลิกแล้ว");
    v.currentTime = (i / (n - 1)) * end;
    await once(v, "seeked");
    ctx.drawImage(v, 0, 0, w, h);
    const blob = await toBlob(c, mime, 0.72);
    if (!blob) throw new Error("แปลงภาพเฟรมไม่สำเร็จ");
    batch.push(blob);
    onProgress("read", i + 1, n);
    if (batch.length >= 8) await flush();
  }
  await flush();
  const form = new FormData();
  form.set("done", "1");
  form.set("count", String(n));
  form.set("video", videoKey);
  const fin = await send(form);
  return { key: String(fin.key), count: n, ext };
}
