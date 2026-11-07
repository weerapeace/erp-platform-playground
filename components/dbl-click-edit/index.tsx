"use client";
// ดับเบิลคลิกช่องที่ล็อกอยู่ = เข้าโหมดแก้ไขทั้งฟอร์ม (ของกลาง) — แทนปุ่ม "✏️ แก้ไข" (เจ้าของขอ 2026-11-07)
//
//   <DblClickToEdit locked={!fullEdit} onEdit={canEdit ? () => setEditing(true) : undefined}>
//     ...ช่องฟอร์มที่ใช้ disabled={!fullEdit}...
//   </DblClickToEdit>
//
// - ดับเบิลคลิก (จอคอม) / แตะ 2 ครั้งเร็ว ๆ (จอทัช) ที่ช่องที่ล็อก → onEdit() แล้วเคอร์เซอร์ไปรอที่ช่องที่คลิก
// - ช่องที่แก้ได้อยู่แล้วในโหมดดู (เช่น สถานะ) / ปุ่ม / ลิงก์ = ทำงานตามปกติ ไม่ถูกดักไป
// - ช่อง disabled ไม่รับเหตุการณ์เมาส์ในบางเบราว์เซอร์ → ระหว่างล็อกตั้ง pointer-events:none ให้ช่องนั้น เหตุการณ์จะตกที่กรอบ <label> แทน
// - ไม่มีสิทธิ์แก้ (onEdit ไม่ส่งมา) / ปลดล็อกแล้ว = เป็น div ธรรมดา (โครงเดิม state ลูกไม่หาย)
// ตารางรายการ (LineItemsGrid) มีของตัวเองแล้ว: readonly + onRequestEdit · docs/dbl-click-edit.md
import { useRef, type PointerEvent, type ReactNode } from "react";
import { useT } from "@/components/i18n";

const EDITABLE_NOW = "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a, [contenteditable='true']";
const FOCUSABLE = "input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled)";
const DOUBLE_TAP_MS = 450;

// ระหว่างล็อก: ช่อง disabled ปล่อยเมาส์ทะลุไปที่กรอบ · ชี้ช่องที่ล็อก = เคอร์เซอร์พิมพ์ + พื้นอมสีให้รู้ว่ากดได้
const LOCKED_CLS = "[&_:disabled]:pointer-events-none [&_label:has(:disabled)]:cursor-text [&_label:has(:disabled):hover_:disabled]:bg-blue-50/60 [&_label:has(:disabled):hover_:disabled]:border-blue-200";

export function DblClickToEdit({ locked, onEdit, children, className = "" }: {
  /** ฟอร์มอยู่ในโหมดดูอย่างเดียวไหม */
  locked: boolean;
  /** เข้าโหมดแก้ไข — ไม่ส่ง = ไม่มีสิทธิ์แก้ (ดับเบิลคลิกไม่ทำอะไร) */
  onEdit?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  const lastTap = useRef<{ at: number; el: Element | null }>({ at: 0, el: null });
  const firedAt = useRef(0);
  const active = locked && !!onEdit;

  const unlockAt = (target: HTMLElement) => {
    if (!onEdit || target.closest(EDITABLE_NOW)) return;   // ช่องที่แก้ได้อยู่แล้ว / ปุ่ม = ปล่อยผ่าน
    if (Date.now() - firedAt.current < 600) return;   // จับได้ทั้ง 2 ทาง (กดสองครั้ง + dblclick) = ทำครั้งเดียว
    firedAt.current = Date.now();
    const field = target.closest("label, [data-dbl-field]");
    window.getSelection()?.removeAllRanges();   // ดับเบิลคลิกปกติจะลากคลุมคำ — ล้างทิ้ง
    onEdit();
    // รอให้ช่องหายล็อก (render รอบถัดไป) แล้วค่อยวางเคอร์เซอร์ที่ช่องที่คลิก
    window.setTimeout(() => field?.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 60);
  };

  // กดช่องเดิม 2 ครั้งเร็ว ๆ (เมาส์/ทัช) — จับเองด้วย: มือถือบางรุ่นไม่ส่ง dblclick และกล่อง SplitPanes ที่ขยายตอนคลิกแรก
  // ทำให้ตำแหน่งช่องขยับ → เบราว์เซอร์ไม่นับเป็น dblclick (ช่องเดิมยังเป็น element เดิม จึงเทียบได้)
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const field = (e.target as HTMLElement).closest("label, [data-dbl-field]") ?? (e.target as Element);
    const now = Date.now();
    if (now - lastTap.current.at < DOUBLE_TAP_MS && lastTap.current.el === field) {
      lastTap.current = { at: 0, el: null };
      unlockAt(e.target as HTMLElement);
    } else lastTap.current = { at: now, el: field };
  };

  return (
    <div className={`${className} ${active ? LOCKED_CLS : ""}`}
      title={active ? t("ดับเบิลคลิกที่ช่องเพื่อแก้ไข", "Double-click a field to edit") : undefined}
      onDoubleClick={active ? (e) => unlockAt(e.target as HTMLElement) : undefined}
      onPointerUp={active ? onPointerUp : undefined}>
      {children}
    </div>
  );
}
