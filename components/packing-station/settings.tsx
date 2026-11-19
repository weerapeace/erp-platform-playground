"use client";

import { SoundSettings } from "./sound-settings";
import type { usePackSoundBank } from "./sound-bank";

/**
 * ⚙️ ตั้งค่าสถานีแพ็ค — จำในเครื่องนี้ (แต่ละโต๊ะตั้งต่างกันได้: ชื่อโต๊ะ / กล้อง / เปิดเสียง + ความดังรวม)
 *    ชุดเสียง (ไฟล์ + ความดังต่อเสียง) ใช้ร่วมทุกโต๊ะ — SoundSettings / sound-bank
 */
/** ที่จำค่าในเครื่อง (localStorage) */
const MP = "erp.packing.station.v1";

export type StationSettingsValue = {
  station: string;        // ชื่อโต๊ะ เช่น "โต๊ะ 1"
  deviceId: string;       // กล้องที่ใช้ ("" = อัตโนมัติ)
  record: boolean;        // อัดคลิป
  sound: boolean;         // เสียงตอบรับ
  soundVolume: number;    // ความดังรวมของเครื่องนี้ 0–1 (ชุดเสียงตั้งกลาง)
  camScan: boolean;       // อ่านบาร์โค้ดจากกล้อง (มือถือ)
  keepDays: number;       // เก็บคลิปในเครื่องกี่วัน
};

export const DEFAULT_SETTINGS: StationSettingsValue = { station: "", deviceId: "", record: true, sound: true, soundVolume: 1, camScan: false, keepDays: 14 };

export function loadSettings(): StationSettingsValue {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(MP) : null;
    if (!raw) return DEFAULT_SETTINGS;
    const v = JSON.parse(raw) as Partial<StationSettingsValue>;
    return {
      station: typeof v.station === "string" ? v.station.slice(0, 40) : "",
      deviceId: typeof v.deviceId === "string" ? v.deviceId : "",
      record: v.record !== false, sound: v.sound !== false, camScan: v.camScan === true,
      soundVolume: Number.isFinite(Number(v.soundVolume)) ? Math.min(1, Math.max(0, Number(v.soundVolume))) : 1,
      keepDays: [7, 14, 30, 60].includes(Number(v.keepDays)) ? Number(v.keepDays) : 14,
    };
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(v: StationSettingsValue) {
  try { localStorage.setItem(MP, JSON.stringify(v)); } catch { /* โหมดส่วนตัว — ไม่เป็นไร */ }
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
      <span><span className="block text-sm font-medium text-slate-800">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}

export function StationSettings({ value, onChange, devices, canDetect, mime, soundBank }: { value: StationSettingsValue; onChange: (v: StationSettingsValue) => void; devices: MediaDeviceInfo[]; canDetect: boolean; mime: string; soundBank: ReturnType<typeof usePackSoundBank> }) {
  const set = (patch: Partial<StationSettingsValue>) => onChange({ ...value, ...patch });
  return (
    <div className="grid max-w-3xl gap-3">
      <p className="text-sm text-slate-500">ค่าในหน้านี้จำในเครื่องนี้ — แต่ละโต๊ะตั้งต่างกันได้ (ยกเว้นชุดเสียง ใช้ร่วมทุกโต๊ะ)</p>
      <label className="grid gap-1 rounded-lg border border-slate-200 bg-white p-3">
        <span className="text-sm font-medium text-slate-800">ชื่อโต๊ะ / สถานี</span>
        <input value={value.station} onChange={(e) => set({ station: e.target.value.slice(0, 40) })} placeholder="เช่น โต๊ะ 1" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <span className="text-xs text-slate-500">ฝังในคลิป + ใช้ดูว่าโต๊ะไหนแพ็ค</span>
      </label>
      <label className="grid gap-1 rounded-lg border border-slate-200 bg-white p-3">
        <span className="text-sm font-medium text-slate-800">กล้อง</span>
        <select value={value.deviceId} onChange={(e) => set({ deviceId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">อัตโนมัติ (มือถือ = กล้องหลัง)</option>
          {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `กล้อง ${i + 1}`}</option>)}
        </select>
        <span className="text-xs text-slate-500">ชนิดไฟล์ที่เครื่องนี้อัดได้: {mime ? mime.split(";")[0] : "อัดวิดีโอไม่ได้ (ลอง Chrome รุ่นใหม่)"}</span>
      </label>
      <Toggle label="อัดคลิปตอนแพ็ค" hint="ไม่เกิน 60 วิ ต่อออเดอร์ · ตัวหนังสือ (เลขออเดอร์/คนแพ็ค/เวลา) ฝังในคลิป" checked={value.record} onChange={(v) => set({ record: v })} />
      <SoundSettings bank={soundBank} enabled={value.sound} volume={value.soundVolume} onEnabled={(v) => set({ sound: v })} onVolume={(v) => set({ soundVolume: v })} />
      <Toggle label="อ่านบาร์โค้ดจากกล้อง (มือถือ)" hint={canDetect ? "ใช้กล้องตัวที่อัดคลิปอ่านใบปะหน้า/สินค้า — เหมาะกับมือถือที่ไม่มีเครื่องยิง" : "เครื่องนี้อ่านบาร์โค้ดจากกล้องไม่ได้ (iPhone) — ใช้เครื่องยิงหรือพิมพ์"} checked={value.camScan && canDetect} onChange={(v) => set({ camScan: v })} />
      <label className="grid gap-1 rounded-lg border border-slate-200 bg-white p-3">
        <span className="text-sm font-medium text-slate-800">เก็บคลิปในเครื่องนี้</span>
        <select value={value.keepDays} onChange={(e) => set({ keepDays: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} วัน</option>)}
        </select>
        <span className="text-xs text-slate-500">ช่วงทดลอง: เกินกำหนดลบเองตอนเปิดหน้านี้ · คลิปที่มีเคลมให้กด "ดาวน์โหลด" เก็บไว้ · เชื่อม NAS แล้วจะเก็บ 90 วัน + ปุ่มเก็บถาวร</span>
      </label>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">วิธีจบออเดอร์ให้เร็ว</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>ยิงใบปะหน้าใบถัดไป = จบใบเดิมอัตโนมัติ</li>
          <li>การ์ดบาร์โค้ดคำสั่ง (ปุ่ม "พิมพ์การ์ดคำสั่ง" ด้านบน) — แพ็คเสร็จ / มีปัญหา / อัดใหม่ / ข้าม / การ์ดกล่อง</li>
          <li>แป้นเหยียบ USB: ตั้งให้ส่งปุ่ม <b>F9</b> หรือ <b>Space</b></li>
          <li>ปุ่มเขียวใหญ่ หรือกด Spacebar</li>
        </ul>
      </div>
    </div>
  );
}
