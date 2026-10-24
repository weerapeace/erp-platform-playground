"use client";

/**
 * ช่องตัวเลขที่พิมพ์ลื่น (พิมพ์ "0." / ลบจนว่าง ได้ไม่เด้ง) — เก็บข้อความที่พิมพ์เองระหว่างโฟกัส
 * ส่งค่าออกเป็น number | null (ว่าง/อ่านไม่ได้ = null) · ค่าจากข้างนอกเปลี่ยน (เช่น สลับหน่วย) = อัปเดตตามตอนไม่ได้พิมพ์อยู่
 */
import { useEffect, useRef, useState } from "react";

export function NumInput({ value, onChange, integer = false, className = "", placeholder, disabled }: {
  value: string;
  onChange: (v: number | null) => void;
  integer?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(value); }}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        setText(raw);
        const n = raw.trim() === "" ? null : Number(raw);
        onChange(n == null || !Number.isFinite(n) ? null : integer ? Math.floor(n) : n);
      }}
    />
  );
}
