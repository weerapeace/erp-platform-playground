/**
 * ภาพปกวิดีโอ (ทำในเบราว์เซอร์ ก่อน/ระหว่างอัปตัวจริงขึ้น Drive) — ของกลาง · ใช้ได้เฉพาะหน้าจอ (ต้องมี document)
 *
 * เปิดวิดีโอจากไฟล์ในเครื่อง → ข้ามไป ~10% ของความยาว (ไม่เกิน 1 วินาที — กันเฟรมดำตอนเริ่ม) → วาดลง canvas → JPEG
 * เบราว์เซอร์เปิดไฟล์ไม่ได้ (เช่น .mov HEVC บน Chrome บางเครื่อง) = คืน null → ผู้เรียกใช้ไอคอนวิดีโอแทน (ไฟล์ยังอัปได้ปกติ)
 */
export type VideoPoster = { file: File; width: number; height: number; duration: number };

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
    el.currentTime = Math.min(1, Math.max(0, duration * 0.1));
    await wait("seeked");
    const w0 = el.videoWidth, h0 = el.videoHeight;
    if (!w0 || !h0) return null;
    const r = Math.min(1, maxSide / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w0 * r); canvas.height = Math.round(h0 * r);
    canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return null;
    const name = video.name.replace(/\.[^.]+$/, "") + "-poster.jpg";
    return { file: new File([blob], name, { type: "image/jpeg" }), width: w0, height: h0, duration };
  })().catch(() => null);
  try { return await Promise.race([work, timer]); }
  finally { el.removeAttribute("src"); el.load(); URL.revokeObjectURL(url); }
}
