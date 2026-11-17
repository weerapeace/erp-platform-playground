"use client";
// แถบ "ป๊อปที่ย่อเก็บ" มุมขวาล่าง (ของกลางชุดป๊อปอัป — ERPModal ปุ่ม ➖)
// ย่อหลายป๊อป = แถบเรียงขึ้นไปทีละอัน · กดแถบ = เปิดต่อ · ✕ = ปิดป๊อป (ยังถามก่อนถ้ามีข้อมูลค้าง)
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { tr } from "@/lib/lang";

// ลำดับแถบ (ย่อก่อน = อยู่ล่างสุด)
let slots: number[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => slots;

/** จองตำแหน่งแถบตอนย่อ · คืนลำดับ (0 = ล่างสุด) หรือ -1 ถ้าไม่ได้ย่อ */
export function useMinimizedSlot(active: boolean): number {
  const [id] = useState(() => ++seq);
  useEffect(() => {
    if (!active) return;
    slots = [...slots, id]; emit();
    return () => { slots = slots.filter((x) => x !== id); emit(); };
  }, [active, id]);
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  return list.indexOf(id);
}

export function MinimizedModalBar({ slot, title, unsaved, onRestore, onClose }: {
  slot: number; title: string; unsaved?: boolean; onRestore: () => void; onClose: () => void;
}) {
  if (slot < 0 || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed right-4 z-[60] flex max-w-[min(360px,calc(100vw-32px))] items-center gap-1 rounded-xl border border-slate-200 bg-white pl-3 pr-1 shadow-xl"
      style={{ bottom: 16 + slot * 52 }} role="region" aria-label={tr("ป๊อปที่ย่อเก็บไว้", "Minimized popup")}>
      <button type="button" onClick={onRestore} className="flex h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm text-slate-700"
        title={tr("กดเพื่อเปิดต่อ", "Click to restore")}>
        <span aria-hidden className="text-slate-400">▣</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {unsaved && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{tr("ยังไม่บันทึก", "Unsaved")}</span>}
        <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">{tr("เปิดต่อ", "Restore")}</span>
      </button>
      <button type="button" onClick={onClose} aria-label={tr("ปิด", "Close")} title={tr("ปิดป๊อปนี้", "Close this popup")}
        className="h-9 w-9 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
    </div>,
    document.body,
  );
}
