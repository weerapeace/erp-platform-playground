import { describe, it, expect } from "vitest";
import {
  PACK_SOUND_KEYS, PACK_SOUND_INFO, isPackSound, clampVolume, isValidSoundData, findSoundStart, trimSamples, encodeWav, packAlertSound,
} from "@/lib/packing-sound";

describe("packing-sound", () => {
  it("ทุกเสียงมีชื่อ/คำอธิบาย และตรงกับรายการใน DB check", () => {
    expect(PACK_SOUND_KEYS).toEqual(["ok", "done", "error", "warn", "dup", "cancelled", "over"]);
    for (const k of PACK_SOUND_KEYS) expect(PACK_SOUND_INFO[k].label).toBeTruthy();
    expect(isPackSound("dup")).toBe(true);
    expect(isPackSound("boom")).toBe(false);
  });

  it("ความดังอยู่ในช่วง 0–150%", () => {
    expect(clampVolume(2)).toBe(1.5);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume("abc")).toBe(1);
    expect(clampVolume(0.333)).toBe(0.33);
  });

  it("รับเฉพาะ WAV data URL ขนาดพอดี", () => {
    expect(isValidSoundData("data:audio/wav;base64,UklGRg==")).toBe(true);
    expect(isValidSoundData("data:audio/mpeg;base64,AAAA")).toBe(false);
    expect(isValidSoundData("data:audio/wav;base64,<script>")).toBe(false);
    expect(isValidSoundData("data:audio/wav;base64," + "A".repeat(400_001))).toBe(false);
  });

  it("ข้ามความเงียบหัวไฟล์ แล้วตัดไม่เกิน 2 วิ", () => {
    const rate = 1000;
    const s = new Float32Array(5000);              // เงียบ 0.5 วิ แล้วมีเสียง 4.5 วิ
    for (let i = 500; i < 5000; i++) s[i] = 0.5;
    expect(findSoundStart(s, rate)).toBe(490);     // ถอยกลับ 10ms
    const t = trimSamples(s, rate, 2);
    expect(t.length).toBe(2000);
    expect(t[t.length - 1]).toBeLessThan(0.05);    // fade-out ท้าย
    expect(t[100]).toBe(0.5);
  });

  it("ไฟล์เงียบทั้งไฟล์ = ไม่ตัดหัว · ไฟล์สั้น = ไม่ fade", () => {
    const rate = 1000;
    expect(findSoundStart(new Float32Array(100), rate)).toBe(0);
    const short = new Float32Array(300).fill(0.4);
    expect(trimSamples(short, rate, 2)[299]).toBe(Math.fround(0.4));
  });

  it("WAV หัวไฟล์ถูกต้อง", () => {
    const w = encodeWav(new Float32Array([0, 1, -1]), 22050);
    expect(w.length).toBe(44 + 6);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...w.slice(8, 12))).toBe("WAVE");
    const v = new DataView(w.buffer);
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });

  it("เสียงตอนเปิดออเดอร์: ยกเลิก / ซ้ำ / ปกติ", () => {
    const o = { status: "new", platform_status: "PROCESSED", packed_at: null };
    expect(packAlertSound(o, false, true)).toBe("cancelled");
    expect(packAlertSound({ ...o, packed_at: "2026-11-19T10:00:00Z" }, false, false)).toBe("dup");
    expect(packAlertSound({ ...o, status: "shipped" }, false, false)).toBe("dup");
    expect(packAlertSound(o, true, false)).toBe("dup");
    expect(packAlertSound(o, false, false)).toBeNull();
  });
});
