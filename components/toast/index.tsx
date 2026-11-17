"use client";

/**
 * Toast กลาง (ของกลาง) — แจ้งสถานะลอยมุมขวาบน: สำเร็จ / ผิดพลาด / เตือน / ข้อมูล
 * ใช้ผ่าน useToast(): toast.success("บันทึกแล้ว") · toast.error("ลบไม่ได้: …")
 * - เด้งซ้อนได้หลายอัน, หายเองอัตโนมัติ (error อยู่นานกว่า), กดปิดได้
 * - มีปุ่มทำต่อได้ (เช่น ย้อนกลับ): toast.action("บันทึกแล้ว", "ย้อนกลับ", () => undo()) — อยู่ 10 วินาที นับถอยหลังบนปุ่ม
 * - ย้อนกลับหลังลบ/ย้าย: toast.undo("ลบแล้ว 3 รายการ", () => restore()) — ปุ่ม "ย้อนกลับ" นับถอยหลัง 5 วินาที
 *   (หน้าที่เรียกต้องส่งตัวย้อนกลับมาเอง เช่น ตั้ง is_active กลับเป็น true)
 * - ข้อความผิดพลาดมีปุ่ม "คัดลอกรายละเอียด" อัตโนมัติ (ข้อความ + หน้า + เวลา + เบราว์เซอร์)
 *   แนบรายละเอียดเทคนิคเพิ่มได้: toast.error("บันทึกไม่ได้", { details: err })
 * วาง <ToastProvider> ครอบที่ root layout ครั้งเดียว
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Variant = "success" | "error" | "warning" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; msg: string; variant: Variant; action?: ToastAction; more?: ToastAction[]; until?: number; details?: string };

export type ToastApi = {
  show: (msg: string, variant?: Variant) => void;
  success: (msg: string) => void;
  /** ผิดพลาด — มีปุ่ม "คัดลอกรายละเอียด" · details = รายละเอียดเทคนิค (ไม่โชว์บนจอ แต่ติดไปตอนคัดลอก) */
  error: (msg: string, opts?: { details?: unknown }) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
  /** แจ้ง + ปุ่มทำต่อ (เช่น "ย้อนกลับ") — ค่าเริ่ม: สีสำเร็จ อยู่ 10 วินาที */
  /** more = ปุ่มเพิ่มเติมต่อท้าย (เช่น [เปิดอัลบั้ม] [เปลี่ยนชื่อ]) — ปุ่มหลัก (label) นับถอยหลัง */
  action: (msg: string, label: string, onClick: () => void, opts?: { variant?: Variant; ms?: number; more?: ToastAction[] }) => void;
  /** แจ้งหลังลบ/ย้าย + ปุ่ม "ย้อนกลับ" นับถอยหลัง (ค่าเริ่ม 5 วินาที) — onUndo = ตัวย้อนกลับที่หน้าส่งมาเอง */
  undo: (msg: string, onUndo: () => void | Promise<void>, opts?: { ms?: number; label?: string }) => void;
};

export type ToastVariant = Variant;
/** รูปแบบ pushToast("success", "บันทึกแล้ว") — ส่งต่อเป็น prop ให้ลูก ๆ ได้ */
export type PushToast = (type: ToastVariant, msg: string) => void;

/** เวลาปุ่มย้อนกลับ (มิลลิวินาที) */
export const UNDO_MS = 5000;

/** แปลงรายละเอียดผิดพลาด (Error / object / string) เป็นข้อความ */
export function detailText(d: unknown): string {
  if (d == null) return "";
  if (typeof d === "string") return d;
  if (d instanceof Error) return d.stack || d.message;
  try { return JSON.stringify(d, null, 2); } catch { return String(d); }
}

/** ข้อความที่คัดลอกไปส่งทีมช่วยแก้: ข้อความ + รายละเอียด + หน้า + เวลา + เบราว์เซอร์ */
export function buildErrorReport(msg: string, details?: string, env?: { url?: string; at?: Date; ua?: string }): string {
  const url = env?.url ?? (typeof location !== "undefined" ? location.href : "");
  const ua = env?.ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const at = (env?.at ?? new Date()).toLocaleString("th-TH", { hour12: false });
  return [
    "ข้อผิดพลาด: " + msg,
    details ? "รายละเอียด:\n" + details : "",
    url ? "หน้า: " + url : "",
    "เวลา: " + at,
    ua ? "เบราว์เซอร์: " + ua : "",
  ].filter(Boolean).join("\n");
}

const ToastCtx = createContext<ToastApi | null>(null);

const NOOP: ToastApi = { show: () => {}, success: () => {}, error: () => {}, warning: () => {}, info: () => {}, action: () => {}, undo: () => {} };
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

function CopyDetailsButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title="คัดลอกรายละเอียดไปส่งทีมช่วยแก้"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(text).then(() => setDone(true), () => {}); }}
      className="-my-1 flex-shrink-0 rounded-md bg-white/20 px-2 py-1 text-[12px] font-semibold hover:bg-white/30">
      {done ? "คัดลอกแล้ว" : "คัดลอกรายละเอียด"}
    </button>
  );
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
  const show = useCallback((msg: string, variant: Variant = "info", action?: ToastAction, ms?: number, more?: ToastAction[], details?: string) => {
    if (!msg) return;
    const id = ++idRef.current;
    const life = ms ?? (action ? 10000 : variant === "error" ? 6000 : 3500);
    setItems((p) => [...p, { id, msg, variant, action, more, details, until: action ? Date.now() + life : undefined }]);
    setTimeout(() => remove(id), life);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    show: (m, v) => show(m, v),
    success: (m) => show(m, "success"),
    error:   (m, o) => show(m, "error", undefined, undefined, undefined, o?.details == null ? undefined : detailText(o.details)),
    warning: (m) => show(m, "warning"),
    info:    (m) => show(m, "info"),
    action:  (m, label, onClick, o) => show(m, o?.variant ?? "success", { label, onClick }, o?.ms, o?.more),
    undo:    (m, onUndo, o) => show(m, "success", { label: o?.label ?? "ย้อนกลับ", onClick: () => { void onUndo(); } }, o?.ms ?? UNDO_MS),
  }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {mounted && createPortal(
        <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 max-w-[90vw]">
          {items.map((t) => (
            <div key={t.id} onClick={() => remove(t.id)}
              className={`${STYLE[t.variant].bg} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex flex-wrap items-start gap-2 cursor-pointer animate-[slideIn_0.15s_ease-out] max-w-md`}>
              <span className="font-bold flex-shrink-0">{STYLE[t.variant].icon}</span>
              <span className="flex-1 min-w-0 break-words">{t.msg}</span>
              {t.action && (
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(t.id); t.action!.onClick(); }}
                  className="-my-1 flex-shrink-0 rounded-md bg-white/20 px-2.5 py-1 text-[13px] font-semibold hover:bg-white/30">
                  {t.action.label}{t.until ? <Countdown until={t.until} /> : null}
                </button>
              )}
              {t.variant === "error" && <CopyDetailsButton text={buildErrorReport(t.msg, t.details)} />}
              {t.more?.map((a) => (
                <button key={a.label} type="button" onClick={(e) => { e.stopPropagation(); remove(t.id); a.onClick(); }}
                  className="-my-1 flex-shrink-0 rounded-md bg-white/20 px-2.5 py-1 text-[13px] font-semibold hover:bg-white/30">{a.label}</button>
              ))}
              <span className="opacity-60 flex-shrink-0">✕</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
