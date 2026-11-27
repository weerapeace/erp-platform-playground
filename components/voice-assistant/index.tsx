"use client";

/**
 * ผู้ช่วยเสียง (ของกลาง) — ปุ่มไมค์มุมจอขวาล่างทุกหน้า · กดค้างแล้วพูด → ข้อความ (แก้ได้ก่อนส่ง) → ผู้ช่วยเปิดหน้า / เปิดตัวเพิ่ม SKU ให้
 * คู่มือ docs/voice-assistant.md · กติกา lib/voice-assistant · API /api/voice-assistant/{transcribe,command}
 *
 * - โชว์เฉพาะคนที่ศูนย์ AI ให้ใช้ได้ (GET /api/voice-assistant/command → enabled) · ปิดในศูนย์ = ปุ่มหาย
 * - ตัวฟัง: OpenAI (แม่น) → ถ้าปิด/เกินงบ/เบราว์เซอร์อัดเสียงไม่ได้ ใช้ตัวฟังฟรีของเบราว์เซอร์ → ไม่มีเลย = พิมพ์
 * - พูดตอบด้วยเสียงไทยของเบราว์เซอร์ (ฟรี) · ปิดเสียงได้ (จำในเครื่อง)
 * - ไม่บันทึกอะไรเอง: เพิ่ม SKU = เปิดตัวเพิ่ม SKU ของเดิม (SkuWizard) พร้อมค่า ผู้ใช้กดบันทึกเอง · บันทึกแล้วมีปุ่ม "ย้อนกลับ" (ปิดใช้ SKU นั้น)
 * PC = แผงลอยขวาล่าง · มือถือ = แผ่นเลื่อนขึ้นจากล่างเต็มกว้าง
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useAuthOptional } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { matchChoiceLocally, VOICE_LIMITS, type VoiceChoice, type VoiceReply, type VoiceSkuDraft, type VoiceTurn } from "@/lib/voice-assistant";
import type { SkuWizardResult } from "@/app/master/skus/sku-wizard";

// ตัวเพิ่ม SKU หนัก → โหลดเมื่อใช้จริงเท่านั้น (ไม่ถ่วงทุกหน้า)
const SkuWizard = dynamic(() => import("@/app/master/skus/sku-wizard").then((m) => m.SkuWizard), { ssr: false });

type Status = { enabled: boolean; listen: boolean };
type Msg = { id: number; role: "user" | "assistant"; text: string };
type Phase = "idle" | "recording" | "transcribing" | "thinking";
type ListenMode = "openai" | "browser" | "none";

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

const MUTE_KEY = "voice-assistant-muted";
const EXAMPLES = ["เปิดหน้าใบสั่งซื้อ", "เพิ่ม SKU ใหม่ กระเป๋าผ้าสีดำ"];
let statusCache: Status | null = null;   // ต่อแท็บ — ไม่ถามซ้ำทุกหน้า

export function VoiceAssistant() {
  const auth = useAuthOptional();
  const userId = auth?.user?.id ?? null;
  const [status, setStatus] = useState<Status | null>(statusCache);
  useEffect(() => {
    if (!userId || statusCache) return;
    let alive = true;
    apiFetch("/api/voice-assistant/command").then((r) => (r.ok ? r.json() : null)).then((j) => {
      const s: Status = { enabled: !!j?.enabled, listen: !!j?.listen };
      statusCache = s;
      if (alive) setStatus(s);
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  if (!userId || !status?.enabled) return null;
  return <VoiceAssistantPanel listenAvailable={status.listen} />;
}

function VoiceAssistantPanel({ listenAvailable }: { listenAvailable: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [choices, setChoices] = useState<VoiceChoice[]>([]);
  const [wizard, setWizard] = useState<{ prefill: Record<string, unknown>; tagId: string | null } | null>(null);
  const [muted, setMuted] = useState(false);
  const [listenMode, setListenMode] = useState<ListenMode>("none");
  const pendingSku = useRef<VoiceSkuDraft>({});
  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const srRef = useRef<SpeechRec | null>(null);
  const pressing = useRef(false);
  const startedAt = useRef(0);

  useEffect(() => {
    try { setMuted(localStorage.getItem(MUTE_KEY) === "1"); } catch { /* ไม่มีที่เก็บ = เปิดเสียง */ }
    setListenMode(listenAvailable && canRecord() ? "openai" : browserSpeech() ? "browser" : "none");
  }, [listenAvailable]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, choices]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const push = (role: Msg["role"], text: string) => setMsgs((m) => [...m, { id: ++idRef.current, role, text }].slice(-40));
  const speak = useCallback((text: string) => {
    if (muted || typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "th-TH";
      const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith("th"));
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch { /* เบราว์เซอร์พูดไม่ได้ = ข้าม */ }
  }, [muted]);
  const say = (text: string) => { push("assistant", text); speak(text); };
  const toggleMute = () => {
    setMuted((m) => { const n = !m; try { localStorage.setItem(MUTE_KEY, n ? "1" : "0"); } catch { /* ignore */ } if (n) window.speechSynthesis?.cancel(); return n; });
  };

  // ── เปิดตัวเพิ่ม SKU (ของเดิม) พร้อมค่าที่ฟังได้ ──
  const openWizard = (tagId: string | null) => {
    setChoices([]);
    // ช่องในฟอร์มเก็บเป็นข้อความ → แปลงตัวเลขเป็นข้อความก่อนเติม
    const prefill: Record<string, unknown> = Object.fromEntries(Object.entries(pendingSku.current).map(([k, v]) => [k, typeof v === "number" ? String(v) : v]));
    setWizard({ prefill, tagId });
  };
  const onCreated = (r?: SkuWizardResult) => {
    setWizard(null);
    const skus = r?.skus ?? [];
    if (!skus.length) return;
    const codes = skus.map((s) => s.code).join(", ");
    say(`เพิ่ม SKU ${codes} แล้วครับ`);
    toast.action(`เพิ่ม SKU ${codes} แล้ว`, "ย้อนกลับ", async () => {
      // ย้อนกลับ = ปิดใช้ (เก็บไว้ ไม่ลบถาวร) ผ่าน API กลาง master-v2 (สิทธิ์ + ประวัติ)
      const res = await Promise.all(skus.map((s) => apiFetch(`/api/master-v2/skus-v2/${encodeURIComponent(s.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: false }),
      }).then((x) => x.ok).catch(() => false)));
      if (res.every(Boolean)) toast.success(`ปิดใช้ ${codes} แล้ว (เปิดกลับได้ที่หน้า SKU)`);
      else toast.error("ย้อนกลับไม่สำเร็จบางรายการ — ไปปิดใช้ที่หน้า SKU แทน");
    }, { ms: 15000 });
  };

  // ── ส่งคำสั่ง ──
  const send = async (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, VOICE_LIMITS.textChars);
    if (!text || phase === "thinking") return;
    setDraft("");
    push("user", text);
    // มีตัวเลือกค้าง → จับคู่ในเครื่องก่อน (ไม่เสียค่า AI)
    if (choices.length) {
      const hit = matchChoiceLocally(text, choices);
      if (hit === "skip") { say("เปิดฟอร์มให้ เลือกประเภทในฟอร์มได้เลยครับ"); openWizard(null); return; }
      if (hit) { say(`เลือก ${hit.label} แล้ว เปิดฟอร์มให้ตรวจก่อนบันทึกครับ`); openWizard(hit.id); return; }
    }
    setPhase("thinking");
    try {
      const history: VoiceTurn[] = msgs.slice(-VOICE_LIMITS.historyTurns).map((m) => ({ role: m.role, text: m.text }));
      const res = await apiFetch("/api/voice-assistant/command", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, history, choices, path: pathname }),
      });
      const j = (await res.json().catch(() => ({}))) as VoiceReply & { error?: string };
      if (!res.ok) { push("assistant", j.error || "ผู้ช่วยตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง"); return; }
      say(j.say);
      if (j.action === "open_page" && j.page) { setChoices([]); router.push(j.page.href); }
      else if (j.action === "add_sku") await offerCategories(j.sku ?? {});
      else if (j.action === "choose" && j.choiceId) openWizard(j.choiceId);
    } catch {
      push("assistant", "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setPhase("idle");
    }
  };

  // ตัวเลือกประเภทจากข้อมูลจริง (ตัวเดาแท็กกลาง — ไม่ใช้ AI) · ไม่มีคำแนะนำ = เปิดฟอร์มเลย
  const offerCategories = async (sku: VoiceSkuDraft) => {
    pendingSku.current = sku;
    try {
      const qs = new URLSearchParams({ name: sku.name_th ?? "", code: sku.code ?? "" });
      const j = await apiFetch(`/api/product-tags/suggest/new?${qs}`).then((r) => r.json());
      const list = ((j.data ?? []) as { tagId: string; name: string }[]).slice(0, 5).map((s) => ({ id: s.tagId, label: s.name }));
      if (list.length) { setChoices(list); return; }
    } catch { /* เดาไม่ได้ = เปิดฟอร์มให้เลือกเอง */ }
    openWizard(null);
  };

  // ── อัดเสียง (กดค้าง) ──
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
      setDraft(text);
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      toast.error("ส่งเสียงไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setPhase((p) => (p === "transcribing" ? "idle" : p));
    }
  };

  const startRec = async () => {
    if (phase !== "idle") return;
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
        if (!pressing.current) stopRec();   // ปล่อยนิ้วก่อนไมค์พร้อม
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
      sr.onresult = (e) => { setDraft(Array.from(e.results).map((r) => r[0]?.transcript ?? "").join("")); };
      sr.onerror = (e) => { if (e.error === "not-allowed") toast.error("เปิดไมค์ไม่ได้ — อนุญาตให้เว็บนี้ใช้ไมโครโฟนก่อน"); };
      sr.onend = () => { srRef.current = null; setPhase("idle"); setTimeout(() => inputRef.current?.focus(), 0); };
      srRef.current = sr;
      try { sr.start(); setPhase("recording"); } catch { setPhase("idle"); }
      return;
    }
    pressing.current = false;
    inputRef.current?.focus();
  };
  const stopRec = () => {
    pressing.current = false;
    if (recRef.current && recRef.current.state === "recording") { recRef.current.stop(); recRef.current = null; return; }
    if (srRef.current) srRef.current.stop();
  };

  const busy = phase === "transcribing" || phase === "thinking";
  const micLabel = phase === "recording" ? "กำลังฟัง… ปล่อยเพื่อหยุด" : phase === "transcribing" ? "กำลังแปลงเสียง…" : phase === "thinking" ? "กำลังคิด…"
    : listenMode === "none" ? "เบราว์เซอร์นี้ฟังเสียงไม่ได้ — พิมพ์แทน" : "กดค้างแล้วพูด";

  return (
    <>
      {!open && !wizard && (
        <button type="button" onClick={() => setOpen(true)} title="ผู้ช่วยเสียง" aria-label="เปิดผู้ช่วยเสียง"
          className="fixed bottom-4 right-4 z-[55] h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center print:hidden">
          <Icon name="microphone" size={22} />
        </button>
      )}

      {open && !wizard && (
        <div role="dialog" aria-label="ผู้ช่วยเสียง"
          className="fixed z-[56] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[360px] max-h-[75vh] sm:max-h-[70vh] flex flex-col bg-white border border-slate-200 shadow-2xl rounded-t-2xl sm:rounded-2xl print:hidden">
          <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
            <Icon name="sparkles" size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-slate-800 flex-1">ผู้ช่วยเสียง</span>
            <button type="button" onClick={toggleMute} title={muted ? "เปิดเสียงตอบ" : "ปิดเสียงตอบ"} aria-label={muted ? "เปิดเสียงตอบ" : "ปิดเสียงตอบ"}
              className={`h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 ${muted ? "text-slate-300" : "text-slate-600"}`}>
              <Icon name="volume" size={16} />
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 min-h-[140px] overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {msgs.length === 0 && (
              <div className="text-[13px] text-slate-500 leading-relaxed">
                ตอนนี้ช่วยได้ 2 อย่าง: <b className="font-medium text-slate-700">เปิดหน้า</b> และ <b className="font-medium text-slate-700">เพิ่ม SKU ใหม่</b> — ลองพูดหรือกดตัวอย่าง
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {EXAMPLES.map((x) => (
                    <button key={x} type="button" onClick={() => setDraft(x)} className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">{x}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "self-end bg-slate-100 text-slate-800" : "self-start bg-white border border-slate-200 text-slate-800"}`}>{m.text}</div>
            ))}
            {phase === "thinking" && <div className="self-start text-xs text-slate-400 px-1">กำลังคิด…</div>}
            {choices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {choices.map((c) => (
                  <button key={c.id} type="button" onClick={() => { push("user", c.label); say(`เลือก ${c.label} แล้ว เปิดฟอร์มให้ตรวจก่อนบันทึกครับ`); openWizard(c.id); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100">{c.label}</button>
                ))}
                <button type="button" onClick={() => { push("user", "เลือกเองในฟอร์ม"); openWizard(null); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">เลือกเองในฟอร์ม</button>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-3 pt-2.5 pb-3 flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <textarea ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={VOICE_LIMITS.textChars}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }}
                placeholder={phase === "recording" ? "กำลังฟัง…" : "คำที่ฟังได้จะขึ้นตรงนี้ แก้ได้ก่อนส่ง"}
                className="flex-1 resize-none max-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <button type="button" onClick={() => void send(draft)} disabled={!draft.trim() || busy} aria-label="ส่งคำสั่ง"
                className="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1">
                <Icon name="send" size={15} /> ส่ง
              </button>
            </div>
            <button type="button" disabled={busy || listenMode === "none"}
              onPointerDown={(e) => { e.preventDefault(); void startRec(); }} onPointerUp={stopRec} onPointerLeave={() => { if (phase === "recording") stopRec(); }} onPointerCancel={stopRec}
              onContextMenu={(e) => e.preventDefault()}
              className={`select-none touch-none h-11 rounded-xl text-sm flex items-center justify-center gap-2 border transition-colors disabled:opacity-60 ${phase === "recording" ? "bg-red-50 border-red-300 text-red-700" : "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"}`}>
              <Icon name="microphone" size={18} /> {micLabel}
            </button>
            {listenMode === "browser" && <div className="text-[11px] text-slate-400 text-center">ใช้ตัวฟังฟรีของเบราว์เซอร์อยู่ (แม่นน้อยกว่า)</div>}
          </div>
        </div>
      )}

      {wizard && (
        <SkuWizard open onClose={() => { setWizard(null); setOpen(true); }} onCreated={(r) => { onCreated(r); setOpen(true); }}
          prefill={wizard.prefill} initialTagId={wizard.tagId} />
      )}
    </>
  );
}
