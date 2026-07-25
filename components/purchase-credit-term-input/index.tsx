"use client";

/**
 * PurchaseCreditTermInput — ตัวเลือก "เครดิตการจ่าย" ต่อร้าน (ของกลาง)
 * ค่า = text เดียว (immediate | eom | days:N | months:N | monthday:N) → ใช้ในฟอร์มร้าน (Partner)
 * ปฏิทินจัดซื้อโหมดจ่ายเงินจะเอาไปคำนวณวันครบกำหนดจ่ายอัตโนมัติ (lib/credit-term)
 */
import { parseCreditTerm, computeDueDate } from "@/lib/credit-term";

const thDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

const TYPES: { key: string; label: string }[] = [
  { key: "",          label: "— ไม่กำหนด —" },
  { key: "immediate", label: "ต้องชำระเลย" },
  { key: "eom",       label: "สิ้นเดือน (ที่ซื้อ)" },
  { key: "days",      label: "กี่วัน (นับจากวันซื้อ)" },
  { key: "months",    label: "กี่เดือน (นับจากวันซื้อ)" },
  { key: "monthday",      label: "ทุกวันที่ — เดือนที่ซื้อ (เลยวันแล้วไปเดือนถัดไป)" },
  { key: "monthday_next", label: "ทุกวันที่ — เดือนถัดไปเสมอ" },
];
const DEFAULT_NUM: Record<string, number> = { days: 15, months: 1, monthday: 1, monthday_next: 1 };

export function PurchaseCreditTermInput({ value, onChange, disabled }: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const t = parseCreditTerm(value);
  const type = t?.type ?? "";
  const num = t && "value" in t ? t.value : "";
  const isMonthday = type === "monthday" || type === "monthday_next";
  const needsNum = type === "days" || type === "months" || isMonthday;

  const setType = (nt: string) => {
    if (nt === "" ) return onChange(null);
    if (nt === "immediate" || nt === "eom") return onChange(nt);
    onChange(`${nt}:${(typeof num === "number" ? num : 0) || DEFAULT_NUM[nt]}`);
  };
  const setNum = (raw: string) => {
    if (!needsNum) return;
    const v = Math.round(Number(raw));
    onChange(`${type}:${isFinite(v) && v > 0 ? v : ""}`);
  };

  // ตัวอย่างสด: ถ้าซื้อวันนี้ จะต้องจ่ายวันไหน (ให้เห็นภาพก่อนบันทึก)
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const due = value ? computeDueDate(todayIso, value) : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={type} onChange={(e) => setType(e.target.value)} disabled={disabled}
        className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
        {TYPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {needsNum && (
        <span className="inline-flex items-center gap-1">
          <input type="number" min={1} max={isMonthday ? 31 : undefined} value={num} disabled={disabled}
            onChange={(e) => setNum(e.target.value)}
            className="h-9 w-20 px-2 text-sm text-right border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <span className="text-xs text-slate-500">{type === "days" ? "วัน" : type === "months" ? "เดือน" : "(1–31)"}</span>
        </span>
      )}
      {due && (
        <span className="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 whitespace-nowrap">
          เช่น ซื้อวันนี้ ({thDate(todayIso)}) → จ่าย <b className="text-slate-700">{thDate(due)}</b>
        </span>
      )}
    </div>
  );
}
