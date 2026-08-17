"use client";

/**
 * MoneyInput — ช่องกรอก "จำนวนเงิน" กลาง (ของกลาง ERP)
 * --------------------------------------------------------------------------
 * ปัญหาเดิม: ช่องเงินใช้ <input type="number"> → เบราว์เซอร์ไม่ใส่ลูกน้ำให้
 *            เลข 5124990 อ่านยากมากว่าเป็น 5 ล้านหรือ 51 ล้าน
 *
 * ตัวนี้: โชว์ลูกน้ำคั่นหลักพันตั้งแต่ตอนพิมพ์ (5,124,990) แต่ค่าที่ส่งกลับ
 *        ให้ระบบยังเป็นตัวเลขดิบเสมอ ("5124990") — บันทึกลงฐานข้อมูลได้ตรง ๆ
 *
 * กฎ CLAUDE.md: ห้ามทำช่องเงินเองทุกหน้า — หยิบตัวนี้ไปใช้
 *   ฟอร์มกลาง (MasterCRUD) ใช้ตัวนี้อัตโนมัติแล้วกับฟิลด์ชนิด currency ทุกโมดูล
 *
 * วิธีใช้:
 *   <MoneyInput value={amount} onChange={(raw) => setAmount(raw)} className="..." />
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** ตัดให้เหลือเฉพาะรูปแบบตัวเลขที่บันทึกได้: เครื่องหมายลบนำหน้า + ตัวเลข + จุดทศนิยมตัวเดียว */
export function sanitizeNumeric(raw: string): string {
  let s = String(raw ?? "").replace(/[^0-9.\-]/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  // ตัดศูนย์นำหน้า (05 → 5) แต่คง "0" และ "0.xx" ไว้
  s = s.replace(/^0+(?=\d)/, "");
  return (neg ? "-" : "") + s;
}

/** ใส่ลูกน้ำคั่นหลักพัน — คงส่วนทศนิยมที่ผู้ใช้กำลังพิมพ์ไว้เหมือนเดิม (ไม่ปัดเศษ ไม่เติม .00) */
export function groupThousands(raw: string): string {
  const s = sanitizeNumeric(raw);
  if (s === "" || s === "-") return s;
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf(".");
  const intPart = dot >= 0 ? body.slice(0, dot) : body;
  const decPart = dot >= 0 ? body.slice(dot) : "";        // รวมจุดไว้ด้วย (คง "12." ระหว่างพิมพ์)
  return (neg ? "-" : "") + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + decPart;
}

export type MoneyInputProps = {
  /** ค่าที่เก็บจริง (ตัวเลขดิบ หรือ string ของตัวเลข) */
  value: string | number | null | undefined;
  /** คืนค่าดิบ (ไม่มีลูกน้ำ) — เอาไปเก็บลง state/ฐานข้อมูลได้เลย */
  onChange: (raw: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  title?: string;
  autoFocus?: boolean;
  /** ออกจากช่อง — ส่งค่าดิบล่าสุดมาให้ด้วย (ใช้บันทึกทันทีได้เลย ไม่ต้องรอ state) */
  onBlur?: (raw: string) => void;
  /** ดักปุ่มเอง (เช่น Enter = บันทึก, Escape = ยกเลิก) — เรียกก่อน logic ภายใน */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export function MoneyInput({
  value, onChange, disabled, placeholder, className = "", style, id, title, autoFocus, onBlur, onKeyDown,
}: MoneyInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  /** ค่าดิบที่เราส่งออกไปล่าสุด — ใช้แยก "เสียงสะท้อนของการพิมพ์เอง" ออกจาก "ค่าที่ตั้งมาจากข้างนอก" */
  const lastEmitRef = useRef<string>(value == null ? "" : String(value));
  const [text, setText] = useState(() => groupThousands(value == null ? "" : String(value)));

  // ค่าจากภายนอกเปลี่ยน (โหลดข้อมูล / สลับ record / รีเซ็ตฟอร์ม / วางข้อมูลลงตาราง) → sync เข้าช่อง
  //
  // ⚠️ ห้ามใช้ "กำลังโฟกัสอยู่ = ไม่รับค่า" เป็นเงื่อนไข — เคยทำแล้วเจอบั๊ก:
  //    วางข้อมูลจาก Excel ลงคอลัมน์ ช่องที่เคอร์เซอร์อยู่ (แถวบนสุด) จะไม่ขึ้นค่า
  //    ทั้งที่ข้อมูลเข้าแล้ว เพราะช่องนั้นโฟกัสอยู่พอดี
  // ใช้วิธี "จำค่าที่เราส่งออกไปล่าสุด" แทน: ค่าที่กลับมาตรงกับที่เราส่ง = เสียงสะท้อนของการพิมพ์เอง
  // (ข้าม ไม่งั้นเคอร์เซอร์กระโดด) · ต่างจากนั้น = มีคนอื่นตั้งค่ามาจากข้างนอก → รับเสมอ
  useEffect(() => {
    const incoming = value == null ? "" : String(value);
    if (sanitizeNumeric(incoming) === sanitizeNumeric(lastEmitRef.current)) return;   // ค่าที่เราเพิ่งพิมพ์เอง
    if (sanitizeNumeric(text) === sanitizeNumeric(incoming)) return;                  // ตรงกับที่แสดงอยู่แล้ว
    lastEmitRef.current = incoming;
    setText(groupThousands(incoming));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // คืนตำแหน่งเคอร์เซอร์หลังใส่ลูกน้ำใหม่ (ไม่งั้นเคอร์เซอร์เด้งไปท้ายช่องทุกครั้งที่พิมพ์)
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && caretRef.current != null && document.activeElement === el) {
      const p = Math.min(caretRef.current, el.value.length);
      el.setSelectionRange(p, p);
    }
    caretRef.current = null;
  }, [text]);

  /** รับข้อความที่ผู้ใช้จะเห็น + ตำแหน่งเคอร์เซอร์ → จัดลูกน้ำใหม่ + ย้ายเคอร์เซอร์ให้ตรงหลักเดิม */
  const apply = (nextDisplay: string, caretInDisplay: number) => {
    const meaningful = nextDisplay.slice(0, caretInDisplay).replace(/,/g, "").length;
    const raw = sanitizeNumeric(nextDisplay);
    const shown = groupThousands(raw);
    let c = 0, seen = 0;
    while (c < shown.length && seen < meaningful) { if (shown[c] !== ",") seen++; c++; }
    caretRef.current = c;
    lastEmitRef.current = raw;
    setText(shown);
    onChange(raw);
  };

  // กด Backspace ตรงหน้าลูกน้ำ → ให้ลบ "ตัวเลข" ก่อนหน้าลูกน้ำ (ไม่ใช่ลบลูกน้ำเปล่า ๆ แล้วไม่มีอะไรเกิดขึ้น)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    const el = ref.current;
    if (!el || e.defaultPrevented || e.key !== "Backspace") return;
    const p = el.selectionStart ?? 0;
    if (el.selectionStart !== el.selectionEnd || p < 2 || el.value[p - 1] !== ",") return;
    e.preventDefault();
    apply(el.value.slice(0, p - 2) + el.value.slice(p), p - 2);
  };

  return (
    <input
      ref={ref}
      id={id}
      title={title}
      autoFocus={autoFocus}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      style={style}
      className={className}
      onChange={(e) => apply(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        // ออกจากช่อง → เก็บกวาดค่าที่พิมพ์ค้าง เช่น "1234." → "1234"
        const raw = sanitizeNumeric(text).replace(/\.$/, "");
        lastEmitRef.current = raw;
        if (raw !== sanitizeNumeric(text)) onChange(raw);
        setText(groupThousands(raw));
        onBlur?.(raw);
      }}
    />
  );
}
