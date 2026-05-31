/**
 * Brand kit กลาง — Logo + Wordmark + Tokens
 *
 * ใช้ที่เดียว เปลี่ยนทั้งระบบ
 */

import React from "react";

// ============================================================
// Brand tokens
// ============================================================

export const BRAND = {
  name:        "ERP Platform",
  tagline:     "ระบบ ERP จากศูนย์ที่ใช้ของกลางร่วมกัน",
  shortName:   "ERP",
  // primary palette (Tailwind orange-500 / orange-700 / amber-500)
  primary:     "#f97316",   // orange-500
  primaryDark: "#c2410c",   // orange-700
  accent:      "#f59e0b",   // amber-500 (cuter pop for gradient)
  // social/og
  description: "ERP Platform — Universal table, form, picker, workflow, approval, audit สำหรับทุกโมดูล",
};

// ============================================================
// Logo (SVG inline) — รูปแบบ "block" + "ERP" wordmark
// ใช้ currentColor สำหรับสีหลัก → ปรับสีจาก parent ได้
// ============================================================

export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={BRAND.name}
    >
      {/* outer rounded square */}
      <rect x="2" y="2" width="44" height="44" rx="10" fill="url(#brand-grad)" />
      {/* 4 inner squares เป็น metaphor ของ "ของกลางที่ใช้ร่วม" */}
      <rect x="11" y="11" width="10" height="10" rx="2" fill="white" fillOpacity="0.95" />
      <rect x="27" y="11" width="10" height="10" rx="2" fill="white" fillOpacity="0.7" />
      <rect x="11" y="27" width="10" height="10" rx="2" fill="white" fillOpacity="0.7" />
      <rect x="27" y="27" width="10" height="10" rx="2" fill="white" fillOpacity="0.95" />
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor={BRAND.primary} />
          <stop offset="1" stopColor={BRAND.accent} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ============================================================
// Wordmark — Logo + ชื่อแบรนด์
// ============================================================

export function Wordmark({
  size = 28, showTagline = false, className = "",
}: {
  size?: number; showTagline?: boolean; className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} />
      <div className="leading-tight">
        <div className="font-bold text-slate-900" style={{ fontSize: size * 0.55 }}>
          {BRAND.name}
        </div>
        {showTagline && (
          <div className="text-slate-500" style={{ fontSize: size * 0.32 }}>
            {BRAND.tagline}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Favicon SVG (returns string, ใช้ใน app/icon.tsx)
// ============================================================

export const FAVICON_SVG = `<svg width="32" height="32" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="44" height="44" rx="10" fill="${BRAND.primary}"/>
  <rect x="11" y="11" width="10" height="10" rx="2" fill="white" fill-opacity="0.95"/>
  <rect x="27" y="11" width="10" height="10" rx="2" fill="white" fill-opacity="0.7"/>
  <rect x="11" y="27" width="10" height="10" rx="2" fill="white" fill-opacity="0.7"/>
  <rect x="27" y="27" width="10" height="10" rx="2" fill="white" fill-opacity="0.95"/>
</svg>`;
