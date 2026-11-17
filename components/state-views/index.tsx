"use client";
/**
 * สถานะหน้าจอกลาง (ของกลาง) — กำลังโหลด / ว่าง / โหลดพลาด
 * ใช้แทนกล่อง "p-12 text-center" + ไอคอน + ข้อความ + ปุ่ม ที่แต่ละหน้าเขียนเอง
 *
 *   {loading ? <LoadingState /> : error ? <ErrorState onRetry={load} /> : rows.length === 0 ? <EmptyState icon="📣" title="ยังไม่มีแคมเปญ" action={{ label: "＋ สร้าง", onClick: openCreate }} /> : …}
 *
 * - LoadingState (2026-11-17) = โครงสีเทา (skeleton) แทนข้อความ "กำลังโหลด..." — เห็นรูปร่างหน้าก่อนข้อมูลมา
 *     variant="list" (ค่าเริ่ม แถวรายการ) · "table" (แถวตาราง) · "cards" (การ์ดตาราง) · "text" (ข้อความแบบเดิม)
 *     rows = จำนวนแถว · label ยังใช้เป็นข้อความสำหรับโปรแกรมอ่านจอ
 * - EmptyState แนะนำทางไปต่อ: onClearFilters (ปุ่ม "ล้างตัวกรอง") · onCreate (ปุ่ม "+ สร้างใหม่") · actions (ปุ่มรองอื่น ๆ)
 * - ErrorState = โหลดพลาด (ห้ามโชว์เป็น "ว่าง" หลอก ๆ) · ถ้าเป็นฐานข้อมูลล่มทั้งหน้า ใช้ ConnectionError (components/connection-error)
 * - ข้อความต้องเป็นภาษาคน · ปุ่ม action ใส่เมื่อผู้ใช้ทำต่อได้จริง (เช่น สร้างรายการแรก)
 */
import type { ReactNode } from "react";
import { useT } from "@/components/i18n";

type Action = { label: ReactNode; onClick: () => void; disabled?: boolean };

export function EmptyState({ icon, title, hint, action, actions, onClearFilters, onCreate, createLabel, tone = "neutral", className = "" }: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: Action;
  /** ปุ่มรอง (ขอบเส้น) เช่น ไปหน้าอื่น / นำเข้า */
  actions?: Action[];
  /** มีตัวกรอง/คำค้นอยู่ → โชว์ปุ่ม "ล้างตัวกรอง" */
  onClearFilters?: () => void;
  /** โชว์ปุ่ม "+ สร้างใหม่" (ใส่เมื่อผู้ใช้มีสิทธิ์สร้าง) */
  onCreate?: () => void;
  createLabel?: ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  const t = useT();
  const primary: Action | undefined = action ?? (onCreate ? { label: createLabel ?? `＋ ${t("สร้างใหม่", "Create new")}`, onClick: onCreate } : undefined);
  const secondary: Action[] = [
    ...(onClearFilters ? [{ label: t("ล้างตัวกรอง", "Clear filters"), onClick: onClearFilters }] : []),
    ...(action && onCreate ? [{ label: createLabel ?? `＋ ${t("สร้างใหม่", "Create new")}`, onClick: onCreate }] : []),
    ...(actions ?? []),
  ];
  return (
    <div className={`bg-white rounded-xl border p-12 text-center ${tone === "danger" ? "border-red-200" : "border-slate-200"} ${className}`}>
      {icon != null && <div className="text-4xl mb-3">{icon}</div>}
      <p className={`font-medium ${tone === "danger" ? "text-slate-700" : "text-slate-600"}`}>{title}</p>
      {hint != null && <p className="text-slate-400 text-sm mt-1">{hint}</p>}
      {(primary || secondary.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {secondary.map((a, i) => (
            <button key={i} type="button" onClick={a.onClick} disabled={a.disabled}
              className="h-9 px-4 border border-slate-300 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">{a.label}</button>
          ))}
          {primary && (
            <button type="button" onClick={primary.onClick} disabled={primary.disabled}
              className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">{primary.label}</button>
          )}
        </div>
      )}
    </div>
  );
}

/** แท่งสีเทากะพริบ — ชิ้นเล็กสุดของโครง skeleton (ใช้ประกอบเองได้) */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200/80 ${className}`} />;
}

const W = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-1/3"];

/** โครงสีเทาสำเร็จรูป: list / table / cards */
export function SkeletonRows({ variant = "list", rows = 5 }: { variant?: "list" | "table" | "cards"; rows?: number }) {
  if (variant === "cards") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-100 p-3">
            <SkeletonBar className="mb-3 aspect-square w-full" />
            <SkeletonBar className={`h-3 ${W[i % W.length]}`} />
            <SkeletonBar className="mt-2 h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "table") {
    return (
      <div className="space-y-2">
        <SkeletonBar className="h-8 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <SkeletonBar className="h-6 w-1/6" />
            <SkeletonBar className="h-6 flex-1" />
            <SkeletonBar className="h-6 w-1/5" />
            <SkeletonBar className="h-6 w-1/6" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBar className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <SkeletonBar className={`h-3 ${W[i % W.length]}`} />
            <SkeletonBar className={`h-3 ${W[(i + 2) % W.length]} opacity-70`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ label, className = "", variant, rows = 4, boxClassName }: {
  label?: ReactNode;
  className?: string;
  /** แบบข้อความ: ใช้คลาสนี้แทนกล่องมาตรฐานทั้งชุด (คงหน้าตาเดิมของหน้าที่ย้ายมาใช้ของกลาง) */
  boxClassName?: string;
  /** "text" = ข้อความแบบเดิม · อื่น ๆ = โครงสีเทา
   *  ไม่ระบุ: ไม่มี label = โครง "list" · มี label (ข้อความรอเฉพาะ เช่น "กำลังเตรียมข้อมูลส่ง Shopee") = ข้อความเหมือนเดิม */
  variant?: "list" | "table" | "cards" | "text";
  rows?: number;
}) {
  const t = useT();
  const text = label ?? t("กำลังโหลด...", "Loading...");
  const mode = variant ?? (label != null ? "text" : "list");
  if (mode === "text") return <div className={boxClassName ?? `py-16 text-center text-slate-400 ${className}`} role="status">{text}</div>;
  return (
    <div className={`px-4 py-6 ${className}`} role="status" aria-busy="true">
      <span className="sr-only">{text}</span>
      <SkeletonRows variant={mode} rows={rows} />
    </div>
  );
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
