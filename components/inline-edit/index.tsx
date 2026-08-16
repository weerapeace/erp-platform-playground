"use client";

/**
 * InlineEdit — ของกลาง "ใส่ค่าแล้วให้อ่านง่าย กดถึงค่อยแก้"
 *
 * ปัญหาที่แก้: หน้าจอที่มีช่องกรอกเรียงกันเยอะ ๆ ดูรก และเผลอพิมพ์ทับของเดิมได้ง่าย
 * ตัวนี้จะโชว์ค่าเป็นข้อความสะอาด ๆ (มีปุ่ม ✏️ เล็ก ๆ) กดแล้วถึงกลายเป็นช่องกรอก
 *   - Enter หรือคลิกที่อื่น = บันทึก (เรียก onSave เฉพาะตอนค่าเปลี่ยนจริง)
 *   - Esc = ยกเลิก กลับไปค่าเดิม
 *   - ยังไม่มีค่า = ขึ้นปุ่มจาง ๆ ให้กดใส่ (ไม่กินที่)
 *
 * ใช้:
 *   <InlineEdit type="date"   value={due}  onSave={(v) => saveDue(v)} />
 *   <InlineEdit type="number" value={qty}  onSave={(v) => saveQty(Number(v))} suffix="ชิ้น" />
 *   <InlineEdit type="text"   value={note} onSave={setNote} placeholder="หมายเหตุ" />
 *
 * หมายเหตุ: onSave จะได้ string เสมอ (ค่าว่าง = "") · ฝั่งเรียกเป็นคนตัดสินใจว่าจะบันทึกยังไง/เด้ง toast อะไร
 */
import { useEffect, useRef, useState } from "react";

export type InlineEditProps = {
  value: string | number | null | undefined;
  onSave: (value: string) => void | Promise<void>;
  type?: "text" | "number" | "date";
  disabled?: boolean;
  placeholder?: string;      // ข้อความตอนยังไม่มีค่า (ค่าเริ่มต้น "— ใส่ค่า —")
  suffix?: string;           // หน่วยต่อท้าย เช่น "ชิ้น"
  width?: string;            // ความกว้างช่องตอนแก้ (เช่น "6rem")
  align?: "left" | "right";
  className?: string;        // คลาสของข้อความตอนอ่านอย่างเดียว
};

const thDate = (v: string) => {
  const d = new Date(`${v.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

export function InlineEdit({
  value, onSave, type = "text", disabled = false,
  placeholder = "— ใส่ค่า —", suffix, width, align = "left", className = "",
}: InlineEditProps) {
  const raw = value == null ? "" : String(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(raw);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(raw); }, [raw, editing]);
  useEffect(() => { if (editing) { ref.current?.focus(); if (type !== "date") ref.current?.select(); } }, [editing, type]);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim();
    if (next === raw.trim()) return;   // ไม่เปลี่ยน = ไม่ต้องยิงบันทึก
    await onSave(next);
  };

  if (editing) {
    return (
      <input
        ref={ref} type={type} value={draft} disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void commit(); }
          if (e.key === "Escape") { setDraft(raw); setEditing(false); }
        }}
        style={width ? { width } : undefined}
        className={`h-7 px-1.5 text-sm border border-blue-400 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${align === "right" ? "text-right" : ""} ${width ? "" : "w-full"}`}
      />
    );
  }

  const has = raw !== "";
  const shown = !has ? placeholder
    : type === "date" ? thDate(raw)
    : type === "number" ? Number(raw).toLocaleString("th-TH")
    : raw;

  return (
    <button
      type="button" disabled={disabled}
      onClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : "กดเพื่อแก้"}
      className={`group inline-flex items-center gap-1 h-7 px-1.5 rounded-lg max-w-full ${disabled ? "cursor-default" : "hover:bg-slate-100"} ${align === "right" ? "justify-end" : ""}`}>
      <span className={`truncate ${has ? `text-sm ${className || "text-slate-700"}` : "text-[12px] text-slate-400 italic"} ${type === "number" ? "tabular-nums" : ""}`}>{shown}</span>
      {has && suffix && <span className="text-[11px] text-slate-400 shrink-0">{suffix}</span>}
      {!disabled && <span className="text-[10px] text-slate-300 group-hover:text-blue-500 shrink-0">✏️</span>}
    </button>
  );
}
