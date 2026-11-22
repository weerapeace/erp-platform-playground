"use client";

/**
 * เลือกช่วงเวลาแบบรายงาน (ของกลาง) — ปุ่มลัด วันนี้ / เมื่อวาน / 7 วัน / เดือนนี้ + เลือกเดือน + เลือกปี + ช่วงวันที่เอง
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-22 (แดชบอร์ดช่องทางขาย): "ตรงเลือกวันที่ อยากให้เลือกเป็นรายเดือน, รายปี, ระยะวันได้"
 * ค้นทะเบียนแล้ว: มีแค่ DateRangeInput (เลือกช่วงวัน) + lib/date-range rangePresets — ไม่มีตัวเลือกเดือน/ปี
 *   → ตัวนี้ "ประกอบ" ของเดิม (ช่วงวันที่ใช้ DateRangeInput ตัวเดิม) ไม่ได้เขียนปฏิทินใหม่
 * ค่า = { from, to } รูป "YYYY-MM-DD" (รวมทั้งสองวัน · วันตามเครื่องผู้ใช้ = เวลาไทย)
 *   เลือกเดือน = วันที่ 1 ถึงสิ้นเดือน · เลือกปี = 1 ม.ค. ถึง 31 ธ.ค. (หน้าที่ใช้ตัดวันในอนาคตเองถ้าต้องการ)
 * ใช้เมื่อ: หน้ารายงาน/แดชบอร์ดที่ต้องดูยอดเป็นวัน/เดือน/ปี · ห้ามใช้: ช่องกรอกวันที่ในฟอร์มเอกสาร (ใช้ DateInput)
 * ใช้ที่: app/master/platform-dashboard (ใช้ ≥ 3 ที่ → ลงทะเบียน lib/shared-parts-registry)
 */
import { DateRangeInput } from "@/components/date-input/range";
import { TH_MONTHS } from "@/lib/date-range";

export type Period = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();   // m = 1-12

/** ปุ่มลัด (คิดจากวันนี้ของเครื่องผู้ใช้) */
export function periodPresets(now = new Date()): { key: string; label: string; range: Period }[] {
  const today = ymd(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const w = new Date(now); w.setDate(w.getDate() - 6);
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  return [
    { key: "today", label: "วันนี้", range: { from: today, to: today } },
    { key: "yesterday", label: "เมื่อวาน", range: { from: ymd(y), to: ymd(y) } },
    { key: "7d", label: "7 วัน", range: { from: ymd(w), to: today } },
    { key: "month", label: "เดือนนี้", range: { from: monthStart, to: today } },
  ];
}
export const todayPeriod = (): Period => periodPresets()[0].range;

/** เดือนย้อนหลัง (ล่าสุดก่อน) สำหรับตัวเลือกเดือน */
function monthOptions(now: Date, count = 24): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}` });
  }
  return out;
}

export function PeriodPicker({ value, onChange, className = "", minYear = 2024 }: {
  value: Period;
  onChange: (p: Period) => void;
  className?: string;
  /** ปีแรกในตัวเลือกปี (ค.ศ.) */
  minYear?: number;
}) {
  const now = new Date();
  const presets = periodPresets(now);
  const active = presets.find((p) => p.range.from === value.from && p.range.to === value.to)?.key ?? null;
  // เลือกทั้งเดือน / ทั้งปีอยู่ไหม (ไว้โชว์ค่าในตัวเลือก)
  const fy = Number(value.from.slice(0, 4)), fm = Number(value.from.slice(5, 7));
  const isWholeMonth = !!value.from && value.from.slice(0, 7) === value.to.slice(0, 7) && value.from.endsWith("-01") && Number(value.to.slice(8, 10)) === lastDay(fy, fm);
  const isWholeYear = !!value.from && value.from === `${fy}-01-01` && value.to === `${fy}-12-31`;
  const years: number[] = [];
  for (let yy = now.getFullYear(); yy >= minYear; yy--) years.push(yy);
  const btn = (on: boolean) => `h-8 px-3 text-xs border-r border-slate-200 last:border-r-0 transition-colors ${on ? "bg-violet-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`;
  const sel = (on: boolean) => `h-8 rounded-lg border px-2 text-xs ${on ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="ช่วงเวลาลัด">
        {presets.map((p) => (
          <button key={p.key} type="button" onClick={() => onChange(p.range)} aria-pressed={active === p.key} className={btn(active === p.key)}>{p.label}</button>
        ))}
      </div>
      <select aria-label="เลือกเดือน" value={isWholeMonth ? value.from.slice(0, 7) : ""} className={sel(isWholeMonth && active !== "month")}
        onChange={(e) => { const v = e.target.value; if (!v) return; const [yy, mm] = v.split("-").map(Number); onChange({ from: `${v}-01`, to: `${v}-${pad(lastDay(yy, mm))}` }); }}>
        <option value="">เลือกเดือน</option>
        {monthOptions(now).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select aria-label="เลือกปี" value={isWholeYear ? String(fy) : ""} className={sel(isWholeYear)}
        onChange={(e) => { const yy = e.target.value; if (!yy) return; onChange({ from: `${yy}-01-01`, to: `${yy}-12-31` }); }}>
        <option value="">เลือกปี</option>
        {years.map((yy) => <option key={yy} value={yy}>{yy + 543}</option>)}
      </select>
      <DateRangeInput value={value} onChange={(r) => { if (r.from && r.to) onChange({ from: r.from, to: r.to }); }} placeholder="ช่วงวันที่" allowClear={false} className="w-full sm:w-auto" />
    </div>
  );
}
