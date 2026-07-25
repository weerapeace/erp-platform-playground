"use client";

/**
 * PurchaseCreditTermInput — ตัวเลือก "เครดิตการจ่าย" ต่อร้าน (ของกลาง)
 * ค่า = text เดียว (immediate | eom | days:N | months:N | monthday:N) → ใช้ในฟอร์มร้าน (Partner)
 * ปฏิทินจัดซื้อโหมดจ่ายเงินจะเอาไปคำนวณวันครบกำหนดจ่ายอัตโนมัติ (lib/credit-term)
 */
import { parseCreditTerm } from "@/lib/credit-term";

const TYPES: { key: string; label: string }[] = [
  { key: "",          label: "— ไม่กำหนด —" },
  { key: "immediate", label: "ต้องชำระเลย" },
  { key: "eom",       label: "สิ้นเดือน (ที่ซื้อ)" },
  { key: "days",      label: "กี่วัน (นับจากวันซื้อ)" },
  { key: "months",    label: "กี่เดือน (นับจากวันซื้อ)" },
  { key: "monthday",  label: "ทุกวันที่ (ของเดือน)" },
];
const DEFAULT_NUM: Record<string, number> = { days: 15, months: 1, monthday: 1 };

export function PurchaseCreditTermInput({ value, onChange, disabled }: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const t = parseCreditTerm(value);
  const type = t?.type ?? "";
  const num = t && "value" in t ? t.value : "";
  const needsNum = type === "days" || type === "months" || type === "monthday";

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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={type} onChange={(e) => setType(e.target.value)} disabled={disabled}
        className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
        {TYPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {needsNum && (
        <span className="inline-flex items-center gap-1">
          <input type="number" min={1} max={type === "monthday" ? 31 : undefined} value={num} disabled={disabled}
            onChange={(e) => setNum(e.target.value)}
            className="h-9 w-20 px-2 text-sm text-right border border-slate-200 rounded-lg disabled:bg-slate-50" />
          <span className="text-xs text-slate-500">{type === "days" ? "วัน" : type === "months" ? "เดือน" : "(1–31)"}</span>
        </span>
      )}
    </div>
  );
}
