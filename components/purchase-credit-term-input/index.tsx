"use client";

/**
 * เครดิต (ของกลาง) — ใช้ทั้งเครดิตร้าน (เงินออก) และเครดิตลูกค้า (เงินเข้า)
 * ค่า = text เดียว (immediate | eom | days:N | months:N | monthday:N | monthday_next:N) — กติกาคิดวันอยู่ที่ lib/credit-term
 *
 *   <PurchaseCreditTermInput value onChange />   เลือกแบบ + ใส่ตัวเลข X เอง (X วัน · ทุกวันที่ X เดือนที่สั่ง · วันที่ X เดือนถัดไป) + ตัวอย่างวันครบกำหนด
 *       onChange(value, { incomplete })  — เลือกแบบที่ต้องมีตัวเลขแต่ยังไม่ใส่/ใส่ผิด = value null + incomplete true (อย่าเพิ่งบันทึก)
 *       size="sm" = ตัวเล็กสำหรับแถวในตาราง
 *   <CreditTermView value onEdit />              แบบอ่านอย่างเดียว (🔒 ข้อความ + ตัวอย่างวัน) + ปุ่ม "แก้ไข" — ตั้งแล้วไม่ให้เผลอเปลี่ยน
 *
 * ใช้ที่: ฟอร์มคู่ค้า · ใบวางบิล · ปฏิทินจัดซื้อ · กระดานเงื่อนไขร้าน · ตัวช่วยเพิ่มร้าน · /cashflow/credit-terms · ป๊อปตั้งเครดิตใน /cashflow
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { parseCreditTerm, computeDueDate, formatCreditTerm } from "@/lib/credit-term";

const thDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

const TYPES: { key: string; label: string }[] = [
  { key: "",              label: "— ยังไม่ตั้ง —" },
  { key: "immediate",     label: "ต้องชำระเลย" },
  { key: "days",          label: "X วัน (นับจากวันสั่ง)" },
  { key: "eom",           label: "สิ้นเดือน (เดือนที่สั่ง)" },
  { key: "monthday",      label: "ทุกวันที่ X (เดือนที่สั่ง)" },
  { key: "monthday_next", label: "วันที่ X เดือนถัดไป" },
  { key: "months",        label: "X เดือน (นับจากวันสั่ง)" },
];
const DEFAULT_NUM: Record<string, number> = { days: 30, months: 1, monthday: 25, monthday_next: 5 };
const NUM_MAX: Record<string, number> = { days: 365, months: 24, monthday: 31, monthday_next: 31 };
const NUM_UNIT: Record<string, string> = { days: "วัน", months: "เดือน", monthday: "(วันที่ 1–31)", monthday_next: "(วันที่ 1–31)" };
const needsNum = (t: string) => t in NUM_MAX;

/** แบบ + ตัวเลข → ค่าที่เก็บ (null = ยังไม่ตั้ง หรือยังกรอกไม่ครบ) */
export function composeCreditTerm(type: string, num: string): string | null {
  if (!type) return null;
  if (!needsNum(type)) return type;
  const n = Number(num);
  if (!num.trim() || !Number.isInteger(n) || n < 1 || n > NUM_MAX[type]) return null;
  return `${type}:${n}`;
}
function split(value: string | null): { type: string; num: string } {
  const t = parseCreditTerm(value);
  return { type: t?.type ?? "", num: t && "value" in t ? String(t.value) : "" };
}

/** ตัวอย่างสด "สั่งวันนี้ → ครบกำหนดวันไหน" */
function DueExample({ value }: { value: string | null }) {
  const today = todayIso();
  const due = value ? computeDueDate(today, value) : null;
  if (!due) return null;
  return (
    <span className="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 whitespace-nowrap">
      สั่งวันนี้ ({thDate(today)}) → ครบกำหนด <b className="text-slate-700">{thDate(due)}</b>
    </span>
  );
}

export function PurchaseCreditTermInput({ value, onChange, disabled, size = "md" }: {
  value: string | null;
  onChange: (v: string | null, info?: { incomplete: boolean }) => void;
  disabled?: boolean;
  size?: "md" | "sm";
}) {
  // เก็บแบบ/ตัวเลขที่กำลังพิมพ์ไว้ในช่องเอง — ลบตัวเลขจนว่างแล้วแบบไม่เด้งกลับเป็น "ยังไม่ตั้ง"
  const [draft, setDraft] = useState(() => split(value));
  const lastEmit = useRef<string | null>(value);
  useEffect(() => {
    if (value !== lastEmit.current) { lastEmit.current = value; setDraft(split(value)); }   // ค่าเปลี่ยนจากข้างนอก (เช่น ปุ่มเติมทีเดียว / ยกเลิก)
  }, [value]);

  const emit = (type: string, num: string) => {
    setDraft({ type, num });
    const v = composeCreditTerm(type, num);
    lastEmit.current = v;
    onChange(v, { incomplete: !!type && v === null });
  };
  const { type, num } = draft;
  const composed = composeCreditTerm(type, num);
  const bad = needsNum(type) && composed === null;
  const h = size === "sm" ? "h-8" : "h-9";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={type} disabled={disabled} aria-label="แบบเครดิต"
        onChange={(e) => {
          const t = e.target.value;
          const keep = needsNum(type) && num.trim() !== "" && Number(num) >= 1 && Number(num) <= (NUM_MAX[t] ?? 0);   // สลับแบบ = ใช้ตัวเลขเดิมถ้ายังใช้ได้
          emit(t, needsNum(t) ? (keep ? num : String(DEFAULT_NUM[t])) : "");
        }}
        className={`${h} px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50`}>
        {TYPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {needsNum(type) && (
        <span className="inline-flex items-center gap-1">
          <input type="number" inputMode="numeric" min={1} max={NUM_MAX[type]} step={1} value={num} disabled={disabled}
            aria-label={type === "days" ? "จำนวนวัน" : type === "months" ? "จำนวนเดือน" : "วันที่"} aria-invalid={bad}
            onChange={(e) => emit(type, e.target.value)}
            className={`${h} w-20 px-2 text-sm text-right border rounded-lg disabled:bg-slate-50 ${bad ? "border-red-300 bg-red-50" : "border-slate-200"}`} />
          <span className="text-xs text-slate-500">{NUM_UNIT[type]}</span>
        </span>
      )}
      {bad
        ? <span className="text-[11px] text-red-600">ใส่ตัวเลข 1–{NUM_MAX[type]}</span>
        : <DueExample value={composed} />}
    </div>
  );
}

/** แบบอ่านอย่างเดียว — ตั้งแล้วโชว์เป็นข้อความ กด "แก้ไข" ก่อนถึงเปลี่ยนได้ (ไม่ส่ง onEdit = ไม่มีปุ่ม เช่น ไม่มีสิทธิ์แก้) */
export function CreditTermView({ value, onEdit, className = "" }: { value: string | null; onEdit?: () => void; className?: string }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <Icon value="i:lock" size={13} className="text-slate-400" />
      <span className="text-sm text-slate-700">{formatCreditTerm(value)}</span>
      <DueExample value={value} />
      {onEdit && (
        <button type="button" onClick={onEdit}
          className="h-8 px-2.5 inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <Icon value="i:edit" size={13} /> แก้ไข
        </button>
      )}
    </div>
  );
}
