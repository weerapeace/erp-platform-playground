"use client";

/**
 * BottomSheet — แผ่นเลื่อนขึ้นจากล่าง (ของกลางชุดป๊อปอัป · สำหรับจอมือถือ) — docs/popup-policy.md
 *
 *   <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="แก้วัสดุ" footer={<button>เสร็จ</button>}>
 *     ...ฟอร์มสั้น ๆ...
 *   </BottomSheet>
 *
 * - ไม่ portal: อยู่ในกรอบพรีวิวมือถือ (DevicePreviewFrame) ตอนดูบนจอคอม — fixed ยึดกรอบนั้น
 * - แตะพื้นหลัง / Esc / ปุ่ม back ของเครื่อง (useBackClose) = ปิด
 * - หัว = ขีดจับ + ชื่อ + ปุ่มปิด · footer ติดล่างเสมอ (เผื่อขอบจอ iPhone) · เนื้อหายาว = เลื่อนในแผ่น
 * - จอคอม/ป๊อปทั่วไป → ใช้ ERPModal · ลิ้นชักข้าง → Drawer
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useBackClose } from "@/lib/use-back-close";

// แผ่นที่เปิดซ้อนกัน (เช่น แก้บรรทัด → เลือกวัสดุ) — Esc ปิดเฉพาะแผ่นบนสุด
const openStack: number[] = [];
let seq = 0;

export function BottomSheet({ open, onClose, title, subtitle, children, footer, maxHeight = "88dvh", zIndex = 70, backKey = "sheet" }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** บรรทัดเล็กใต้ชื่อ (เช่น "3 / 7") */
  subtitle?: ReactNode;
  children: ReactNode;
  /** ปุ่มท้ายแผ่น (ติดล่าง) */
  footer?: ReactNode;
  maxHeight?: string;
  zIndex?: number;
  /** ชื่อก้าวในประวัติ (แผ่นซ้อนกันได้ — ปุ่ม back ปิดทีละชั้น) */
  backKey?: string;
}) {
  const t = useT();
  useBackClose(open, onClose, backKey);
  const idRef = useRef(0);
  if (!idRef.current) idRef.current = ++seq;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    openStack.push(id);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && openStack[openStack.length - 1] === id) closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); const i = openStack.lastIndexOf(id); if (i >= 0) openStack.splice(i, 1); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-end bg-black/40" style={{ zIndex }} onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl" style={{ maxHeight }}>
        <div className="shrink-0 px-3 pt-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
          {(title || subtitle) && (
            <div className="flex items-start gap-2 pb-2">
              <div className="min-w-0 flex-1">
                {title && <div className="truncate text-sm font-semibold text-slate-900">{title}</div>}
                {subtitle && <div className="truncate text-[11px] text-slate-400">{subtitle}</div>}
              </div>
              <button type="button" onClick={onClose} aria-label={t("ปิด", "Close")}
                className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"><Icon name="cancel" /></button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-slate-100 bg-white px-3 pt-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
