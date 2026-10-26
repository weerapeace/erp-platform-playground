"use client";

/**
 * การ์ดตัวเลขที่กดแล้วกรอง (StatFilterCards) — ของกลาง
 *
 * ใช้เมื่อ: หัวหน้ารายการอยากให้ "ตัวเลขสรุป = ปุ่มกรอง" ในชิ้นเดียว (ไม่ต้องมีแถบกรองซ้ำอีกแถว)
 *   เช่น สินค้าบนแพลตฟอร์ม: ทั้งหมด / จับคู่แล้ว / ระบบเดาให้ / ยังไม่มีคู่
 * ห้ามใช้: ตัวเลขที่ไม่ได้กรองอะไร (แดชบอร์ด/สรุปเฉย ๆ) — คนจะกดแล้วงงว่าทำไมไม่เกิดอะไร
 * กติกา: การ์ดใบแรกควรเป็น "ทั้งหมด" · กดใบที่เลือกอยู่ซ้ำ = กลับไปใบแรก · value = null/undefined → ขึ้น "…"
 */

import type { ReactNode } from "react";

export type StatTone = "neutral" | "success" | "info" | "warning" | "danger";
export type StatFilterCard = {
  key: string;
  label: string;
  value: number | null | undefined;
  tone?: StatTone;
  icon?: ReactNode;
  /** บรรทัดเล็กใต้ตัวเลข เช่น "40% ของทั้งหมด" */
  hint?: ReactNode;
};

const TONE: Record<StatTone, { label: string; on: string }> = {
  neutral: { label: "text-slate-500", on: "border-slate-400 ring-slate-300 bg-slate-50" },
  success: { label: "text-emerald-600", on: "border-emerald-400 ring-emerald-200 bg-emerald-50/60" },
  info: { label: "text-sky-600", on: "border-sky-400 ring-sky-200 bg-sky-50/60" },
  warning: { label: "text-amber-600", on: "border-amber-400 ring-amber-200 bg-amber-50/60" },
  danger: { label: "text-rose-600", on: "border-rose-400 ring-rose-200 bg-rose-50/60" },
};
// Tailwind ต้องเห็นชื่อคลาสเต็ม — จำนวนการ์ด → คอลัมน์บนจอกว้าง
const COLS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5", 6: "sm:grid-cols-6" };

export function StatFilterCards({ cards, value, onChange, className = "" }: {
  cards: StatFilterCard[];
  /** key ของการ์ดที่เลือกอยู่ */
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const first = cards[0]?.key ?? "";
  return (
    <div className={`grid grid-cols-2 ${COLS[cards.length] ?? "sm:grid-cols-4"} gap-2 ${className}`}>
      {cards.map((c) => {
        const tone = TONE[c.tone ?? "neutral"];
        const on = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && c.key !== first ? first : c.key)}
            className={`text-left rounded-xl border px-3 py-2.5 transition ${on ? `ring-1 ${tone.on}` : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className={`flex items-center gap-1.5 text-xs ${tone.label}`}>{c.icon}<span className="truncate">{c.label}</span></div>
            <div className="text-xl font-semibold text-slate-900 tabular-nums leading-tight mt-0.5">
              {c.value == null ? <span className="inline-block h-5 w-10 rounded bg-slate-100 animate-pulse align-middle" /> : c.value.toLocaleString()}
            </div>
            {c.hint && <div className="text-[11px] text-slate-400 truncate">{c.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}
