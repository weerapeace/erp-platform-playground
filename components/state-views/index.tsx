"use client";
/**
 * สถานะหน้าจอกลาง (ของกลาง) — กำลังโหลด / ว่าง / โหลดพลาด
 * ใช้แทนกล่อง "p-12 text-center" + ไอคอน + ข้อความ + ปุ่ม ที่แต่ละหน้าเขียนเอง
 *
 *   {loading ? <LoadingState /> : error ? <ErrorState onRetry={load} /> : rows.length === 0 ? <EmptyState icon="📣" title="ยังไม่มีแคมเปญ" action={{ label: "＋ สร้าง", onClick: openCreate }} /> : …}
 *
 * - ErrorState = โหลดพลาด (ห้ามโชว์เป็น "ว่าง" หลอก ๆ) · ถ้าเป็นฐานข้อมูลล่มทั้งหน้า ใช้ ConnectionError (components/connection-error)
 * - ข้อความต้องเป็นภาษาคน · ปุ่ม action ใส่เมื่อผู้ใช้ทำต่อได้จริง (เช่น สร้างรายการแรก)
 */
import type { ReactNode } from "react";
import { useT } from "@/components/i18n";

type Action = { label: ReactNode; onClick: () => void; disabled?: boolean };

export function EmptyState({ icon, title, hint, action, tone = "neutral", className = "" }: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: Action;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border p-12 text-center ${tone === "danger" ? "border-red-200" : "border-slate-200"} ${className}`}>
      {icon != null && <div className="text-4xl mb-3">{icon}</div>}
      <p className={`font-medium ${tone === "danger" ? "text-slate-700" : "text-slate-600"}`}>{title}</p>
      {hint != null && <p className="text-slate-400 text-sm mt-1">{hint}</p>}
      {action && (
        <button type="button" onClick={action.onClick} disabled={action.disabled}
          className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">{action.label}</button>
      )}
    </div>
  );
}

export function LoadingState({ label, className = "" }: { label?: ReactNode; className?: string }) {
  const t = useT();
  return <div className={`py-16 text-center text-slate-400 ${className}`} role="status">{label ?? t("กำลังโหลด...", "Loading...")}</div>;
}

export function ErrorState({ title, hint, onRetry, retrying = false, className }: {
  title?: ReactNode;
  hint?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const t = useT();
  return (
    <EmptyState tone="danger" icon="⚠️" className={className}
      title={title ?? t("โหลดข้อมูลไม่สำเร็จ", "Failed to load")}
      hint={hint ?? t("เชื่อมต่อไม่ได้หรือเครือข่ายมีปัญหา", "Connection or network problem")}
      action={onRetry ? { label: retrying ? t("กำลังลองใหม่...", "Retrying...") : `↻ ${t("ลองใหม่", "Retry")}`, onClick: onRetry, disabled: retrying } : undefined} />
  );
}
