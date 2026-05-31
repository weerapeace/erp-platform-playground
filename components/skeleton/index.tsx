/**
 * Skeleton กลาง — loading state placeholders
 *
 * **Rule**: ทุก loading state ต้องใช้ component พวกนี้
 * ห้ามใช้ `<div className="animate-pulse bg-slate-100" />` เอง — แก้ที่นี่ที่เดียว
 *
 * - <Skeleton /> = แท่งสี่เหลี่ยม
 * - <SkeletonCircle /> = วงกลม (avatar)
 * - <SkeletonText /> = หลายบรรทัด (paragraph)
 * - <SkeletonTable /> = ตารางทั้งหมด
 * - <SkeletonCard /> = card layout
 * - <SkeletonForm /> = form fields
 */

import React from "react";

const BASE = "bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%] animate-shimmer rounded";

// ============================================================
// Atom
// ============================================================

export function Skeleton({
  width, height, className = "",
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <div className={`${BASE} ${className}`}
      style={{ width: width ?? "100%", height: height ?? 16 }}
      aria-hidden="true" />
  );
}

export function SkeletonCircle({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`${BASE} rounded-full ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true" />
  );
}

// ============================================================
// Patterns
// ============================================================

/** หลายบรรทัด (paragraph) — สุดท้ายสั้นกว่า */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-busy="true" aria-label="กำลังโหลด...">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

/** ตาราง — header + N rows */
export function SkeletonTable({
  rows = 5, cols = 5, showHeader = true,
}: {
  rows?: number; cols?: number; showHeader?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" aria-busy="true" aria-label="กำลังโหลดตาราง">
      {showHeader && (
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex gap-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} height={12} width={`${100 / cols - 3}%`} />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3 border-b border-slate-100 last:border-0 flex gap-3 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={14}
              width={c === 0 ? "8%" : c === cols - 1 ? "12%" : `${(76 / (cols - 2)) - 2}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card grid placeholder */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 space-y-3 ${className}`} aria-busy="true">
      <div className="flex items-center gap-3">
        <SkeletonCircle size={40} />
        <div className="flex-1 space-y-1.5">
          <Skeleton height={14} width="60%" />
          <Skeleton height={11} width="40%" />
        </div>
      </div>
      <Skeleton height={120} />
      <SkeletonText lines={2} />
    </div>
  );
}

/** N cards in grid */
export function SkeletonCardGrid({
  count = 6, columns = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}: { count?: number; columns?: string }) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

/** Form drawer fields */
export function SkeletonForm({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดฟอร์ม">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton height={10} width="30%" />
          <Skeleton height={36} />
        </div>
      ))}
    </div>
  );
}

/** Detail drawer (header info + lines + totals) */
export function SkeletonDetail() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดรายละเอียด">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton height={10} width="40%" />
            <Skeleton height={16} width="80%" />
          </div>
        ))}
      </div>
      <SkeletonTable rows={4} cols={6} />
      <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton height={12} width="40%" />
            <Skeleton height={12} width="30%" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sidebar nav placeholder */
export function SkeletonNav({ items = 8 }: { items?: number }) {
  return (
    <div className="space-y-1.5 px-2" aria-busy="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <SkeletonCircle size={16} />
          <Skeleton height={10} width={`${50 + Math.random() * 40}%`} />
        </div>
      ))}
    </div>
  );
}
