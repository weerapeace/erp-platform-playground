"use client";
/**
 * 🧵 ไฟล์ปัก — จานสีด้าย (รอบ 5 ข้อ 3): ด้าย Brother 64 สี (ชุดเดียวกับที่เขียนลงไฟล์ .PES) + เลือกสีเอง
 *   onPick(hex, ชื่อด้าย | null) — ชื่อด้ายใช้ใส่ "รหัสด้าย" ให้ร้านหยิบถูก (เลือกสีเอง = null)
 */
import { PEC_THREADS } from "@/lib/embroidery-pes";

const hex = (t: { r: number; g: number; b: number }) => `#${[t.r, t.g, t.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
export const BROTHER = PEC_THREADS.map((t, i) => (t ? { code: i, name: t.name, hex: hex(t), label: `Brother ${i} ${t.name}` } : null)).filter((x): x is NonNullable<typeof x> => !!x);
export const brotherLabel = (h: string) => BROTHER.find((b) => b.hex === h.toLowerCase())?.label ?? null;

export function ThreadPalette({ value, onPick, disabled }: { value: string; onPick: (hex: string, label: string | null) => void; disabled?: boolean }) {
  const cur = BROTHER.find((b) => b.hex === value.toLowerCase());
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5">
        {BROTHER.map((b) => (
          <button key={b.code} type="button" disabled={disabled} title={b.label} aria-label={b.label} onClick={() => onPick(b.hex, b.label)}
            className={`aspect-square rounded-sm border ${b.hex === value.toLowerCase() ? "ring-2 ring-indigo-500 ring-offset-1" : "border-black/10"}`} style={{ background: b.hex }} />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="h-4 w-4 rounded border border-black/10" style={{ background: value }} />
        <span className="min-w-0 flex-1 truncate">{cur ? cur.label : `สีเอง ${value}`}</span>
        <label className="inline-flex cursor-pointer items-center gap-1 underline">
          เลือกสีเอง
          <input type="color" disabled={disabled} value={value} onChange={(e) => onPick(e.target.value, null)} className="h-0 w-0 opacity-0" />
        </label>
      </div>
    </div>
  );
}
