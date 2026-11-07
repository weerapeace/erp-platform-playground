"use client";

/**
 * ☰ MenuBar — แถบเมนูแบบ "ชี้แล้วเมนูย่อยโผล่" (ของกลาง) · เจ้าของขอ 2026-11-07 (แถบเครื่องมือ Design Dashboard ปุ่มเยอะ รก)
 *
 *   • ชี้เมนู (จอคอม) = เปิด · เลื่อนออก = ปิดเอง (หน่วง 0.2 วิ ให้เลื่อนเข้าแผงทัน) · จอสัมผัส = กดเปิด/ปิด
 *   • เปิดได้ทีละเมนู · กด Esc / กดที่อื่น = ปิด · เลือกรายการแล้วปิดเอง (ยกเว้น check/toggle/keepOpen)
 *   • ชนิดรายการ: item (ปุ่ม) · radio (เลือก 1) · check (ติ๊ก) · toggle (สวิตช์) · section (หัวข้อ) · divider (เส้น)
 *     · submenu (เมนูย่อยซ้อน — รายการ หรือ render แผงเอง เช่น ตัวเลือกช่องที่จะโชว์) — ชิดขอบจอขวาแล้วพลิกไปซ้ายเอง
 *   • เมนูที่ "กำลังใช้งาน" (active เช่น ตัวกรองที่เลือกอยู่) = ปุ่มสีฟ้า + ปุ่ม × ล้าง (onClear)
 *   • ไอคอนเส้นจากชุดไอคอนกลาง (<Icon value="i:filter" />) — ไม่ใช้อีโมจิสี
 *
 * ต่างจาก Popover (components/popover): Popover = กดเปิด มีฉากบังเต็มจอ (ชี้ข้ามเมนูไม่ได้) ไม่มีเมนูย่อยซ้อน
 * ใช้:
 *   <MenuBar menus={[
 *     { key: "filter", label: "ตัวกรอง", icon: "i:filter", active: f !== "all", onClear: () => setF("all"), items: [
 *       { type: "radio", key: "all", label: "ทั้งหมด", checked: f === "all", onSelect: () => setF("all"), hint: 58 },
 *     ] },
 *     { key: "view", label: "มุมมอง", icon: "i:layout-dashboard", items: [
 *       { type: "toggle", key: "strip", label: "แถบสีแบรนด์", on: strip, onSelect: toggleStrip },
 *       { type: "submenu", key: "cols", label: "คอลัมน์ที่โชว์", render: (close) => <ColumnPicker /> },
 *     ] },
 *   ]} />
 * คู่มือ: docs/menu-bar.md · ตัวอย่าง: app/_demos/menu-bar-preview
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";

type Base = { key: string; label: ReactNode; icon?: string; hint?: ReactNode; disabled?: boolean; title?: string };
export type MenuItem =
  | (Base & { type?: "item"; onSelect?: () => void; keepOpen?: boolean })
  | (Base & { type: "radio"; checked: boolean; onSelect: () => void; keepOpen?: boolean })
  | (Base & { type: "check"; checked: boolean; onSelect: () => void; keepOpen?: boolean })
  | (Base & { type: "toggle"; on: boolean; onSelect: () => void; keepOpen?: boolean })
  | { type: "section"; key: string; label: ReactNode }
  | { type: "divider"; key: string }
  | (Base & { type: "submenu"; items?: MenuItem[]; render?: (close: () => void) => ReactNode; width?: number; /** แผงที่ render มีกรอบ/เงาเองแล้ว = ไม่ครอบกรอบซ้ำ */ bare?: boolean });

export type MenuDef = {
  key: string;
  label: ReactNode;
  icon?: string;
  /** กำลังใช้งาน (เช่น กรองอยู่) → ปุ่มสีฟ้า */
  active?: boolean;
  /** มีค่า + active = โชว์ × ล้างบนปุ่ม */
  onClear?: () => void;
  clearLabel?: string;
  title?: string;
  /** ความกว้างแผง (px) ตั้งต้น 240 */
  width?: number;
  items: MenuItem[];
};

const HOVER_CLOSE_MS = 200;
const canHover = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;
const iconValue = (v?: string) => (v ? (v.includes(":") ? v : `i:${v}`) : undefined);

function Mark({ item }: { item: MenuItem }) {
  if (item.type === "radio") return <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] ${item.checked ? "border-[4px] border-slate-800" : "border-slate-300"}`} aria-hidden />;
  if (item.type === "check") return (
    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] text-[9px] leading-none ${item.checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`} aria-hidden>{item.checked ? "✓" : ""}</span>
  );
  return null;
}

function Panel({ items, width, close, nested = false }: { items: MenuItem[]; width?: number; close: () => void; nested?: boolean }) {
  const [sub, setSub] = useState<string | null>(null);
  const subTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (subTimer.current) clearTimeout(subTimer.current); }, []);
  return (
    <div role="menu" className={`rounded-xl border border-slate-200 bg-white p-1 shadow-xl ${nested ? "" : ""}`} style={{ minWidth: width ?? 240 }}>
      {items.map((item) => {
        if (item.type === "section") return <div key={item.key} className="px-2.5 pb-0.5 pt-2 text-[11px] font-medium text-slate-400">{item.label}</div>;
        if (item.type === "divider") return <div key={item.key} className="my-1 h-px bg-slate-100" />;
        const isSub = item.type === "submenu";
        const subOpen = isSub && sub === item.key;
        const select = () => {
          if (item.disabled) return;
          if (isSub) { setSub((s) => (s === item.key ? null : item.key)); return; }
          item.onSelect?.();
          const stay = item.type === "check" || item.type === "toggle" ? item.keepOpen !== false : !!item.keepOpen;
          if (!stay) close();
        };
        return (
          <div key={item.key} className="relative"
            onMouseEnter={() => { if (!canHover()) return; if (subTimer.current) clearTimeout(subTimer.current); setSub(isSub ? item.key : null); }}
            onMouseLeave={() => { if (!canHover() || !isSub) return; subTimer.current = setTimeout(() => setSub((s) => (s === item.key ? null : s)), HOVER_CLOSE_MS); }}>
            <button type="button" role={item.type === "radio" ? "menuitemradio" : item.type === "check" || item.type === "toggle" ? "menuitemcheckbox" : "menuitem"}
              aria-checked={item.type === "radio" || item.type === "check" ? item.checked : item.type === "toggle" ? item.on : undefined}
              aria-haspopup={isSub ? "menu" : undefined} aria-expanded={isSub ? subOpen : undefined}
              disabled={item.disabled} title={item.title} onClick={select}
              className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 ${subOpen ? "bg-slate-100" : "hover:bg-slate-100"}`}>
              <Mark item={item} />
              {item.icon && <Icon value={iconValue(item.icon)} className="shrink-0 text-[15px] text-slate-400" />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint != null && item.hint !== "" && <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{item.hint}</span>}
              {item.type === "toggle" && (
                <span className={`relative h-4 w-7 shrink-0 rounded-full transition ${item.on ? "bg-blue-600" : "bg-slate-300"}`} aria-hidden>
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${item.on ? "left-3.5" : "left-0.5"}`} />
                </span>
              )}
              {isSub && <Icon value="i:chevron-down" className="shrink-0 -rotate-90 text-[13px] text-slate-400" />}
            </button>
            {subOpen && <SubPanel item={item} close={close} />}
          </div>
        );
      })}
    </div>
  );
}

/** แผงเมนูย่อย — วางขวาของรายการ · ชิดขอบจอแล้วพลิกไปซ้าย */
function SubPanel({ item, close }: { item: Extract<MenuItem, { type: "submenu" }>; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) setLeft(true);
  }, []);
  return (
    <div ref={ref} className={`absolute top-[-4px] z-[61] ${left ? "right-full mr-1" : "left-full ml-1"}`}>
      {item.render && item.bare
        ? <div role="menu" style={{ minWidth: item.width ?? 240 }}>{item.render(close)}</div>
        : item.render
        ? <div role="menu" className="rounded-xl border border-slate-200 bg-white p-1 shadow-xl" style={{ minWidth: item.width ?? 240 }}>{item.render(close)}</div>
        : <Panel items={item.items ?? []} width={item.width} close={close} nested />}
    </div>
  );
}

export function MenuBar({ menus, className = "" }: { menus: MenuDef[]; className?: string }) {
  const t = useT();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpenKey(null), []);
  const cancelClose = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => () => cancelClose(), []);

  // กดที่อื่น / Esc = ปิด
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenKey(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenKey(null); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [openKey]);

  return (
    <div ref={rootRef} role="menubar" className={`flex flex-wrap items-center gap-0.5 ${className}`}>
      {menus.map((m) => {
        const open = openKey === m.key;
        return (
          <div key={m.key} className="relative"
            onMouseEnter={() => { if (!canHover()) return; cancelClose(); setOpenKey(m.key); }}
            onMouseLeave={() => { if (!canHover()) return; cancelClose(); timer.current = setTimeout(() => setOpenKey((k) => (k === m.key ? null : k)), HOVER_CLOSE_MS); }}>
            <button type="button" aria-haspopup="menu" aria-expanded={open} title={m.title}
              onClick={() => setOpenKey((k) => (k === m.key ? null : m.key))}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition ${m.active
                ? "bg-blue-50 font-medium text-blue-700 hover:bg-blue-100"
                : open ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
              {m.icon && <Icon value={iconValue(m.icon)} className="text-[15px]" />}
              <span className="whitespace-nowrap">{m.label}</span>
              {m.active && m.onClear ? (
                <span role="button" tabIndex={0} aria-label={m.clearLabel ?? t("ล้าง", "Clear")} title={m.clearLabel ?? t("ล้าง", "Clear")}
                  onClick={(e) => { e.stopPropagation(); m.onClear?.(); setOpenKey(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); m.onClear?.(); } }}
                  className="-mr-1 ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none hover:bg-blue-200">✕</span>
              ) : (
                <Icon value="i:chevron-down" className={`text-[12px] transition ${open ? "rotate-180" : ""}`} />
              )}
            </button>
            {open && (
              <div className="absolute left-0 top-full z-[60] pt-1">
                <Panel items={m.items} width={m.width} close={close} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
