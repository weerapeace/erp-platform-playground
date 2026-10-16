"use client";

/**
 * 🔤 FontSelect — เลือกฟอนต์แบบเห็นหน้าตาจริง (ของกลาง)
 *
 * แทน <select> ของช่อง "ฟอนต์" ทุกที่: ปุ่มโชว์ชื่อฟอนต์ด้วยฟอนต์นั้นเลย · กดแล้วรายการแต่ละแถวเขียนด้วยฟอนต์ของตัวเอง
 * + ตัวอย่างไทย/อังกฤษ ไม่ต้องเดา · มีช่องค้นหา (รายการยาว) · จัดกลุ่ม · ลูกศรขึ้นลง + Enter เลือก · Esc ปิด
 * ฟอนต์ Google: ใส่ชื่อใน googleFonts → โหลดตอนเปิดรายการ (ฟอนต์ที่เลือกอยู่โหลดตั้งแต่แรก) · ฟอนต์ในเครื่อง/ชุดสำรองใส่ family ได้เลย
 *
 *   <FontSelect value={v} onChange={setV} options={[{ value: "Kanit", label: "Kanit", family: "Kanit", group: "ไทย + อังกฤษ" }]} googleFonts={["Kanit"]} />
 * เอกสาร: docs/font-select.md
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface FontOption {
  value: string;
  /** ชื่อที่โชว์ (เขียนด้วยฟอนต์นั้น) */
  label: string;
  /** CSS font-family ของตัวเลือก ("" / ไม่ใส่ = ฟอนต์ปกติของหน้า) */
  family?: string | null;
  /** หัวกลุ่ม (ติดกัน = กลุ่มเดียวกัน) */
  group?: string;
  /** คำอธิบายเล็ก เช่น "ไทยใช้ฟอนต์สำรอง" */
  note?: string;
}

const DEFAULT_SAMPLE = "กขค สวัสดี Aa 123";

/** ลิงก์ Google Fonts สำหรับพรีวิว (น้ำหนักปกติ) */
export function googleFontsPreviewHref(names: string[]): string | null {
  const fams = [...new Set(names.filter(Boolean))];
  if (!fams.length) return null;
  return `https://fonts.googleapis.com/css2?${fams.map((n) => `family=${n.trim().replace(/ /g, "+")}`).join("&")}&display=swap`;
}

/** ใส่ <link> โหลดฟอนต์ครั้งเดียวต่อชุด */
export function useFontLink(href: string | null) {
  useEffect(() => {
    if (!href || typeof document === "undefined") return;
    const id = `fs-${href.length}-${href.slice(-48).replace(/[^a-z0-9]/gi, "")}`;
    if (document.getElementById(id)) return;
    const el = document.createElement("link");
    el.id = id;
    el.rel = "stylesheet";
    el.href = href;
    document.head.appendChild(el);
  }, [href]);
}

const fam = (o?: FontOption | null) => (o?.family ? o.family : undefined);

export function FontSelect({
  value,
  onChange,
  options,
  googleFonts = [],
  sample = DEFAULT_SAMPLE,
  className,
  title,
  placeholder = "เลือกฟอนต์",
  size = "md",
}: {
  value: string;
  onChange: (value: string) => void;
  options: FontOption[];
  /** ชื่อฟอนต์ Google ที่ต้องโหลดมาโชว์ (ตัวที่เลือกอยู่โหลดทันที · ที่เหลือโหลดตอนเปิดรายการ) */
  googleFonts?: string[];
  /** ข้อความตัวอย่างในรายการ */
  sample?: string;
  /** กรอบนอกของปุ่ม (ความกว้าง) */
  className?: string;
  title?: string;
  placeholder?: string;
  /** sm = ปุ่มเตี้ย (แถบเครื่องมือ) */
  size?: "sm" | "md";
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null);
  const cur = options.find((o) => o.value === value) ?? null;

  // ฟอนต์ที่เลือกอยู่ (โชว์บนปุ่ม) โหลดทันที · ทั้งชุดโหลดตอนเปิด
  const gSet = useMemo(() => new Set(googleFonts), [googleFonts]);
  const curGoogle = cur && gSet.has(cur.value) ? [cur.value] : googleFonts.filter((n) => cur?.family?.includes(n)).slice(0, 1);
  useFontLink(googleFontsPreviewHref(curGoogle));
  useFontLink(open ? googleFontsPreviewHref(googleFonts) : null);

  const ql = q.trim().toLowerCase();
  const shown = useMemo(() => options.filter((o) => !ql || o.label.toLowerCase().includes(ql) || o.value.toLowerCase().includes(ql) || (o.note ?? "").toLowerCase().includes(ql)), [options, ql]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 280 && above > below;
    const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, width, maxH: Math.min(420, up ? above : below), up });
  };
  const openList = () => {
    place();
    setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (o: FontOption) => {
    onChange(o.value);
    setOpen(false);
    btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // รายการสั้น (ไม่มีช่องค้นหา) → โฟกัสรายการ ให้ใช้ลูกศร/Enter ได้ทันที
  useEffect(() => {
    if (open && options.length <= 8) listRef.current?.focus();
  }, [open, options.length]);

  // เลื่อนรายการให้เห็นตัวที่เลือก/ตัวที่ชี้ด้วยคีย์บอร์ด
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = shown[active];
      if (o) choose(o);
    }
  };

  const h = size === "sm" ? "h-7 text-xs" : "h-9 text-sm";
  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openList();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center justify-between gap-2 max-w-full rounded-lg border bg-white px-2.5 text-left text-slate-800 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 ${open ? "border-blue-400" : "border-slate-200"} ${h} ${className ?? "w-full"}`}
      >
        <span className="truncate" style={{ fontFamily: fam(cur) }}>
          {cur ? cur.label : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">▾</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onKey}
            className="fixed z-[1000] rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col overflow-hidden"
            style={{ left: pos.left, width: pos.width, maxHeight: pos.maxH, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            {options.length > 8 && (
              <div className="p-2 border-b border-slate-100">
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setActive(0);
                  }}
                  placeholder="ค้นหาฟอนต์…"
                  className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
            )}
            <div className="overflow-y-auto py-1">
              {!shown.length && <p className="px-3 py-4 text-center text-xs text-slate-400">ไม่พบฟอนต์ที่ค้นหา</p>}
              {shown.map((o, i) => {
                const head = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                const on = o.value === value;
                return (
                  <div key={o.value}>
                    {head && <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{head}</p>}
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-i={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={`w-full flex items-center gap-3 px-3 py-1.5 text-left ${i === active ? "bg-slate-100" : ""} ${on ? "text-blue-700" : "text-slate-800"}`}
                    >
                      <span className="w-4 shrink-0 text-xs">{on ? "✓" : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-snug truncate" style={{ fontFamily: fam(o) }}>
                          {o.label}
                        </span>
                        {o.note && <span className="block text-[10px] text-slate-400 truncate">{o.note}</span>}
                      </span>
                      <span className="shrink-0 max-w-[45%] truncate text-[14px] text-slate-500" style={{ fontFamily: fam(o) }}>
                        {sample}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
