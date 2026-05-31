"use client";

import React from "react";

// ============================================================
// ActivityFeed — แสดง audit log แบบ timeline (component กลาง)
// ใช้ได้ทั้งหน้า admin (log ทั้งระบบ) และ drawer (เฉพาะ record)
// ============================================================

export type ActivityEntry = {
  id:          string;
  action:      string;   // create | update | delete
  entity_type: string;
  entity_id:   string | null;
  actor_name:  string;
  metadata:    Record<string, unknown>;
  created_at:  string;
};

// ---- Action config ----

const ACTION_CONFIG: Record<string, { label: string; icon: string; dot: string; chip: string }> = {
  create: { label: "เพิ่ม",  icon: "＋", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  update: { label: "แก้ไข", icon: "✎", dot: "bg-blue-500",    chip: "bg-blue-50 text-blue-700 border-blue-200" },
  delete: { label: "ลบ",    icon: "🗑", dot: "bg-red-500",     chip: "bg-red-50 text-red-700 border-red-200" },
};

function actionCfg(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, icon: "•", dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200" };
}

// ---- field label map (ภาษาไทย) ----

const FIELD_LABELS: Record<string, string> = {
  sku: "SKU", name: "ชื่อสินค้า", category_name: "หมวดหมู่",
  brand_name: "แบรนด์", seller_name: "ผู้จำหน่าย", uom_name: "หน่วย",
  color: "สี", list_price: "ราคาขาย", cost_price: "ราคาต้นทุน",
  stock_on_hand: "STOCK", active: "สถานะ", note: "หมายเหตุ",
};

// fields ที่ไม่ต้องแสดงใน diff
const SKIP_DIFF = new Set(["updated_at", "created_at", "id"]);

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "ว่าง";
  if (typeof v === "boolean") return v ? "เปิด" : "ปิด";
  if (typeof v === "number")  return v.toLocaleString("th-TH");
  // pseudo-field lines: {count, total}
  if (typeof v === "object" && v !== null && "count" in v && "total" in v) {
    const o = v as { count: number; total: number };
    return `${o.count} รายการ · ฿${Number(o.total).toLocaleString("th-TH")}`;
  }
  return String(v);
}

// คำนวณ field ที่เปลี่ยน
// 1) Format ใหม่: metadata.changes = [{field, label, old, new}, ...]
// 2) Format เก่า: metadata.before / metadata.after (backward compat)
function computeDiff(metadata: Record<string, unknown>): { field: string; from: string; to: string }[] {
  // ใหม่ — changes[]
  const changes = metadata.changes;
  if (Array.isArray(changes)) {
    return changes.map(c => {
      const o = c as { field?: string; label?: string; old?: unknown; new?: unknown };
      return {
        field: o.label ?? FIELD_LABELS[o.field ?? ""] ?? o.field ?? "",
        from:  fmtVal(o.old),
        to:    fmtVal(o.new),
      };
    });
  }
  // เก่า — before/after
  const before = metadata.before as Record<string, unknown> | undefined;
  const after  = metadata.after  as Record<string, unknown> | undefined;
  if (!before || !after) return [];
  const diffs: { field: string; from: string; to: string }[] = [];
  for (const key of Object.keys(after)) {
    if (SKIP_DIFF.has(key)) continue;
    if (String(before[key] ?? "") !== String(after[key] ?? "")) {
      diffs.push({
        field: FIELD_LABELS[key] ?? key,
        from:  fmtVal(before[key]),
        to:    fmtVal(after[key]),
      });
    }
  }
  return diffs;
}

// แสดงชื่อ entity จาก metadata
function entityName(metadata: Record<string, unknown>): string | null {
  if (typeof metadata.name === "string") return metadata.name;
  const after = metadata.after as Record<string, unknown> | undefined;
  if (after && typeof after.name === "string") return after.name;
  return null;
}

// ---- relative time ----

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60)    return "เมื่อสักครู่";
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ============================================================
// Component
// ============================================================

export function ActivityFeed({
  entries,
  loading,
  emptyMessage = "ยังไม่มีประวัติ",
  showEntityName = false,
  compact = false,
}: {
  entries: ActivityEntry[];
  loading?: boolean;
  emptyMessage?: string;
  /** แสดงชื่อ entity ในแต่ละรายการ (สำหรับหน้า log รวม) */
  showEntityName?: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-1.5 pt-1">
              <div className="h-3 w-1/2 bg-slate-200 rounded" />
              <div className="h-2.5 w-1/3 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">{emptyMessage}</div>
    );
  }

  return (
    <ol className="relative">
      {entries.map((entry, idx) => {
        const cfg   = actionCfg(entry.action);
        const diffs = entry.action === "update" ? computeDiff(entry.metadata) : [];
        const name  = entityName(entry.metadata);
        const isLast = idx === entries.length - 1;

        return (
          <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Timeline line */}
            {!isLast && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200" />}

            {/* Dot */}
            <span className={`relative z-10 w-7 h-7 rounded-full ${cfg.dot} text-white flex items-center justify-center text-xs shrink-0`}>
              {cfg.icon}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${cfg.chip}`}>{cfg.label}</span>
                {showEntityName && name && (
                  <span className="text-sm font-medium text-slate-800 truncate">{name}</span>
                )}
                <span className="text-xs text-slate-400" title={fmtFull(entry.created_at)}>
                  {relativeTime(entry.created_at)}
                </span>
              </div>

              {/* Diff (update) */}
              {diffs.length > 0 && (
                <div className={`mt-1.5 space-y-0.5 ${compact ? "" : "bg-slate-50 rounded-lg p-2"}`}>
                  {diffs.map((d, i) => (
                    <div key={i} className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-slate-600">{d.field}:</span>
                      <span className="line-through text-slate-400">{d.from}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-slate-700 font-medium">{d.to}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* create/delete name (เมื่อไม่ได้ show ด้านบน) */}
              {!showEntityName && name && entry.action !== "update" && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{name}</p>
              )}

              {/* actor */}
              <p className="text-xs text-slate-400 mt-0.5">โดย {entry.actor_name}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
