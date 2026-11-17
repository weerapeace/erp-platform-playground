"use client";
// useSaveShortcut — ให้ Ctrl+S (⌘S) กดบันทึกฟอร์มนี้ได้ (ของกลาง · แกน = lib/save-shortcut)
//   useSaveShortcut(() => save(), { enabled: dirty && !saving });
// ซ้อนหลายฟอร์ม → ตัวที่เปิดล่าสุด (บนสุด) ได้บันทึก · enabled=false = ข้ามไปหาตัวล่าง ๆ
import { useEffect, useRef } from "react";
import { ensureSaveShortcutListener, registerSaveHandler } from "@/lib/save-shortcut";

export function useSaveShortcut(onSave: (() => void | Promise<void>) | null | undefined, opts?: { enabled?: boolean; active?: boolean }) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const enabledRef = useRef(opts?.enabled ?? true);
  enabledRef.current = opts?.enabled ?? true;
  const active = (opts?.active ?? true) && !!onSave;
  useEffect(() => {
    if (!active) return;
    ensureSaveShortcutListener();
    return registerSaveHandler(() => { void saveRef.current?.(); }, () => enabledRef.current && !!saveRef.current);
  }, [active]);
}
