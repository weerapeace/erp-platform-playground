"use client";

/**
 * ของกลาง — ตัวรับรหัสจากการสแกน (ScanInput)
 *
 * รับได้ 3 ทางในตัวเดียว ทุกหน้าที่ต้องสแกนให้ใช้ตัวนี้ (ห้ามเขียนตัวอ่านกล้องเองซ้ำ):
 *  1) กล้องในเว็บ — Android/Chrome ใช้ BarcodeDetector ในตัว (เร็ว ไม่ต้องโหลดอะไร อ่านได้ทั้ง QR + บาร์โค้ดเส้น)
 *                   iPhone/iPad ไม่มี BarcodeDetector → ถอยไปใช้ jsQR (โหลดตอนเปิดกล้องเท่านั้น, อ่านได้เฉพาะ QR)
 *  2) เครื่องยิงบาร์โค้ด USB — มันทำตัวเหมือนคีย์บอร์ด พิมพ์รัวแล้วจบด้วย Enter → ยิงลงช่องกรอกได้เลย
 *  3) พิมพ์มือ — เผื่อ QR เลอะ/ฉีก
 *
 * ⚠️ กล้องต้องเป็นหน้าเต็ม ไม่อยู่ในกรอบซ้อน (iframe) — iOS บล็อกกล้องใน iframe
 *    แอปเดี่ยว /app/<key> เปิดหน้าในกรอบ → หน้าสแกนจึงต้องเปิดเป็นหน้าเต็มเสมอ
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onScan: (code: string) => void;
  /** หยุดอ่านชั่วคราว (เช่นระหว่างกำลังโหลดผลของรหัสก่อนหน้า) */
  paused?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
};

type CamState = "off" | "starting" | "on" | "error";

// BarcodeDetector ยังไม่มีใน TS lib — ประกาศเท่าที่ใช้
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
const getBarcodeDetector = (): BarcodeDetectorCtor | undefined =>
  (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

/** กันอ่านซ้ำรัว ๆ — รหัสเดิมภายใน 2.5 วิ ถือว่าเป็นการอ่านครั้งเดิม */
const REPEAT_MS = 2500;

export function ScanInput({ onScan, paused = false, autoFocus = true, placeholder = "ยิงบาร์โค้ด หรือพิมพ์รหัสแล้วกด Enter" }: Props) {
  const [text, setText] = useState("");
  const [cam, setCam] = useState<CamState>("off");
  const [camNote, setCamNote] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const emit = useCallback((code: string) => {
    const v = code.trim();
    if (!v) return;
    const now = Date.now();
    if (lastRef.current.code === v && now - lastRef.current.at < REPEAT_MS) return;
    lastRef.current = { code: v, at: now };
    if (navigator.vibrate) navigator.vibrate(60);
    onScan(v);
  }, [onScan]);

  const stopCam = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
    setCam("off");
  }, []);

  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = useCallback(async () => {
    setCam("starting"); setCamNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopCam(); return; }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");   // iOS ไม่งั้นเด้งเต็มจอ
      await video.play();
      setCam("on");

      const Ctor = getBarcodeDetector();
      let detector: BarcodeDetectorLike | null = null;
      let jsQR: typeof import("jsqr").default | null = null;

      if (Ctor) {
        try { detector = new Ctor({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8"] }); }
        catch { detector = null; }
      }
      if (!detector) {
        jsQR = (await import("jsqr")).default;
        setCamNote("อุปกรณ์นี้อ่านได้เฉพาะ QR (บาร์โค้ดเส้นใช้เครื่องยิงหรือพิมพ์รหัสแทน)");
      }

      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        rafRef.current = requestAnimationFrame(() => { void tick(); });
        if (pausedRef.current) return;
        const v = videoRef.current;
        if (!v || v.readyState < 2 || !ctx) return;

        if (detector) {
          try {
            const found = await detector.detect(v);
            if (found.length) emit(found[0].rawValue);
          } catch { /* บางเฟรมอ่านไม่ได้ = ปกติ */ }
          return;
        }
        if (jsQR) {
          // ย่อก่อนอ่าน — เต็มความละเอียดกินแรงเครื่องมากโดยไม่จำเป็น
          const w = 480;
          const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
          canvas.width = w; canvas.height = h;
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const res = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (res?.data) emit(res.data);
        }
      };
      void tick();
    } catch (e) {
      setCam("error");
      const name = e instanceof Error ? e.name : "";
      setCamNote(
        name === "NotAllowedError" ? "ยังไม่ได้อนุญาตให้ใช้กล้อง — กดอนุญาตในแถบที่เบราว์เซอร์ถาม แล้วลองใหม่"
        : name === "NotFoundError" ? "ไม่พบกล้องบนอุปกรณ์นี้"
        : "เปิดกล้องไม่ได้ — ใช้เครื่องยิงหรือพิมพ์รหัสแทนได้",
      );
    }
  }, [emit, stopCam]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await (track as MediaStreamTrack & { applyConstraints: (c: unknown) => Promise<void> })
        .applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((t) => !t);
    } catch { setCamNote("อุปกรณ์นี้เปิดไฟฉายจากในเว็บไม่ได้"); }
  }, [torchOn]);

  return (
    <div className="space-y-3">
      {/* ช่องกรอก — เครื่องยิง USB ยิงลงตรงนี้ (ทำตัวเหมือนคีย์บอร์ด) */}
      <form
        onSubmit={(e) => { e.preventDefault(); emit(text); setText(""); }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={autoFocus}
          placeholder={placeholder}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 h-12 px-3 rounded-xl border border-slate-300 font-mono text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" disabled={!text.trim()}
          className="h-12 px-4 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-40">
          ค้นหา
        </button>
      </form>

      {/* กล้อง */}
      {cam === "off" ? (
        <button type="button" onClick={() => void startCam()}
          className="w-full h-12 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50">
          📷 เปิดกล้องสแกน
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video ref={videoRef} muted playsInline className="w-full max-h-[46vh] object-cover" />
          {/* กรอบเล็ง */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-2/3 aspect-square border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute top-2 right-2 flex gap-2">
            <button type="button" onClick={() => void toggleTorch()}
              className="h-9 px-3 rounded-lg bg-black/60 text-white text-sm backdrop-blur">
              {torchOn ? "🔦 ปิดไฟ" : "🔦 เปิดไฟ"}
            </button>
            <button type="button" onClick={stopCam}
              className="h-9 px-3 rounded-lg bg-black/60 text-white text-sm backdrop-blur">
              ปิดกล้อง
            </button>
          </div>
          {cam === "starting" && (
            <div className="absolute inset-0 grid place-items-center text-white text-sm">กำลังเปิดกล้อง...</div>
          )}
        </div>
      )}

      {camNote && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{camNote}</div>}
    </div>
  );
}

export default ScanInput;
