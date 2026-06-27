"use client";

// ============================================================
// BulletTextarea (ของกลาง) — textarea ที่ทำหัวข้อย่อย (bullets) ง่ายขึ้น
// กด Enter ในบรรทัดที่ขึ้นต้นด้วย "• " → ต่อ "• " ให้อัตโนมัติ · บรรทัด bullet ว่าง + Enter = จบรายการ
// เก็บเป็นข้อความล้วน (มี "• " นำหน้า) → แสดงด้วย whitespace-pre-wrap ที่ไหนก็ได้
// ============================================================

import { ERPTextarea } from "@/components/form";

const BULLET = "• ";

export function BulletTextarea({ value, onChange, placeholder, rows = 4 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const ta = e.currentTarget;
    const pos = ta.selectionStart;
    const before = value.slice(0, pos);
    const lineStart = before.lastIndexOf("\n") + 1;
    const curLine = before.slice(lineStart);
    if (!curLine.startsWith(BULLET)) return;     // ไม่ใช่บรรทัด bullet → ปล่อยปกติ
    e.preventDefault();
    if (curLine.trim() === BULLET.trim()) {       // bullet ว่าง + Enter → จบรายการ (ลบ bullet ทิ้ง)
      const next = value.slice(0, lineStart) + value.slice(pos);
      onChange(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart; });
      return;
    }
    const insert = "\n" + BULLET;                 // ต่อ bullet ใหม่
    onChange(value.slice(0, pos) + insert + value.slice(pos));
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos + insert.length; });
  };

  const addBullet = () => {
    const v = value.replace(/\s+$/, "");
    onChange((v ? v + "\n" : "") + BULLET);
  };

  return (
    <div>
      <ERPTextarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
      <button type="button" onClick={addBullet} className="mt-1 text-xs text-violet-600 hover:underline">• เพิ่มหัวข้อย่อย</button>
    </div>
  );
}
