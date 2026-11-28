"use client";

/**
 * useVoiceInput — กดค้างแล้วพูด → ได้ข้อความ (ใช้ร่วม: ปุ่มไมค์มุมจอ + "ลองพูดทดสอบ" ในหน้าตั้งค่าผู้ช่วยเสียง)
 *
 * ตัวฟัง: OpenAI (/api/voice-assistant/transcribe · แม่น) → ถ้าปิด/เกินงบ/เบราว์เซอร์อัดเสียงไม่ได้ ใช้ตัวฟังฟรีของเบราว์เซอร์ → ไม่มีเลย = พิมพ์
 *   const v = useVoiceInput({ listenAvailable, onText: setDraft, onInterim: setDraft });
 *   <button onPointerDown={v.start} onPointerUp={v.stop}>…</button>
 */
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

export type ListenMode = "openai" | "browser" | "none";
export type VoiceInputPhase = "idle" | "recording" | "transcribing";

// ตัวฟังฟรีของเบราว์เซอร์ (Chrome/Edge/Safari) — ชนิดขั้นต่ำที่ใช้
type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };
const browserSpeech = (): (new () => SpeechRec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const canRecord = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) ?? "";

export function useVoiceInput({ listenAvailable, onText, onInterim, disabled }: {
  /** ศูนย์ AI เปิดตัวฟังของ OpenAI ให้คนนี้ไหม (GET /api/voice-assistant/command → listen) */
  listenAvailable: boolean;
  /** ได้ข้อความสุดท้ายแล้ว */
  onText: (text: string) => void;
  /** ข้อความระหว่างพูด (ตัวฟังของเบราว์เซอร์) */
  onInterim?: (text: string) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const [listenMode, setListenMode] = useState<ListenMode>("none");
  const recRef = useRef<MediaRecorder | null>(null);
  const srRef = useRef<SpeechRec | null>(null);
  const pressing = useRef(false);
  const startedAt = useRef(0);
  const cb = useRef({ onText, onInterim });
  cb.current = { onText, onInterim };

  useEffect(() => {
    setListenMode(listenAvailable && canRecord() ? "openai" : browserSpeech() ? "browser" : "none");
  }, [listenAvailable]);

  const upload = async (blob: Blob, seconds: number) => {
    setPhase("transcribing");
    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice");
      fd.append("seconds", String(Math.round(seconds * 10) / 10));
      const res = await apiFetch("/api/voice-assistant/transcribe", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string; fallback?: boolean };
      if (!res.ok) {
        if (j.fallback) { setListenMode(browserSpeech() ? "browser" : "none"); toast.info(`${j.error ?? "ตัวฟังหลักใช้ไม่ได้"} — เปลี่ยนไปใช้ตัวฟังของเบราว์เซอร์`); }
        else toast.error(j.error || "ฟังเสียงไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      const text = (j.text ?? "").trim();
      if (!text) { toast.info("ไม่ได้ยินคำพูด ลองพูดใกล้ไมค์อีกครั้ง"); return; }
      cb.current.onText(text);
    } catch {
      toast.error("ส่งเสียงไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setPhase((p) => (p === "transcribing" ? "idle" : p));
    }
  };

  const stop = () => {
    pressing.current = false;
    if (recRef.current && recRef.current.state === "recording") { recRef.current.stop(); recRef.current = null; return; }
    if (srRef.current) srRef.current.stop();
  };

  const start = async () => {
    if (phase !== "idle" || disabled) return;
    pressing.current = true;
    window.speechSynthesis?.cancel();
    if (listenMode === "openai") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickMime();
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks: Blob[] = [];
        mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        mr.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const secs = (Date.now() - startedAt.current) / 1000;
          if (secs < 0.5 || !chunks.length) { setPhase("idle"); toast.info("กดค้างไว้ระหว่างพูด แล้วค่อยปล่อย"); return; }
          void upload(new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" }), secs);
        };
        recRef.current = mr;
        startedAt.current = Date.now();
        mr.start();
        setPhase("recording");
        if (!pressing.current) stop();   // ปล่อยนิ้วก่อนไมค์พร้อม
      } catch {
        pressing.current = false;
        setPhase("idle");
        toast.error("เปิดไมค์ไม่ได้ — อนุญาตให้เว็บนี้ใช้ไมโครโฟนก่อน (ไอคอนแม่กุญแจข้างชื่อเว็บ)");
      }
      return;
    }
    const SR = browserSpeech();
    if (listenMode === "browser" && SR) {
      const sr = new SR();
      sr.lang = "th-TH"; sr.interimResults = true; sr.continuous = true;
      let last = "";
      sr.onresult = (e) => { last = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(""); cb.current.onInterim?.(last); };
      sr.onerror = (e) => { if (e.error === "not-allowed") toast.error("เปิดไมค์ไม่ได้ — อนุญาตให้เว็บนี้ใช้ไมโครโฟนก่อน"); };
      sr.onend = () => { srRef.current = null; setPhase("idle"); if (last.trim()) cb.current.onText(last.trim()); };
      srRef.current = sr;
      try { sr.start(); setPhase("recording"); } catch { setPhase("idle"); }
      return;
    }
    pressing.current = false;
  };

  /** props ปุ่มกดค้าง (เมาส์/นิ้ว) */
  const holdProps = {
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); void start(); },
    onPointerUp: stop,
    onPointerLeave: () => { if (phase === "recording") stop(); },
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { phase, listenMode, start, stop, holdProps };
}
