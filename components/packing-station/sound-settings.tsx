"use client";

/**
 * 🔊 ตั้งค่าเสียงตอบรับ (เจ้าของเลือก 2026-11-19: แบบตามตัวอย่าง + ข้อเสนอ 1,2,3,4,6)
 *   ชุดเสียงใช้ร่วมทุกโต๊ะ (หัวหน้า packing.manage แก้ได้) · เปิด/ปิด + ความดังรวม = ตั้งต่อเครื่อง
 *   ต่อเสียง: ▶ ฟัง · อัปโหลด/อัปทับ · อัดจากไมค์ · ความดัง 0–150% · คืนค่าเดิม · ย้อนเสียงก่อนหน้า
 *   ทุกครั้งที่เปลี่ยน → แจ้งผลมีปุ่ม "ย้อนกลับ" 10 วิ · ลงประวัติ (packing.sound_update)
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { PACK_SOUND_INFO, SOUND_MAX_SEC, SOUND_UPLOAD_MAX_BYTES, type PackSound } from "@/lib/packing-sound";
import { playPackSound } from "./sounds";
import { toPackSoundWav, type SoundMeta, type usePackSoundBank } from "./sound-bank";

type Bank = ReturnType<typeof usePackSoundBank>;
const REC_MAX_MS = (SOUND_MAX_SEC + 1) * 1000;   // อัดได้ 3 วิ แล้วตัดเงียบหัวเหลือ 2 วิ
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SoundSettings({ bank, enabled, volume, onEnabled, onVolume }: { bank: Bank; enabled: boolean; volume: number; onEnabled: (v: boolean) => void; onVolume: (v: number) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">เสียงตอบรับ</p>
          <p className="text-xs text-slate-500">ชุดเสียงใช้ร่วมทุกโต๊ะ{bank.canManage ? ` · อัปไฟล์ mp3 / wav / ogg หรืออัดจากไมค์ — ตัดเหลือ ${SOUND_MAX_SEC} วิให้เอง` : " · หัวหน้าเป็นคนเปลี่ยนเสียง"}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} className="h-4 w-4" /> เปิดเสียงที่เครื่องนี้</label>
      </div>
      <label className="mt-3 flex items-center gap-3 text-sm text-slate-600">
        <Icon name="volume" /> <span className="shrink-0">ความดังรวม (เครื่องนี้)</span>
        <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} onChange={(e) => onVolume(Number(e.target.value) / 100)} onPointerUp={() => playPackSound("ok")} className="min-w-0 flex-1" />
        <span className="w-10 text-right tabular-nums">{pct(volume)}</span>
      </label>
      {bank.error && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{bank.error}</p>}
      <ul className="mt-2 divide-y divide-slate-100">
        {bank.sounds.map((m) => <SoundRow key={m.key} m={m} bank={bank} />)}
      </ul>
      <p className="mt-2 text-xs text-slate-400">แก้ได้ทุกเมื่อ (อัปทับ) · คืนค่าเดิม = กลับไปใช้เสียงของระบบ · เปลี่ยนแล้วมีปุ่มย้อนกลับ และ "ย้อนเสียงก่อนหน้า" ได้ภายหลัง</p>
    </div>
  );
}

function SoundRow({ m, bank }: { m: SoundMeta; bank: Bank }) {
  const toast = useToast();
  const info = PACK_SOUND_INFO[m.key];
  const [vol, setVol] = useState(m.volume);
  const [busy, setBusy] = useState(false);
  const [recMs, setRecMs] = useState<number | null>(null);
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; t: number; timer: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setVol(m.volume); }, [m.volume]);
  useEffect(() => () => { const r = recRef.current; if (r) { window.clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); } }, []);

  const undoable = (msg: string) => toast.action(msg, "ย้อนกลับ", () => {
    void bank.save(m.key, { restore_prev: true }).then((err) => (err ? toast.error(err) : toast.success(`ย้อนเสียง "${info.label}" แล้ว`)));
  }, { ms: 10_000 });

  const putAudio = async (blob: Blob, name: string) => {
    setBusy(true);
    try {
      const { dataUrl, durationMs } = await toPackSoundWav(blob);
      const err = await bank.save(m.key, { audio: dataUrl, audio_name: name.slice(0, 120), duration_ms: durationMs });
      if (err) { toast.error(err); return; }
      playPackSound(m.key);
      undoable(`ตั้งเสียง "${info.label}" แล้ว (${(durationMs / 1000).toFixed(1)} วิ)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "แปลงไฟล์เสียงไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > SOUND_UPLOAD_MAX_BYTES) { toast.error("ไฟล์ใหญ่เกิน 5 MB — เลือกเสียงสั้น ๆ"); return; }
    void putAudio(f, f.name);
  };

  const stopRec = () => {
    const r = recRef.current;
    if (r && r.mr.state !== "inactive") r.mr.stop();
  };
  const startRec = async () => {
    if (recRef.current) { stopRec(); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast.error("เปิดไมค์ไม่ได้ — กดอนุญาตไมค์ในเบราว์เซอร์ หรือเสียบไมค์ก่อน"); return; }
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const r = recRef.current; recRef.current = null; setRecMs(null);
      if (r) window.clearInterval(r.timer);
      stream.getTracks().forEach((t) => t.stop());
      if (chunks.length) void putAudio(new Blob(chunks, { type: mr.mimeType }), `อัดจากไมค์ ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false })}`);
    };
    const t = Date.now();
    const timer = window.setInterval(() => {
      const ms = Date.now() - t; setRecMs(ms);
      if (ms >= REC_MAX_MS) stopRec();
    }, 100);
    recRef.current = { mr, stream, t, timer };
    setRecMs(0); mr.start();
  };

  const saveVol = async () => {
    if (vol === m.volume) return;
    const before = m.volume;
    const err = await bank.save(m.key, { volume: vol });
    if (err) { toast.error(err); setVol(before); return; }
    toast.action(`ความดัง "${info.label}" ${pct(vol)}`, "ย้อนกลับ", () => { void bank.save(m.key, { volume: before }); }, { ms: 10_000 });
  };

  const reset = async () => {
    setBusy(true);
    const err = await bank.save(m.key, { audio: null });
    setBusy(false);
    if (err) { toast.error(err); return; }
    playPackSound(m.key);
    undoable(`"${info.label}" กลับไปใช้เสียงเดิมแล้ว`);
  };

  const restorePrev = async () => {
    setBusy(true);
    const err = await bank.save(m.key, { restore_prev: true });
    setBusy(false);
    if (err) { toast.error(err); return; }
    playPackSound(m.key);
    undoable(`ย้อนเสียง "${info.label}" เป็นแบบก่อนหน้าแล้ว`);
  };

  const btn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:border-slate-400 disabled:opacity-50";
  return (
    <li className="grid gap-2 py-2.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{info.label}</p>
        <p className="truncate text-xs text-slate-500">{info.when}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-xs ${m.has_audio ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-600"}`}>
          <Icon name={m.has_audio ? "music" : "volume"} /> <span className="truncate">{m.has_audio ? m.audio_name ?? "ไฟล์เสียง" : `เสียงเดิม · ${info.base}`}</span>
        </span>
        {bank.canManage ? (
          <label className="flex min-w-[9rem] flex-1 items-center gap-1.5 text-xs text-slate-500">
            <input type="range" min={0} max={150} step={5} value={Math.round(vol * 100)} onChange={(e) => setVol(Number(e.target.value) / 100)}
              onPointerUp={() => { playPackSound(m.key, { volume: vol }); void saveVol(); }} onKeyUp={() => void saveVol()} className="min-w-0 flex-1" aria-label={`ความดัง ${info.label}`} />
            <span className="w-9 text-right tabular-nums">{pct(vol)}</span>
          </label>
        ) : <span className="text-xs text-slate-400">ดัง {pct(m.volume)}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => playPackSound(m.key)} className={btn} aria-label={`ฟังเสียง ${info.label}`}><Icon name="play" /> ฟัง</button>
        {bank.canManage && (
          <>
            <button type="button" disabled={busy || recMs !== null} onClick={() => fileRef.current?.click()} className={btn}><Icon name="upload" /> {m.has_audio ? "อัปทับ" : "อัปโหลด"}</button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" disabled={busy} onClick={() => void startRec()} className={`${btn} ${recMs !== null ? "border-red-300 bg-red-50 text-red-700" : ""}`}>
              <Icon name="mic" /> {recMs !== null ? `หยุด (${(recMs / 1000).toFixed(1)} วิ)` : "อัดเสียง"}
            </button>
            {m.has_audio && <button type="button" disabled={busy} onClick={() => void reset()} className={btn}><Icon name="refresh" /> คืนค่าเดิม</button>}
            {m.has_prev && <button type="button" disabled={busy} onClick={() => void restorePrev()} className={btn} title={`ก่อนหน้า: ${m.prev_audio_name ?? "ไฟล์เสียง"}`}><Icon name="back" /> ย้อนเสียงก่อนหน้า</button>}
          </>
        )}
      </div>
    </li>
  );
}
