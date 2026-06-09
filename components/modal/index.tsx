"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * useBackdropDismiss — ปิด popup เฉพาะเมื่อ "กดเริ่ม + ปล่อย" บน backdrop จริงๆ
 * แก้บั๊ก: ลากเลือกข้อความในป๊อปอัปแล้วเผลอปล่อยเมาส์นอกกรอบ → ป๊อปอัปไม่ควรปิด
 * วิธีใช้: <div {...useBackdropDismiss(onClose)}> ... content (currentTarget = backdrop) </div>
 * (ของกลาง — ใช้กับทุก popup)
 */
export function useBackdropDismiss(onClose?: () => void) {
  const downOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => {
      e.stopPropagation();
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onClose && downOnBackdrop.current && e.target === e.currentTarget) onClose();
      downOnBackdrop.current = false;
    },
  };
}

// ---- Icons ----

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconAlertTriangle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
function IconCheckCircle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
function IconLoader() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ---- Types ----

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ERPModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  hasUnsavedChanges?: boolean;
  closeOnBackdrop?: boolean;
  /** ให้ผู้ใช้ลากปรับขนาด popup เองได้ (มุมขวาล่าง) — default: true */
  resizable?: boolean;
  /** key สำหรับจำขนาดที่ผู้ใช้ปรับไว้ใน localStorage (เช่น "journal-modal") */
  storageKey?: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  loading?: boolean;
  requireTyped?: string;
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children?: React.ReactNode;
  footer?: React.ReactNode;
  hasUnsavedChanges?: boolean;
  storageKey?: string;
  defaultWidth?: number;
}

// ---- Size map ----

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const DRAWER_SIZE: Record<string, string> = {
  sm: "max-w-xs",
  md: "max-w-sm",
  lg: "max-w-lg",
};

// ---- Unsaved Changes Guard ----

function UnsavedChangesDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 rounded-xl">
      <div className="bg-white rounded-xl shadow-xl p-6 mx-4 max-w-sm w-full">
        <div className="flex gap-3 mb-4">
          <span className="text-amber-500 mt-0.5 flex-shrink-0"><IconAlertTriangle /></span>
          <div>
            <p className="font-semibold text-slate-900">มีข้อมูลที่ยังไม่ได้บันทึก</p>
            <p className="text-sm text-slate-500 mt-1">ต้องการออกโดยไม่บันทึกหรือไม่?</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onStay}
            className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            อยู่ต่อ
          </button>
          <button
            onClick={onLeave}
            className="h-9 px-4 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors"
          >
            ออกโดยไม่บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- ERPModal ----

// ค่ากว้างเริ่มต้น (px) ตาม size preset — ใช้เป็นจุดเริ่มเมื่อผู้ใช้ลากครั้งแรก
const SIZE_PX: Record<ModalSize, number> = { sm: 384, md: 448, lg: 672, xl: 896 };

export function ERPModal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  loading = false,
  hasUnsavedChanges = false,
  closeOnBackdrop = true,
  resizable = true,
  storageKey,
}: ERPModalProps) {
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // ขนาดที่ผู้ใช้ลากเอง (null = ใช้ preset). { w, h } เป็น px
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const resizing = useRef(false);
  const resizeAxis = useRef<"x" | "y" | "both">("both");   // ลากขอบขวา=x / ขอบล่าง=y / มุม=both
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // โหลดขนาดที่จำไว้
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(`erp-modal-${storageKey}`);
      if (saved) { const d = JSON.parse(saved); if (d?.w && d?.h) setDims(d); }
    } catch { /* ignore */ }
  }, [storageKey]);

  // ลากปรับขนาด — มุมขวาล่างตามเคอร์เซอร์ (popup จัดกึ่งกลาง → คำนวณจาก center)
  useEffect(() => {
    if (!open || !resizable) return;
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const w = Math.round(Math.max(320, Math.min(2 * (e.clientX - cx), window.innerWidth * 0.98)));
      const h = Math.round(Math.max(200, Math.min(2 * (e.clientY - cy), window.innerHeight * 0.96)));
      const ax = resizeAxis.current;
      setDims((d) => {
        const base = d ?? { w, h };
        return { w: ax === "y" ? base.w : w, h: ax === "x" ? base.h : h };
      });
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (storageKey) {
        try { setDims((d) => { if (d) localStorage.setItem(`erp-modal-${storageKey}`, JSON.stringify(d)); return d; }); }
        catch { /* ignore */ }
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [open, resizable, storageKey]);

  const startResize = (e: React.MouseEvent, axis: "x" | "y" | "both" = "both") => {
    e.preventDefault(); e.stopPropagation();
    // ถ้ายังไม่เคยตั้งขนาด → เริ่มจากขนาดจริงปัจจุบันของ panel
    if (!dims && panelRef.current) {
      const r = panelRef.current.getBoundingClientRect();
      setDims({ w: Math.round(r.width), h: Math.round(r.height) });
    }
    resizeAxis.current = axis;
    resizing.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "x" ? "ew-resize" : axis === "y" ? "ns-resize" : "nwse-resize";
  };
  const resetSize = () => {
    setDims(null);
    if (storageKey) { try { localStorage.removeItem(`erp-modal-${storageKey}`); } catch { /* ignore */ } }
  };

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    if (!open) { setShowUnsavedWarning(false); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  const backdropDismiss = useBackdropDismiss(closeOnBackdrop && !hasUnsavedChanges ? onClose : handleClose);

  if (!mounted || !open) return null;

  // เลือกขนาด: expanded > custom dims > preset
  const usingCustom = !!dims && !expanded;
  const panelClass = expanded
    ? "w-[96vw] max-w-[96vw] h-[94vh] max-h-[94vh]"
    : usingCustom
      ? ""                                  // ขนาดมาจาก inline style
      : `w-full ${SIZE_CLASS[size]} max-h-[90vh]`;
  const panelStyle = usingCustom
    ? { width: dims!.w, height: dims!.h, maxWidth: "98vw", maxHeight: "96vh" }
    : undefined;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        {...backdropDismiss}
      />

      {/* Modal panel */}
      <div
        ref={panelRef}
        className={`relative bg-white rounded-xl shadow-2xl flex flex-col ${panelClass}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Unsaved changes guard */}
        <UnsavedChangesDialog
          open={showUnsavedWarning}
          onStay={() => setShowUnsavedWarning(false)}
          onLeave={() => { setShowUnsavedWarning(false); onClose(); }}
        />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
          </div>
          <div className="ml-4 flex-shrink-0 flex items-center gap-1">
            {usingCustom && (
              <button
                onClick={resetSize}
                title="รีเซ็ตขนาด"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "ย่อหน้าต่าง" : "ขยายหน้าต่าง"}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {expanded ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 9H4m0 0V4m0 5 6-6m5 16h5m0 0v-5m0 5-6-6" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h6m0 0v6m0-6-7 7M9 21H3m0 0v-6m0 6 7-7" />
                </svg>
              )}
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <IconX />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-8 text-slate-400">
              <IconLoader />
            </div>
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}

        {/* แถบลากปรับขนาด — ขอบขวา (กว้าง), ขอบล่าง (สูง), มุม (ทั้งคู่) วางนอกขอบเล็กน้อยกันทับแถบเลื่อน/ปุ่ม */}
        {resizable && !expanded && (
          <>
            {/* ขอบขวา → ปรับความกว้าง */}
            <div
              onMouseDown={(e) => startResize(e, "x")}
              onDoubleClick={resetSize}
              title="ลากเพื่อปรับความกว้าง"
              className="absolute top-8 bottom-8 -right-1.5 w-3 cursor-ew-resize z-20 group flex items-center justify-center"
            >
              <div className="w-1 h-12 rounded-full bg-slate-300 group-hover:bg-orange-400 transition-colors" />
            </div>
            {/* ขอบล่าง → ปรับความสูง */}
            <div
              onMouseDown={(e) => startResize(e, "y")}
              onDoubleClick={resetSize}
              title="ลากเพื่อปรับความสูง"
              className="absolute -bottom-1.5 left-8 right-8 h-3 cursor-ns-resize z-20 group flex items-center justify-center"
            >
              <div className="h-1 w-12 rounded-full bg-slate-300 group-hover:bg-orange-400 transition-colors" />
            </div>
            {/* มุมขวาล่าง → ปรับทั้งคู่ */}
            <div
              onMouseDown={(e) => startResize(e, "both")}
              onDoubleClick={resetSize}
              title="ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต"
              className="absolute -bottom-1 -right-1 w-7 h-7 cursor-nwse-resize z-30 group flex items-end justify-end p-1"
            >
              <svg className="text-slate-400 group-hover:text-orange-500 transition-colors"
                width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M13 6 6 13M13 10l-3 3M13 2 2 13" />
              </svg>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ---- ConfirmDialog ----

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  variant = "default",
  loading = false,
  requireTyped,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) setTypedValue("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const canConfirm = !requireTyped || typedValue === requireTyped;
  const isDanger = variant === "danger";
  const backdropDismiss = useBackdropDismiss(onClose);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" {...backdropDismiss} />
      <div
        className="relative w-full max-w-md bg-white rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              isDanger ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
            }`}>
              {isDanger ? <IconTrash /> : <IconCheckCircle />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <div className="text-sm text-slate-600 mt-1">{message}</div>

              {requireTyped && (
                <div className="mt-4">
                  <p className="text-xs text-slate-500 mb-1.5">
                    พิมพ์ <span className="font-mono font-bold text-slate-700">{requireTyped}</span> เพื่อยืนยัน
                  </p>
                  <input
                    type="text"
                    value={typedValue}
                    onChange={(e) => setTypedValue(e.target.value)}
                    placeholder={requireTyped}
                    className={`w-full h-9 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 font-mono ${
                      isDanger
                        ? "border-red-200 focus:ring-red-500 focus:border-transparent"
                        : "border-slate-200 focus:ring-blue-500 focus:border-transparent"
                    }`}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <button
              onClick={onClose}
              disabled={loading}
              className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || !canConfirm}
              className={`h-9 px-4 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors ${
                isDanger
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading && <IconLoader />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---- Drawer ----

export function Drawer({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  hasUnsavedChanges = false,
  storageKey = "erp-drawer-width",
  defaultWidth,
}: DrawerProps) {
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [mounted, setMounted] = useState(false);

  // F22: resizable width — ลากขอบซ้าย, จำค่าใน localStorage
  const defaultW = defaultWidth ?? (size === "sm" ? 360 : size === "lg" ? 560 : size === "xl" ? 760 : 440);
  const [width, setWidth] = useState(defaultW);
  const resizing = useRef(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setWidth(Math.max(320, Math.min(Number(saved), 1200)));
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      setWidth(Math.max(320, Math.min(window.innerWidth - e.clientX, window.innerWidth - 40)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try { localStorage.setItem(storageKey, String(width)); } catch { /* ignore */ }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [open, width, storageKey]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    if (!open) { setShowUnsavedWarning(false); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  const backdropDismiss = useBackdropDismiss(handleClose);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        {...backdropDismiss}
      />

      {/* Drawer panel (from right) — F22: resizable width */}
      <div className="relative ml-auto flex flex-col bg-white shadow-2xl h-full" style={{ width, maxWidth: "100vw" }}>
        {/* F22: resize handle (ขอบซ้าย) */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            resizing.current = true;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "ew-resize";
          }}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-transparent hover:bg-orange-300 active:bg-orange-400 transition-colors z-10 group"
          title="ลากเพื่อปรับความกว้าง"
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-300 group-hover:bg-orange-400" />
        </div>
        {/* Unsaved changes guard */}
        <UnsavedChangesDialog
          open={showUnsavedWarning}
          onStay={() => setShowUnsavedWarning(false)}
          onLeave={() => { setShowUnsavedWarning(false); onClose(); }}
        />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button
            onClick={handleClose}
            className="ml-4 flex-shrink-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ---- Approve/Reject Dialog ----

export interface ApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  onApprove: (comment?: string) => void;
  onReject: (reason: string) => void;
  documentLabel: string;
  loading?: boolean;
}

export function ApprovalDialog({
  open,
  onClose,
  onApprove,
  onReject,
  documentLabel,
  loading = false,
}: ApprovalDialogProps) {
  const [mode, setMode] = useState<"choose" | "reject">("choose");
  const [comment, setComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) { setMode("choose"); setComment(""); setRejectReason(""); }
  }, [open]);

  const backdropDismiss = useBackdropDismiss(onClose);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" {...backdropDismiss} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          {mode === "choose" ? (
            <>
              <h3 className="font-semibold text-slate-900 text-base mb-1">อนุมัติเอกสาร</h3>
              <p className="text-sm text-slate-500 mb-5">{documentLabel}</p>

              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  หมายเหตุ (ไม่บังคับ)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="ระบุหมายเหตุหรือเงื่อนไขการอนุมัติ..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 h-9 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => setMode("reject")}
                  className="flex-1 h-9 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  ปฏิเสธ
                </button>
                <button
                  onClick={() => onApprove(comment)}
                  disabled={loading}
                  className="flex-1 h-9 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {loading && <IconLoader />}
                  อนุมัติ
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-semibold text-slate-900 text-base mb-1">ปฏิเสธเอกสาร</h3>
              <p className="text-sm text-slate-500 mb-4">{documentLabel}</p>

              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  เหตุผลที่ปฏิเสธ <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="ระบุเหตุผลที่ปฏิเสธ..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setMode("choose")}
                  className="flex-1 h-9 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  กลับ
                </button>
                <button
                  onClick={() => onReject(rejectReason)}
                  disabled={!rejectReason.trim() || loading}
                  className="flex-1 h-9 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {loading && <IconLoader />}
                  ยืนยันการปฏิเสธ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
