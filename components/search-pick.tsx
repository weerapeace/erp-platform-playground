"use client";

/**
 * 🔍 SearchPick — ช่องเลือกจากรายการแบบ "พิมพ์ค้นหาได้" (ของกลาง · แทน <select> ยาว ๆ)
 *   กด/พิมพ์ = เปิดรายการ · กรองตามชื่อ+คำค้นแฝง · ↑↓ เลื่อน · Enter เลือก · Esc ปิด
 *   ⭐ ปักรายการโปรด (ส่ง starred + onToggleStar) — หน้าที่ใช้เอาไปโชว์เป็นปุ่มลัดเอง
 * ใช้: <SearchPick options={[{ value: "belts", label: "Belts", hint: "เข็มขัด" }]} onPick={(v) => …} placeholder="หมวดอื่น…" />
 * ไม่ใช่ตัวเลือกข้อมูลจากฐานข้อมูล (สินค้า/ซัพพลายเออร์/คน) — อันนั้นใช้ Picker กลางของแต่ละชนิด
 */
import { useMemo, useRef, useState } from "react";

export interface SearchPickOption {
  value: string;
  label: string;
  /** คำค้นแฝง (ไม่โชว์) เช่น รหัส / ชื่ออังกฤษ */
  hint?: string;
  /** ย่อหน้า (เช่น หมวดย่อย) */
  indent?: boolean;
}

export function SearchPick({
  options,
  onPick,
  placeholder = "ค้นหา…",
  disabled = false,
  starred,
  onToggleStar,
  className = "w-48",
  emptyText = "ไม่พบรายการ",
}: {
  options: SearchPickOption[];
  onPick: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  starred?: ReadonlySet<string>;
  onToggleStar?: (value: string) => void;
  className?: string;
  emptyText?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => `${o.label} ${o.value} ${o.hint ?? ""}`.toLowerCase().includes(t)) : options;
  }, [options, q]);

  const choose = (v: string) => {
    setOpen(false);
    setQ("");
    setHi(0);
    onPick(v);
  };

  return (
    <div
      ref={boxRef}
      className={`relative ${className}`}
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        value={q}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(list.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && list[hi]) choose(list[hi].value);
          } else if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={`🔍 ${placeholder}`}
        className="h-7 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
      />
      {open && !disabled && (
        <div className="absolute left-0 top-8 z-30 max-h-64 w-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg" role="listbox">
          {list.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-400">{emptyText}</p>
          ) : (
            list.map((o, i) => (
              <div
                key={o.value}
                role="option"
                aria-selected={i === hi}
                tabIndex={-1}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${i === hi ? "bg-blue-50 text-blue-800" : "text-slate-700"}`}
              >
                <span className={`flex-1 truncate ${o.indent ? "pl-3" : ""}`}>{o.label}</span>
                {onToggleStar && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(o.value);
                    }}
                    title={starred?.has(o.value) ? "เอาออกจากหมวดโปรด" : "ปักเป็นหมวดโปรด (ขึ้นเป็นปุ่มบนแถบ)"}
                    className="shrink-0 px-0.5 text-sm leading-none"
                  >
                    {starred?.has(o.value) ? "⭐" : "☆"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
