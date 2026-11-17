"use client";

/**
 * 🎥 กล้องอัดคลิปแพ็ค ≤ 60 วิ + ตัวหนังสือฝังในวิดีโอ (docs/packing-station.md §3.2)
 *
 * ภาพกล้อง → วาดลงผืนภาพ (canvas) พร้อมตัวหนังสือ (เลขออเดอร์ · เลขพัสดุ · คนแพ็ค · สถานี · วัน-เวลาเดินจริง)
 * → อัดจากผืนภาพนั้น → ตัวหนังสือติดอยู่ในคลิป ลบไม่ได้
 * ชนิดไฟล์: MP4 ถ้าเบราว์เซอร์อัดได้ (Chrome รุ่นใหม่/Safari) ไม่งั้น WebM · 720p ~1 Mbps · ไม่อัดเสียง
 * อ่านบาร์โค้ดจากกล้องตัวเดียวกันได้ (มือถือ Android) ผ่าน getBarcodeDetector ของกลาง ScanInput
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getBarcodeDetector, type BarcodeDetectorLike } from "@/components/scan-input";
import { CLIP_MAX_SEC } from "@/lib/packing";

export type CamStatus = "off" | "starting" | "on" | "error";
export type Overlay = { order: string; tracking: string; packer: string; station: string };
export type RecordedClip = { blob: Blob; mime: string; duration_sec: number; snapshot: Blob | null };

const FPS = 15;
const MIME_CANDIDATES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const pickMime = (): string => {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
};

const thaiNow = (): string => new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function useClipRecorder(opts: { deviceId?: string; enabled: boolean; readBarcodes?: boolean; onBarcode?: (code: string) => void; onAutoStop?: () => void }) {
  const { deviceId, enabled, readBarcodes = false } = opts;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const overlayRef = useRef<Overlay | null>(null);
  const drawTimer = useRef<number | null>(null);
  const autoTimer = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const detectBusy = useRef(false);
  const lastDetect = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const cbRef = useRef(opts);
  useEffect(() => { cbRef.current = opts; });

  const [status, setStatus] = useState<CamStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const mime = useRef(pickMime());

  // วาดภาพกล้อง + ตัวหนังสือ ลงผืนภาพทุกเฟรม (+ อ่านบาร์โค้ดทุก ~300ms)
  const draw = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return;
    const w = v.videoWidth || 1280, h = v.videoHeight || 720;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const o = overlayRef.current;
    const fs = Math.max(16, Math.round(h / 26));
    const lines = [thaiNow(), ...(o ? [`ออเดอร์ ${o.order}${o.tracking ? `  ·  พัสดุ ${o.tracking}` : ""}`, `แพ็คโดย ${o.packer || "-"}${o.station ? `  ·  ${o.station}` : ""}`] : [])];
    if (recRef.current?.state === "recording") lines.push(`● REC ${Math.floor((performance.now() - startedAtRef.current) / 1000)}s / ${CLIP_MAX_SEC}s`);
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const pad = Math.round(fs * 0.4);
    const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, boxW, lines.length * (fs + pad) + pad);
    ctx.fillStyle = "#fff";
    lines.forEach((l, i) => ctx.fillText(l, pad, (i + 1) * (fs + pad) - pad / 2));

    const det = detectorRef.current;
    if (det && cbRef.current.readBarcodes && !detectBusy.current) {
      detectBusy.current = true;
      det.detect(v).then((codes) => {
        const raw = codes[0]?.rawValue?.trim();
        if (!raw) return;
        const now = Date.now();
        if (raw === lastDetect.current.code && now - lastDetect.current.at < 2500) return;
        lastDetect.current = { code: raw, at: now };
        cbRef.current.onBarcode?.(raw);
      }).catch(() => { /* เฟรมนี้อ่านไม่ได้ */ }).finally(() => { window.setTimeout(() => { detectBusy.current = false; }, 300); });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (drawTimer.current) { window.clearInterval(drawTimer.current); drawTimer.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("off");
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("error"); setError("เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องเปิดผ่าน https)"); return; }
    setStatus("starting"); setError(null);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play().catch(() => {}); }
      const Det = getBarcodeDetector();
      if (Det && !detectorRef.current) { try { detectorRef.current = new Det({ formats: ["code_128", "qr_code", "ean_13", "code_39"] }); } catch { detectorRef.current = null; } }
      if (drawTimer.current) window.clearInterval(drawTimer.current);
      drawTimer.current = window.setInterval(draw, 1000 / FPS);
      setStatus("on");
      navigator.mediaDevices.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === "videoinput"))).catch(() => {});
    } catch (e) {
      setStatus("error");
      const name = (e as { name?: string })?.name;
      setError(name === "NotAllowedError" ? "ยังไม่ได้อนุญาตให้ใช้กล้อง — กดรูปกล้องที่แถบที่อยู่เว็บ แล้วเลือก 'อนุญาต'" : name === "NotFoundError" || name === "OverconstrainedError" ? "ไม่พบกล้อง — เสียบกล้อง USB หรือเลือกกล้องตัวอื่นในตั้งค่าสถานี" : "เปิดกล้องไม่สำเร็จ ลองใหม่");
    }
  }, [deviceId, draw]);

  useEffect(() => {
    if (enabled) void startCamera(); else stopCamera();
    return () => stopCamera();
  }, [enabled, startCamera, stopCamera]);

  const clearAuto = () => { if (autoTimer.current) { window.clearTimeout(autoTimer.current); autoTimer.current = null; } };

  /** หยุดอัด → คลิป (null = ไม่ได้อัดอยู่ / ทิ้ง) */
  const stop = useCallback((opts2: { discard?: boolean; snapshot?: boolean } = {}): Promise<RecordedClip | null> => {
    clearAuto();
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") { setRecording(false); return Promise.resolve(null); }
    const snapPromise: Promise<Blob | null> = opts2.snapshot && canvasRef.current
      ? new Promise((res) => canvasRef.current!.toBlob((b) => res(b), "image/jpeg", 0.82))
      : Promise.resolve(null);
    const duration = Math.round((performance.now() - startedAtRef.current) / 100) / 10;
    return new Promise((resolve) => {
      rec.onstop = async () => {
        recRef.current = null;
        setRecording(false);
        const snapshot = await snapPromise;
        if (opts2.discard) { chunksRef.current = []; resolve(null); return; }
        const type = rec.mimeType || mime.current || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        resolve(blob.size ? { blob, mime: type.split(";")[0], duration_sec: Math.min(duration, CLIP_MAX_SEC), snapshot } : null);
      };
      try { rec.stop(); } catch { recRef.current = null; setRecording(false); resolve(null); }
    });
  }, []);

  /** เริ่มอัดคลิปใหม่ (ถ้าอัดอยู่ต้อง stop ก่อน) */
  const start = useCallback((overlay: Overlay): boolean => {
    overlayRef.current = overlay;
    const c = canvasRef.current;
    if (!c || status !== "on" || typeof MediaRecorder === "undefined") return false;
    const canvasStream = (c as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(FPS);
    if (!canvasStream) return false;
    try {
      const rec = new MediaRecorder(canvasStream, { ...(mime.current ? { mimeType: mime.current } : {}), videoBitsPerSecond: 1_000_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.start(1000);
      recRef.current = rec;
      startedAtRef.current = performance.now();
      setRecording(true); setElapsed(0);
      clearAuto();
      autoTimer.current = window.setTimeout(() => { cbRef.current.onAutoStop?.(); }, CLIP_MAX_SEC * 1000);
      return true;
    } catch { return false; }
  }, [status]);

  /** ภาพนิ่งจากกล้องตอนนี้ (ตัวหนังสือฝังด้วย) — ใช้ตอนปิดกล่อง */
  const snapshot = useCallback((): Promise<Blob | null> => {
    const c = canvasRef.current;
    if (!c || status !== "on") return Promise.resolve(null);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.82));
  }, [status]);

  const setOverlay = useCallback((o: Overlay | null) => { overlayRef.current = o; }, []);

  // ตัวนับวินาทีบนจอ
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(t);
  }, [recording]);

  return { videoRef, canvasRef, status, error, recording, elapsed, devices, start, stop, snapshot, setOverlay, retry: startCamera, canDetect: !!getBarcodeDetector(), mime: mime.current };
}
