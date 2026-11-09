"use client";
/**
 * สลับ "ตาราง / การ์ด" (ของกลาง คู่กับ MiniTable layout="cards" + renderCard) + จำค่าในเครื่องต่อหน้า
 *
 *   const [layout, setLayout] = useMiniTableLayout("platform-catalog-listings");
 *   <LayoutSwitch value={layout} onChange={setLayout} />
 *   <MiniTable layout={layout} renderCard={...} cardPick cardGrid="repeat(auto-fill,minmax(170px,1fr))" ... />
 *
 * ค้นหา/เรียง/ติ๊กเลือกของ MiniTable ใช้ได้เหมือนกันทั้งสองแบบ · วางปุ่มไว้ในแถบเครื่องมือของหน้าเอง (หน้าที่มีค้นหา/เรียงของตัวเองก็ใช้ได้)
 * จำค่าใน localStorage ("minitable:layout:<key>") — โหมดส่วนตัว/บล็อกที่เก็บ = เริ่มที่ค่าเริ่มต้นทุกครั้ง
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";

export type MiniLayout = "table" | "cards";

export function useMiniTableLayout(storageKey: string, initial: MiniLayout = "table"): [MiniLayout, (l: MiniLayout) => void] {
  const key = `minitable:layout:${storageKey}`;
  const [v, setV] = useState<MiniLayout>(initial);
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s === "table" || s === "cards") setV(s); } catch { /* ไม่จำก็ได้ */ }
  }, [key]);
  const set = useCallback((l: MiniLayout) => {
    setV(l);
    try { localStorage.setItem(key, l); } catch { /* ไม่จำก็ได้ */ }
  }, [key]);
  return [v, set];
}

export function LayoutSwitch({ value, onChange, className = "" }: { value: MiniLayout; onChange: (l: MiniLayout) => void; className?: string }) {
  const btn = (l: MiniLayout, icon: string, label: string) => (
    <button type="button" onClick={() => onChange(l)} aria-pressed={value === l} title={`ดูแบบ${label}`}
      className={`inline-flex h-8 items-center gap-1.5 px-2.5 text-sm ${value === l ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
      <Icon name={icon} />{label}
    </button>
  );
  return (
    <span role="group" aria-label="รูปแบบการแสดง" className={`inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200 ${className}`}>
      {btn("table", "table-view", "ตาราง")}
      <span className="w-px bg-slate-200" />
      {btn("cards", "grid-view", "การ์ด")}
    </span>
  );
}
