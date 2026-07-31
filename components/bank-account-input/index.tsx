"use client";

/**
 * BankAccountInput — ของกลาง "ช่องกรอกเลขบัญชี" แบบรู้ว่าครบยัง
 *
 * ทำไมต้องมี: ข้อมูลเดิมมีเลขบัญชีเสียหายจาก Excel (เก็บเป็น "4.56E+16") ใช้โอนเงินไม่ได้
 * และรูปแบบปนกันหมด (020-112-103-385 / 007-853-013-8 / 451-079-7842)
 *
 * ทำอะไร: เก็บแต่ตัวเลข · ใส่ขีดให้อ่านง่ายอัตโนมัติ · นับหลักเทียบกับจำนวนหลักของธนาคารนั้น
 *          (ธนาคารทั่วไป 10 หลัก · ออมสิน/ธ.ก.ส. 12 หลัก — ตั้งได้ที่ทะเบียนธนาคาร)
 *
 * ค่าที่ส่งออก (onChange) = เลขที่มีขีดคั่นแบบอ่านง่าย เพื่อให้ตรงกับข้อมูลเดิมในระบบ
 */
import { useMemo } from "react";

export const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** ใส่ขีดตามรูปแบบที่ใช้กันจริง: 10 หลัก = 3-3-3-1 · 12 หลัก = 3-3-4-2 · อื่น ๆ = ก้อนละ 3 */
export function formatAccountNo(raw: unknown, expected = 10): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  const groups = expected === 12 ? [3, 3, 4, 2] : expected === 10 ? [3, 3, 3, 1] : [];
  if (!groups.length) return d.replace(/(.{3})(?=.)/g, "$1-");
  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= d.length) break;
    parts.push(d.slice(i, i + g));
    i += g;
  }
  if (i < d.length) parts.push(d.slice(i));   // เกินจำนวนหลักที่คาด → ต่อท้ายไว้ให้เห็น
  return parts.join("-");
}

/** เลขที่ดูแล้วผิดปกติ เช่นค่าที่ Excel แปลงเป็นเลขวิทยาศาสตร์ (4.56E+16) */
export function looksCorrupted(raw: unknown): boolean {
  const t = String(raw ?? "").trim();
  return /e\+?\d/i.test(t) || /[^\d\s\-.]/.test(t.replace(/\s/g, ""));
}

export function BankAccountInput({
  value, onChange, expectedDigits = 10, disabled, placeholder = "กรอกเฉพาะตัวเลข",
}: {
  value: string;
  onChange: (formatted: string) => void;
  expectedDigits?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  const d = digitsOnly(value);
  const corrupted = looksCorrupted(value) && d.length !== expectedDigits;
  const status = useMemo(() => {
    if (!d) return { tone: "text-slate-400", text: `ต้องกรอก ${expectedDigits} หลัก` };
    if (d.length < expectedDigits) return { tone: "text-amber-600", text: `กรอกแล้ว ${d.length}/${expectedDigits} หลัก — ยังไม่ครบ` };
    if (d.length > expectedDigits) return { tone: "text-rose-600", text: `เกินมา ${d.length - expectedDigits} หลัก (ธนาคารนี้ใช้ ${expectedDigits} หลัก)` };
    return { tone: "text-emerald-600", text: `ครบ ${expectedDigits} หลัก ✓` };
  }, [d, expectedDigits]);

  return (
    <div>
      <input
        value={formatAccountNo(value, expectedDigits)}
        onChange={(e) => onChange(formatAccountNo(e.target.value, expectedDigits))}
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        className={`h-9 w-full rounded-lg border px-3 text-sm tabular-nums ${
          disabled ? "border-slate-200 bg-slate-50 text-slate-400"
          : d.length === expectedDigits ? "border-emerald-300 bg-white"
          : d.length ? "border-amber-300 bg-white" : "border-slate-300 bg-white"}`}
      />
      <p className={`mt-1 text-[11px] font-medium ${status.tone}`}>{status.text}</p>
      {corrupted && (
        <p className="mt-0.5 text-[11px] font-medium text-rose-600">
          ⚠️ เลขนี้ดูเสียหาย (น่าจะมาจาก Excel แปลงเป็นเลขวิทยาศาสตร์) — ต้องกรอกใหม่จากสมุดบัญชี
        </p>
      )}
    </div>
  );
}

export default BankAccountInput;
