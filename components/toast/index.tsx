"use client";

/**
 * Toast กลาง (ของกลาง) — แจ้งสถานะลอยมุมขวาบน: สำเร็จ / ผิดพลาด / เตือน / ข้อมูล
 * ใช้ผ่าน useToast(): toast.success("บันทึกแล้ว") · toast.error("ลบไม่ได้: …")
 * - เด้งซ้อนได้หลายอัน, หายเองอัตโนมัติ (error อยู่นานกว่า), กดปิดได้
 * วาง <ToastProvider> ครอบที่ root layout ครั้งเดียว
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Variant = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; msg: string; variant: Variant };

type ToastApi = {
  show: (msg: string, variant?: Variant) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

const NOOP: ToastApi = { show: () => {}, success: () => {}, error: () => {}, warning: () => {}, info: () => {} };
export function useToast(): ToastApi {
  return useContext(ToastCtx) ?? NOOP;   // fallback no-op ถ้าอยู่นอก provider (กันพัง)
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
  const show = useCallback((msg: string, variant: Variant = "info") => {
    if (!msg) return;
    const id = ++idRef.current;
    setItems((p) => [...p, { id, msg, variant }]);
    setTimeout(() => remove(id), variant === "error" ? 6000 : 3500);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (m) => show(m, "success"),
    error:   (m) => show(m, "error"),
    warning: (m) => show(m, "warning"),
    info:    (m) => show(m, "info"),
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
              <span className="opacity-60 flex-shrink-0">✕</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
