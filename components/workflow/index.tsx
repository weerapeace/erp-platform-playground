"use client";

import React from "react";

// ---- Types ----

export type PRStatus =
  | "draft"
  | "submitted"
  | "waiting_approval"
  | "approved"
  | "rejected"
  | "cancelled";

export type WorkflowAction = {
  id: string;
  label: string;
  labelTH: string;
  toStatus: PRStatus;
  variant: "primary" | "success" | "danger" | "warning" | "ghost";
  requiresComment?: boolean;
  requiresReason?: boolean;
  confirmText?: string;
  icon: string;
};

export type ActivityEntry = {
  id: string;
  actor: string;
  role: string;
  action: string;
  fromStatus?: PRStatus;
  toStatus?: PRStatus;
  comment?: string;
  timestamp: string;
};

// ---- Status config ----

export const STATUS_CONFIG: Record<PRStatus, {
  label: string;
  labelTH: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
  step: number;
}> = {
  draft:            { label: "Draft",            labelTH: "ร่าง",              color: "text-slate-600",   bg: "bg-slate-100",   border: "border-slate-300",   icon: "✏️",  step: 1 },
  submitted:        { label: "Submitted",        labelTH: "ส่งแล้ว",           color: "text-blue-700",    bg: "bg-blue-100",    border: "border-blue-300",    icon: "📤", step: 2 },
  waiting_approval: { label: "Waiting Approval", labelTH: "รออนุมัติ",          color: "text-amber-700",   bg: "bg-amber-100",   border: "border-amber-300",   icon: "⏳", step: 3 },
  approved:         { label: "Approved",         labelTH: "อนุมัติแล้ว",        color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-300", icon: "✅", step: 4 },
  rejected:         { label: "Rejected",         labelTH: "ถูกปฏิเสธ",          color: "text-red-700",     bg: "bg-red-100",     border: "border-red-300",     icon: "❌", step: 4 },
  cancelled:        { label: "Cancelled",        labelTH: "ยกเลิกแล้ว",         color: "text-slate-500",   bg: "bg-slate-100",   border: "border-slate-300",   icon: "🚫", step: 4 },
};

// ---- Transitions (what actions are available from each status) ----

export const STATUS_ACTIONS: Record<PRStatus, WorkflowAction[]> = {
  draft: [
    {
      id: "submit",
      label: "Submit", labelTH: "ส่งใบขอซื้อ",
      toStatus: "submitted",
      variant: "primary",
      icon: "📤",
    },
    {
      id: "cancel",
      label: "Cancel", labelTH: "ยกเลิก",
      toStatus: "cancelled",
      variant: "ghost",
      requiresReason: true,
      icon: "🚫",
    },
  ],
  submitted: [
    {
      id: "send_approval",
      label: "Send to Approval", labelTH: "ส่งอนุมัติ",
      toStatus: "waiting_approval",
      variant: "warning",
      icon: "⏳",
    },
    {
      id: "cancel",
      label: "Cancel", labelTH: "ยกเลิก",
      toStatus: "cancelled",
      variant: "ghost",
      requiresReason: true,
      icon: "🚫",
    },
  ],
  waiting_approval: [
    {
      id: "approve",
      label: "Approve", labelTH: "อนุมัติ",
      toStatus: "approved",
      variant: "success",
      requiresComment: true,
      icon: "✅",
    },
    {
      id: "reject",
      label: "Reject", labelTH: "ปฏิเสธ",
      toStatus: "rejected",
      variant: "danger",
      requiresReason: true,
      icon: "❌",
    },
  ],
  approved:  [],
  rejected:  [],
  cancelled: [],
};

// ---- Utility ----

export function getAvailableActions(status: PRStatus): WorkflowAction[] {
  return STATUS_ACTIONS[status] ?? [];
}

export function isTerminalStatus(status: PRStatus): boolean {
  return ["approved", "rejected", "cancelled"].includes(status);
}

// ---- Components ----

export function WorkflowStatusBadge({ status }: { status: PRStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span>{cfg.icon}</span>
      {cfg.labelTH}
    </span>
  );
}

interface WorkflowDiagramProps {
  currentStatus: PRStatus;
}

export function WorkflowDiagram({ currentStatus }: WorkflowDiagramProps) {
  const mainFlow: PRStatus[] = ["draft", "submitted", "waiting_approval", "approved"];
  const currentStep = STATUS_CONFIG[currentStatus].step;
  const isRejected = currentStatus === "rejected";
  const isCancelled = currentStatus === "cancelled";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {mainFlow.map((status, idx) => {
        const cfg = STATUS_CONFIG[status];
        const stepNum = cfg.step;
        const isActive = currentStatus === status;
        const isDone = !isRejected && !isCancelled && currentStep > stepNum;
        const isFuture = !isDone && !isActive;

        return (
          <React.Fragment key={status}>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              isActive
                ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current`
                : isDone
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                  : "bg-slate-50 text-slate-400 border-slate-200"
            }`}>
              <span>{isDone ? "✅" : cfg.icon}</span>
              {cfg.labelTH}
            </div>
            {idx < mainFlow.length - 1 && (
              <span className={`text-xs ${isDone ? "text-emerald-400" : "text-slate-300"}`}>→</span>
            )}
          </React.Fragment>
        );
      })}
      {(isRejected || isCancelled) && (
        <>
          <span className="text-xs text-slate-300 mx-1">|</span>
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ring-2 ring-offset-1 ring-current ${
            STATUS_CONFIG[currentStatus].bg
          } ${STATUS_CONFIG[currentStatus].color} ${STATUS_CONFIG[currentStatus].border}`}>
            <span>{STATUS_CONFIG[currentStatus].icon}</span>
            {STATUS_CONFIG[currentStatus].labelTH}
          </div>
        </>
      )}
    </div>
  );
}

interface ActivityTimelineProps {
  entries: ActivityEntry[];
}

export function ActivityTimeline({ entries }: ActivityTimelineProps) {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-400 italic">ยังไม่มีประวัติการดำเนินการ</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <div key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0">
              {entry.actor.charAt(0)}
            </div>
            {idx < entries.length - 1 && (
              <div className="w-0.5 h-full bg-slate-100 mt-1" />
            )}
          </div>
          <div className="pb-4 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800">{entry.actor}</span>
              <span className="text-xs text-slate-400">{entry.role}</span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs text-slate-400">{entry.timestamp}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-xs text-slate-600">{entry.action}</span>
              {entry.toStatus && (
                <>
                  <span className="text-xs text-slate-400">→</span>
                  <WorkflowStatusBadge status={entry.toStatus} />
                </>
              )}
            </div>
            {entry.comment && (
              <div className="mt-1 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600 italic">
                &ldquo;{entry.comment}&rdquo;
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
