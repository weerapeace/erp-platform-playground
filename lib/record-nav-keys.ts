// ============================================================
// record-nav-keys — ปุ่มลูกศร ← → เปิดรายการก่อนหน้า/ถัดไป ในลิ้นชักดูรายการ (ของกลาง · pure เทสต์ได้)
// ใช้ที่: ลิ้นชัก MasterCRUD (MasterRecordDrawer ใช้ตัวเดียวกัน)
// ============================================================

/** ← = -1 · → = +1 · อื่น ๆ (หรือกดพร้อม Ctrl/Alt/Shift/⌘) = null */
export function navArrowDir(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): 1 | -1 | null {
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return null;
  if (e.key === "ArrowLeft") return -1;
  if (e.key === "ArrowRight") return 1;
  return null;
}

/** กำลังพิมพ์อยู่ในช่อง (ลูกศรต้องเลื่อนเคอร์เซอร์ ไม่ใช่เปลี่ยนรายการ) */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
  }
  return !!el.closest?.("[role='slider'],[role='listbox'],[role='tablist'],[role='menu']");
}
