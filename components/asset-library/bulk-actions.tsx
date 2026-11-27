"use client";
// คลังไฟล์: คำสั่งกับไฟล์ที่เลือก (เจ้าของเลือก 2026-11-27 · ข้อเสนอ 1-6)
//   ใช้ "รายการคำสั่งชุดเดียว" ทั้ง 3 ที่: ปุ่ม "อัลบั้ม ▾" · ปุ่ม ⋯ บนแถบล่าง (ของกลาง BulkActionBar + Popover) · เมนูคลิกขวาที่รูป
//   แก้คำสั่งที่นี่ที่เดียว ทั้งแถบและคลิกขวาเปลี่ยนตาม
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";

export type AssetActionKey = "add" | "move_to" | "new_sub" | "remove" | "tag" | "edit" | "drive_folder" | "same_folder" | "trash";
export type AssetActionItem = { key: AssetActionKey; label: string; icon: string; tone?: "warn" | "danger" } | "sep";

export function AssetActionList({ items, onPick }: { items: AssetActionItem[]; onPick: (k: AssetActionKey) => void }) {
  return (
    <div role="menu" className="py-1 min-w-[13rem] text-[13px]">
      {items.map((it, i) => it === "sep"
        ? <div key={`s${i}`} className="my-1 border-t border-slate-100" />
        : (
          <button key={it.key} type="button" role="menuitem" onClick={() => onPick(it.key)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 ${it.tone === "danger" ? "text-rose-600" : it.tone === "warn" ? "text-amber-700" : "text-slate-700"}`}>
            <Icon value={it.icon} className="shrink-0 text-[15px]" /> {it.label}
          </button>
        ))}
    </div>
  );
}

/** เมนูคลิกขวา: วางที่ตำแหน่งเมาส์ (กันล้นขอบจอ) · ปิดเมื่อคลิกนอก / Esc / เลื่อนจอ */
export function AssetContextMenu({ x, y, title, items, onPick, onClose }: {
  x: number; y: number; title?: string; items: AssetActionItem[]; onPick: (k: AssetActionKey) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)), ready: true });
  }, [x, y]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    const close = () => onClose();
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 80, visibility: pos.ready ? "visible" : "hidden" }}
      className="rounded-xl border border-slate-200 bg-white shadow-xl">
      {title && <p className="px-3 pt-2 pb-1 text-[11px] text-slate-400 truncate max-w-[16rem]">{title}</p>}
      <AssetActionList items={items} onPick={(k) => { onClose(); onPick(k); }} />
    </div>,
    document.body,
  );
}
