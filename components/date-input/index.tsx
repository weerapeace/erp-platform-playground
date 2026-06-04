"use client";

import { useState, useEffect, useRef } from "react";
import { formatDate } from "@/lib/date";

// ============================================================
// DateInput กลาง — ช่องกรอกวันที่ที่ "โชว์ DD/MM/YYYY เสมอ"
// ไม่ขึ้นกับภาษาของเบราว์เซอร์/Windows (ต่างจาก <input type="date"> เดิม)
// value/onChange ใช้รูปแบบ ISO "YYYY-MM-DD" (เหมือนเดิม เก็บลง DB ได้ตรง)
// มีปุ่มปฏิทิน 📅 เปิดตัวเลือกวันที่ของระบบให้กดง่าย
// ============================================================

/** parse "DD/MM/YYYY" → ISO "YYYY-MM-DD" (คืน null ถ้าไม่ถูกรูปแบบ) */
function parseDMY(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const iso = `${m[3]}-${mm}-${dd}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // กันเคส 31/02 → JS เลื่อนเดือน: ตรวจย้อนกลับ
  if (d.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export function DateInput({
  value, onChange, disabled, placeholder, className,
}: {
  value: string | null | undefined;          // ISO "YYYY-MM-DD" หรือ ""
  onChange: (iso: string) => void;            // ส่งกลับเป็น ISO
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => formatDate(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // sync เมื่อ value ภายนอกเปลี่ยน (เช่น โหลดข้อมูลเดิม / reset form)
  useEffect(() => { setText(formatDate(value)); }, [value]);

  const commit = (s: string) => {
    setText(s);
    if (s.trim() === "") { onChange(""); return; }
    const iso = parseDMY(s);
    if (iso) onChange(iso);
  };

  const openNativePicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    // showPicker() เปิดปฏิทินของระบบ (Chrome/Edge/Firefox ใหม่)
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={text}
        placeholder={placeholder ?? "วว/ดด/ปปปป"}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setText(formatDate(value))}  // normalize กลับเป็นรูปแบบมาตรฐาน
        className="w-full h-9 px-3 pr-9 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openNativePicker}
        tabIndex={-1}
        aria-label="เปิดปฏิทิน"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-slate-400 hover:text-blue-600 disabled:opacity-40"
      >
        📅
      </button>
      {/* native date input (ซ่อน) — ใช้เป็นตัวเปิดปฏิทินระบบ + รับค่า ISO ตรง ๆ */}
      <input
        ref={nativeRef}
        type="date"
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="absolute right-1 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
      />
    </div>
  );
}
