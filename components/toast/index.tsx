"use client";

/**
 * Toast กลาง (ของกลาง) — แจ้งสถานะลอยมุมขวาบน: สำเร็จ / ผิดพลาด / เตือน / ข้อมูล
 * ใช้ผ่าน useToast(): toast.success("บันทึกแล้ว") · toast.error("ลบไม่ได้: …")
 * - เด้งซ้อนได้หลายอัน, หายเองอัตโนมัติ (error อยู่นานกว่า), กดปิดได้
 * - มีปุ่มทำต่อได้ (เช่น ย้อนกลับ): toast.action("บันทึกแล้ว", "ย้อนกลับ", () => undo()) — อยู่ 10 วินาที นับถอยหลังบนปุ่ม
 * วาง <ToastProvider> ครอบที่ root layout ครั้งเดียว
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Variant = "success" | "error" | "warning" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; msg: string; variant: Variant; action?: ToastAction; until?: number };

export type ToastApi = {
  show: (msg: string, variant?: Variant) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
  /** แจ้ง + ปุ่มทำต่อ (เช่น "ย้อนกลับ") — ค่าเริ่ม: สีสำเร็จ อยู่ 10 วินาที */
  action: (msg: string, label: string, onClick: () => void, opts?: { variant?: Variant; ms?: number }) => void;
};

export type ToastVariant = Variant;
/** รูปแบบ pushToast("success", "บันทึกแล้ว") — ส่งต่อเป็น prop ให้ลูก ๆ ได้ */
export type PushToast = (type: ToastVariant, msg: string) => void;

const ToastCtx = createContext<ToastApi | null>(null);

const NOOP: ToastApi = { show: () => {}, success: () => {}, error: () => {}, warning: () => {}, info: () => {}, action: () => {} };
export function useToast(): ToastApi {
  return useContext(ToastCtx) ?? NOOP;   // fallback no-op ถ้าอยู่นอก provider (กันพัง)
}

/** ตัวช่วยสำหรับหน้าที่ใช้รูปแบบ pushToast(type, msg) อยู่แล้ว — แสดงผ่าน toast กลางตัวเดียวกัน (ไม่ต้องทำกองแจ้งเตือนเองในหน้า) */
export function usePushToast(): PushToast {
  const toast = useToast();
  return useCallback((type: ToastVariant, msg: string) => toast.show(msg, type), [toast]);
}

/** เลขวินาทีที่เหลือบนปุ่มทำต่อ */
function Countdown({ until }: { until: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  return <span className="ml-1 tabular-nums opacity-70">({s})</span>;
}

const STYLE: Record<Variant, { bg: string; icon: string }> = {
  success: { bg: "bg-emerald-600", icon: "✓" },
  error:   { bg: "bg-red-600",     icon: "⚠" },
  warning: { bg: "bg-amber-500",   icon: "⚠" },
  info:    { bg: "bg-slate-800",   icon: "ℹ" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);
  useEffect(() => { setMounted(true); }, []);

  const remove = useCallback((id: number) => setItems((p) => p.filter((t) => t.id !== id)), []);
  const show = useCallback((msg: string, variant: Variant = "info", action?: ToastAction, ms?: number) => {
    if (!msg) return;
    const id = ++idRef.current;
    const life = ms ?? (action ? 10000 : variant === "error" ? 6000 : 3500);
    setItems((p) => [...p, { id, msg, variant, action, until: action ? Date.now() + life : undefined }]);
    setTimeout(() => remove(id), life);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    show: (m, v) => show(m, v),
    success: (m) => show(m, "success"),
    error:   (m) => show(m, "error"),
    warning: (m) => show(m, "warning"),
    info:    (m) => show(m, "info"),
    action:  (m, label, onClick, o) => show(m, o?.variant ?? "success", { label, onClick }, o?.ms),
  }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {mounted && createPortal(
        <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 max-w-[90vw]">
          {items.map((t) => (
            <div key={t.id} onClick={() => remove(t.id)}
              className={`${STYLE[t.variant].bg} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-start gap-2 cursor-pointer animate-[slideIn_0.15s_ease-out] max-w-md`}>
              <span className="font-bold flex-shrink-0">{STYLE[t.variant].icon}</span>
              <span className="flex-1 break-words">{t.msg}</span>
              {t.action && (
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(t.id); t.action!.onClick(); }}
                  className="-my-1 flex-shrink-0 rounded-md bg-white/20 px-2.5 py-1 text-[13px] font-semibold hover:bg-white/30">
                  {t.action.label}{t.until ? <Countdown until={t.until} /> : null}
                </button>
              )}
              <span className="opacity-60 flex-shrink-0">✕</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
