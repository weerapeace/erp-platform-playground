"use client";

/**
 * 🔊 ชุดเสียงกลางของสถานีแพ็ค (ใช้ร่วมทุกโต๊ะ) — โหลดจาก /api/packing/sounds แล้วตั้งให้ตัวเล่นเสียง (sounds.ts)
 *   ตัวไฟล์เก็บแคชในเครื่อง (localStorage ตาม updated_at) → เปิดหน้าครั้งต่อไปไม่ต้องโหลดไฟล์ซ้ำ
 *   แปลงไฟล์ที่อัป/อัดจากไมค์: ถอดเสียง → โมโน 22.05kHz → ตัดเงียบหัว + เหลือ ≤2 วิ → WAV data URL
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { encodeWav, trimSamples, isPackSound, PACK_SOUND_KEYS, SOUND_MAX_SEC, SOUND_RATE, type PackSound } from "@/lib/packing-sound";
import { decodeSound, getAudioCtx, setPackSoundEntry } from "./sounds";

export type SoundMeta = {
  key: PackSound; volume: number; audio_name: string | null; duration_ms: number | null; has_audio: boolean;
  has_prev: boolean; prev_audio_name: string | null; updated_at: string | null; updated_by_name: string | null;
};
const CACHE = "erp.packing.sound.";
const blank = (key: PackSound): SoundMeta => ({ key, volume: 1, audio_name: null, duration_ms: null, has_audio: false, has_prev: false, prev_audio_name: null, updated_at: null, updated_by_name: null });

async function audioFor(m: SoundMeta): Promise<string | null> {
  if (!m.has_audio) return null;
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE + m.key) ?? "null") as { at: string; audio: string } | null;
    if (hit && hit.at === m.updated_at) return hit.audio;
  } catch { /* ไม่มีแคช */ }
  const r = await apiFetch(`/api/packing/sounds?key=${m.key}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.audio) return null;
  try { localStorage.setItem(CACHE + m.key, JSON.stringify({ at: j.updated_at, audio: j.audio })); } catch { /* เต็ม/โหมดส่วนตัว — โหลดใหม่ครั้งหน้า */ }
  return j.audio as string;
}

/** โหลดชุดเสียงกลาง + ตั้งให้ตัวเล่น · ใช้ทั้งหน้าสถานี (เล่น) และหน้าตั้งค่า (แก้) */
export function usePackSoundBank() {
  const [sounds, setSounds] = useState<SoundMeta[]>(() => PACK_SOUND_KEYS.map(blank));
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await apiFetch("/api/packing/sounds");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "โหลดชุดเสียงไม่สำเร็จ — ใช้เสียงเดิมไปก่อน"); return; }
      const rows = new Map<string, SoundMeta>(((j.sounds ?? []) as SoundMeta[]).filter((s) => isPackSound(s.key)).map((s) => [s.key, s]));
      const list = PACK_SOUND_KEYS.map((k) => rows.get(k) ?? blank(k));
      setSounds(list); setCanManage(!!j.can_manage); setError(null);
      await Promise.all(list.map(async (m) => {
        const audio = await audioFor(m).catch(() => null);
        setPackSoundEntry(m.key, { buffer: audio ? await decodeSound(audio) : null, volume: m.volume });
      }));
    } catch { setError("เน็ตหลุด — ใช้เสียงเดิมไปก่อน"); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  /** บันทึก 1 เสียง (หัวหน้า) → โหลดชุดใหม่ */
  const save = useCallback(async (key: PackSound, patch: { volume?: number; audio?: string | null; audio_name?: string; duration_ms?: number; restore_prev?: boolean }): Promise<string | null> => {
    const r = await apiFetch("/api/packing/sounds", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...patch }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error || "บันทึกไม่สำเร็จ";
    await reload();
    return null;
  }, [reload]);

  /** ไฟล์เสียงปัจจุบันของเสียงนั้น (ใช้เก็บไว้ก่อนเปลี่ยน → ปุ่มย้อนกลับ) */
  const currentAudio = useCallback(async (key: PackSound): Promise<string | null> => {
    const m = sounds.find((s) => s.key === key);
    return m ? audioFor(m).catch(() => null) : null;
  }, [sounds]);

  return { sounds, canManage, error, loaded, reload, save, currentAudio };
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** ไฟล์เสียงใด ๆ ที่เบราว์เซอร์เล่นได้ → WAV โมโน ≤2 วิ (ตัดเงียบหัว) · ถอดไม่ได้ = throw ข้อความภาษาคน */
export async function toPackSoundWav(blob: Blob): Promise<{ dataUrl: string; durationMs: number }> {
  const c = getAudioCtx();
  if (!c) throw new Error("เครื่องนี้เล่นเสียงไม่ได้");
  let decoded: AudioBuffer;
  try { decoded = await c.decodeAudioData(await blob.arrayBuffer()); }
  catch { throw new Error("เปิดไฟล์เสียงนี้ไม่ได้ — ลองไฟล์ mp3 หรือ wav"); }
  // ตัดเผื่อก่อนแปลง (ไฟล์ยาวมากจะได้ไม่หนัก) แล้วค่อยตัดละเอียดหลังข้ามเงียบหัว
  const len = Math.min(decoded.length, Math.round(decoded.sampleRate * (SOUND_MAX_SEC + 3)));
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(len * SOUND_RATE / decoded.sampleRate)), SOUND_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const trimmed = trimSamples(mono, SOUND_RATE, SOUND_MAX_SEC);
  if (!trimmed.length) throw new Error("ไฟล์นี้ไม่มีเสียง");
  return { dataUrl: `data:audio/wav;base64,${toBase64(encodeWav(trimmed, SOUND_RATE))}`, durationMs: Math.round(trimmed.length / SOUND_RATE * 1000) };
}
