/**
 * ภาพปกวิดีโอ (ทำในเบราว์เซอร์ ก่อน/ระหว่างอัปตัวจริงขึ้น Drive) — ของกลาง · ใช้ได้เฉพาะหน้าจอ (ต้องมี document)
 *
 * เปิดวิดีโอจากไฟล์ในเครื่อง → ข้ามไป ~10% ของความยาว (ไม่เกิน 1 วินาที) → วาดลง canvas → JPEG
 *   เฟรมมืดเกือบดำ (คลิปเปิดด้วยจอดำ/เฟดเข้า) → ลองที่ 25% และ 50% ของความยาวต่อ (เอาเฟรมแรกที่ไม่มืด · มืดหมด = ใช้เฟรมแรก)
 * เบราว์เซอร์เปิดไฟล์ไม่ได้ (เช่น .mov HEVC บน Chrome บางเครื่อง) = คืน null → ผู้เรียกใช้ไอคอนวิดีโอแทน (ไฟล์ยังอัปได้ปกติ)
 * เลือกปกเอง (หน้าอัลบั้ม Contents): posterFromVideoElement = เฟรมที่กำลังโชว์ของ <video> (ต้องโดเมนเดียวกัน เช่น /api/drive-video) · posterFromImageFile = รูปที่อัปเอง
 */
export type VideoPoster = { file: File; width: number; height: number; duration: number };

const DARK_LUMA = 14;   // ความสว่างเฉลี่ย (0–255) ต่ำกว่านี้ = เฟรมมืดเกือบดำ

/** ความสว่างเฉลี่ยคร่าว ๆ ของ canvas (ย่อเหลือ 16×16) — อ่านไม่ได้ = ถือว่าสว่าง (ไม่ข้ามเฟรม) */
function canvasLuma(c: HTMLCanvasElement): number {
  try {
    const s = document.createElement("canvas");
    s.width = 16; s.height = 16;
    const x = s.getContext("2d", { willReadFrequently: true });
    if (!x) return 255;
    x.drawImage(c, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    return sum / (d.length / 4);
  } catch { return 255; }
}

function drawFrame(el: HTMLVideoElement, maxSide: number): HTMLCanvasElement | null {
  const w0 = el.videoWidth, h0 = el.videoHeight;
  if (!w0 || !h0) return null;
  const r = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w0 * r); canvas.height = Math.round(h0 * r);
  canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasToPoster(canvas: HTMLCanvasElement, name: string, width: number, height: number, duration: number): Promise<VideoPoster | null> {
  const blob = await new Promise<Blob | null>((res) => { try { canvas.toBlob(res, "image/jpeg", 0.82); } catch { res(null); } });
  if (!blob) return null;
  return { file: new File([blob], name.replace(/\.[^.]+$/, "") + "-poster.jpg", { type: "image/jpeg" }), width, height, duration };
}

/** เฟรมที่กำลังโชว์ของ <video> ที่เปิดอยู่ → JPEG (ยังไม่มีภาพของเฟรมนั้น = รอโหลดก่อน ≤ 8 วิ) · วาดไม่ได้ = null */
export async function posterFromVideoElement(el: HTMLVideoElement, name: string, maxSide = 1280): Promise<VideoPoster | null> {
  if (typeof document === "undefined") return null;
  try {
    if (el.readyState < 2) {
      await new Promise<void>((res) => {
        const done = () => { el.removeEventListener("loadeddata", done); el.removeEventListener("seeked", done); res(); };
        el.addEventListener("loadeddata", done, { once: true }); el.addEventListener("seeked", done, { once: true });
        setTimeout(done, 8000);
        if (el.readyState === 0) el.load(); else el.currentTime = el.currentTime;
      });
    }
    const canvas = drawFrame(el, maxSide);
    if (!canvas) return null;
    return await canvasToPoster(canvas, name, el.videoWidth, el.videoHeight, Number.isFinite(el.duration) ? el.duration : 0);
  } catch { return null; }
}

/** รูปที่อัปเองเป็นปกคลิป → ย่อด้านยาวไม่เกิน maxSide เป็น JPEG · เปิดรูปไม่ได้ = null */
export async function posterFromImageFile(img: File, maxSide = 1280): Promise<VideoPoster | null> {
  if (typeof document === "undefined") return null;
  try {
    const bm = await createImageBitmap(img);
    const r = Math.min(1, maxSide / Math.max(bm.width, bm.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bm.width * r); canvas.height = Math.round(bm.height * r);
    canvas.getContext("2d")?.drawImage(bm, 0, 0, canvas.width, canvas.height);
    const { width, height } = bm;
    bm.close();
    return await canvasToPoster(canvas, img.name, width, height, 0);
  } catch { return null; }
}

export async function captureVideoPoster(video: File, maxSide = 1280, timeoutMs = 15000): Promise<VideoPoster | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(video);
  const el = document.createElement("video");
  el.muted = true; el.playsInline = true; el.preload = "auto"; el.src = url;
  const wait = (ev: "loadedmetadata" | "seeked") => new Promise<void>((res, rej) => {
    const ok = () => { cleanup(); res(); };
    const bad = () => { cleanup(); rej(new Error("video")); };
    const cleanup = () => { el.removeEventListener(ev, ok); el.removeEventListener("error", bad); };
    el.addEventListener(ev, ok, { once: true }); el.addEventListener("error", bad, { once: true });
  });
  const timer = new Promise<null>((res) => setTimeout(() => res(null), timeoutMs));
  const work = (async (): Promise<VideoPoster | null> => {
    await wait("loadedmetadata");
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    // ลองหลายจุด: ~10% (≤1 วิ) → 25% → 50% · เอาเฟรมแรกที่ไม่มืด (มืดหมด = เฟรมแรก)
    const times = [Math.min(1, Math.max(0, duration * 0.1)), duration * 0.25, duration * 0.5].filter((x, i, a) => i === 0 || (duration > 0 && x > a[0] + 0.2));
    let first: HTMLCanvasElement | null = null;
    let pick: HTMLCanvasElement | null = null;
    for (const tm of times) {
      el.currentTime = tm;
      await wait("seeked");
      const c = drawFrame(el, maxSide);
      if (!c) return null;
      first ??= c;
      if (canvasLuma(c) >= DARK_LUMA) { pick = c; break; }
    }
    const canvas = pick ?? first;
    if (!canvas) return null;
    return await canvasToPoster(canvas, video.name, el.videoWidth, el.videoHeight, duration);
  })().catch(() => null);
  try { return await Promise.race([work, timer]); }
  finally { el.removeAttribute("src"); el.load(); URL.revokeObjectURL(url); }
}
