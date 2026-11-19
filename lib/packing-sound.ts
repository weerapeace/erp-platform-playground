/**
 * 🔊 กติกาเสียงสถานีแพ็ค (ไม่มี UI · ทดสอบได้) — เจ้าของสั่ง 2026-11-19 "ตั้งค่าเสียงได้ อัปโหลดได้"
 *   ชุดเสียงใช้ร่วมทุกโต๊ะ (ตาราง packing_sounds · API /api/packing/sounds) · ความดังรวมตั้งต่อเครื่อง
 *   ไฟล์ที่อัป/อัดจากไมค์ → ตัดความเงียบหัว + ตัดเหลือ ≤2 วิ + โมโน 22.05kHz → WAV (เล่นได้ทุกเบราว์เซอร์ เล็ก ≈ ≤90KB)
 */
export const PACK_SOUND_KEYS = ["ok", "done", "error", "warn", "dup", "cancelled", "over"] as const;
export type PackSound = (typeof PACK_SOUND_KEYS)[number];

export const PACK_SOUND_INFO: Record<PackSound, { label: string; when: string; base: string }> = {
  ok:        { label: "ยิงถูก",               when: "ยิงสินค้าตรงออเดอร์ / เปิดออเดอร์",          base: "ติ๊ดสั้น" },
  done:      { label: "ครบ / แพ็คเสร็จ",       when: "ของครบ หรือจบออเดอร์",                     base: "ติ๊ด-ติ๊ด ขึ้น" },
  error:     { label: "ผิด",                  when: "สินค้าไม่อยู่ในออเดอร์ / ไม่พบออเดอร์",      base: "บี๊บยาวต่ำ" },
  warn:      { label: "เตือน / มีปัญหา",       when: "ยังเช็กไม่ครบ / กดมีปัญหา / กล้องไม่พร้อม",  base: "ตึ๊ด ๆ สองที" },
  dup:       { label: "ออเดอร์ซ้ำ",            when: "แพ็คไปแล้ว / ส่งไปแล้ว / มีคนกำลังแพ็ค",    base: "ติ๊ด 3 ทีเร็ว" },
  cancelled: { label: "ยกเลิก / ห้ามแพ็ค",     when: "ออเดอร์ถูกยกเลิก / ลูกค้ายังไม่จ่าย",        base: "ตู๊ด-ตู้ด ลงต่ำ" },
  over:      { label: "สินค้าเกิน",            when: "ยิงเกินจำนวนที่สั่ง",                       base: "ติ๊ดสูง-ต่ำ สลับ" },
};

export const isPackSound = (k: unknown): k is PackSound => typeof k === "string" && (PACK_SOUND_KEYS as readonly string[]).includes(k);

/** ความยาวสูงสุดหลังตัด (ข้อเสนอ 4) · ความดังต่อเสียง 0–150% */
export const SOUND_MAX_SEC = 2;
export const SOUND_RATE = 22050;
export const SOUND_VOLUME_MAX = 1.5;
/** ขนาด data URL สูงสุดที่ API รับ (2 วิ WAV 16-bit 22.05kHz ≈ 88KB → base64 ≈ 118KB · เผื่อไว้) */
export const SOUND_DATA_MAX = 400_000;
/** ไฟล์ต้นฉบับที่ยอมให้เลือก (ก่อนตัด) */
export const SOUND_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const clampVolume = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(SOUND_VOLUME_MAX, Math.max(0, Math.round(n * 100) / 100));
};

/** data URL เสียง WAV ที่ API รับ (กันยัดไฟล์อื่น/ใหญ่เกิน) */
export function isValidSoundData(s: unknown): s is string {
  return typeof s === "string" && s.length <= SOUND_DATA_MAX && /^data:audio\/wav;base64,[A-Za-z0-9+/]+=*$/.test(s);
}

/** ตำแหน่งเริ่มมีเสียงจริง (ข้ามความเงียบหัวไฟล์ · ถอยกลับ 10ms กันหัวเสียงขาด) */
export function findSoundStart(samples: Float32Array, rate: number, threshold = 0.02): number {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) return Math.max(0, i - Math.round(rate * 0.01));
  }
  return 0;
}

/** ตัด: ข้ามเงียบหัว แล้วเอาไม่เกิน maxSec · ใส่ fade-out 20ms กันเสียงแตกตอนตัด */
export function trimSamples(samples: Float32Array, rate: number, maxSec = SOUND_MAX_SEC): Float32Array {
  const start = findSoundStart(samples, rate);
  const end = Math.min(samples.length, start + Math.round(rate * maxSec));
  const out = samples.slice(start, end);
  const fade = Math.min(out.length, Math.round(rate * 0.02));
  if (end < samples.length) for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** Float32 โมโน → WAV PCM 16-bit */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** เสียงที่ควรดังตอนเปิดออเดอร์ไม่ได้/ต้องถาม (ข้อเสนอ 6) · null = ใช้เสียงตามระดับ (error/warn) */
export function packAlertSound(o: { status: string | null; platform_status: string | null; packed_at: string | null }, lockedByOther: boolean, blocked: boolean): PackSound | null {
  if (blocked) return "cancelled";                       // ยกเลิก / ยังไม่จ่าย = ห้ามแพ็ค
  if (o.packed_at || o.status === "shipped" || lockedByOther) return "dup";
  return null;
}
