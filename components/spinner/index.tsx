"use client";
/**
 * Spinner + LoadingOverlay — ของกลางสำหรับสถานะ "กำลังทำงาน"
 * - Spinner: ตัวหมุนเล็ก ใส่ในปุ่ม/inline (สืบสีจาก text ปัจจุบัน)
 * - LoadingOverlay: ฉากคลุมทั้งจอ (dim + ตัวหมุน + ข้อความ) สำหรับงานที่ใช้เวลานาน — กันกดซ้ำ/ปิดหนี
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span aria-label="loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] ${className}`}
      style={{ width: size, height: size }} />
  );
}

export function LoadingOverlay({ message }: { message?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[400] bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl px-7 py-6 flex flex-col items-center gap-3 max-w-[80vw]">
        <Spinner size={34} className="text-indigo-600" />
        <p className="text-sm text-slate-600 text-center">{message ?? "กำลังทำงาน…"}</p>
      </div>
    </div>,
    document.body,
  );
}
