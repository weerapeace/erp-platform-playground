"use client";
// Loan & OD Playground — small shared UI helpers
import React from "react";
import { toneClass, type StatusMeta, type StatusTone } from "./workflow";

export function StatusChip({ meta, size = "sm" }: { meta: StatusMeta; size?: "sm" | "xs" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${toneClass(meta.tone)} ${
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

export function ToneChip({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass(tone)}`}>
      {children}
    </span>
  );
}

export function CardBox({
  title, description, right, children, className = "",
}: {
  title?: string; description?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            {title && <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>}
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm text-slate-800 mt-0.5 ${mono ? "font-mono tabular-nums" : "font-medium"}`}>{value}</p>
    </div>
  );
}

// แถบเปอร์เซ็นต์ใช้วงเงิน OD
export function UtilizationBar({ percent, tone }: { percent: number; tone: StatusTone }) {
  const barColor: Record<StatusTone, string> = {
    neutral: "bg-slate-400", info: "bg-blue-500", warning: "bg-amber-500",
    success: "bg-emerald-500", danger: "bg-red-500", purple: "bg-purple-500", muted: "bg-slate-300",
  };
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${barColor[tone]}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

// ป้ายบอกว่าเป็น mock / ยังไม่ทำ
export function MockNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
      <span className="mt-0.5">ℹ️</span>
      <span>{children}</span>
    </div>
  );
}
