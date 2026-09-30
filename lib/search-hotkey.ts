"use client";

/**
 * useSearchHotkey — คีย์ลัดเปิดกล่องค้นหา (ของกลาง ใช้ทุกเปลือกแอป)
 *
 * - Ctrl+K / ⌘K  → เปิด/ปิด (บางเบราว์เซอร์แย่งไป เช่น Chrome บน Windows = ค้น Google)
 * - "/"          → เปิด เฉพาะตอนไม่ได้พิมพ์อยู่ในช่องไหน (สำรองให้เครื่องที่ Ctrl+K ใช้ไม่ได้)
 */
import { useEffect } from "react";

const isTyping = (el: Element | null) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
};

export function useSearchHotkey(toggle: (open?: boolean) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); return; }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(document.activeElement)) { e.preventDefault(); toggle(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}
