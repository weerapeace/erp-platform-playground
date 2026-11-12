"use client";

import React from "react";
import { Icon } from "@/components/icon";
import { ACTION_GROUP_BY_KEY, describeAudit, type AuditGroupDef, type AuditView } from "@/lib/audit-format";

// ============================================================
// ActivityFeed — แสดงประวัติ (audit log) แบบ timeline (component กลาง)
// ใช้ได้ทั้งหน้า admin (log ทั้งระบบ) และ drawer/กล่องประวัติของรายการเดียว
// แต่ละแถวบอก: ใคร · ทำอะไร · ที่ไหน (ถ้า showWhere) · รายการไหน · เปลี่ยนจากอะไรเป็นอะไร
// ตัวแปลข้อมูล = lib/audit-format (อ่านได้ทุกรูปแบบที่ระบบเคยจด) · API ส่ง view มาแล้ว (ซ่อนค่าตามสิทธิ์)
// ============================================================

export type ActivityEntry = {
  id:          string;
  action:      string;   // create | update | delete | ...
  entity_type: string;
  entity_id:   string | null;
  actor_name:  string;
  metadata:    Record<string, unknown>;
  created_at:  string;
  /** ผลแปลจาก API (ถ้าไม่มี จะแปลเองฝั่งหน้าจอ — ไม่มีชื่อช่องจากทะเบียน/ไม่ได้ซ่อนค่าตามสิทธิ์) */
  view?:       AuditView;
};

// ---- สีตามกลุ่มการกระทำ (literal ให้ Tailwind เห็น) ----

const TONE: Record<AuditGroupDef["tone"], { dot: string; chip: string }> = {
  success: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  accent:  { dot: "bg-blue-500",    chip: "bg-blue-50 text-blue-700 border-blue-200" },
  warning: { dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200" },
  danger:  { dot: "bg-red-500",     chip: "bg-red-50 text-red-700 border-red-200" },
  neutral: { dot: "bg-slate-400",   chip: "bg-slate-50 text-slate-600 border-slate-200" },
};

// ---- เวลา ----

function relativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60)    return "เมื่อสักครู่";
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
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
  showWhere = false,
  compact = false,
  hideRecord = false,
  onOpenRecord,
  renderDetail,
}: {
  entries: ActivityEntry[];
  loading?: boolean;
  emptyMessage?: string;
  /** แสดงเลขเอกสาร/ชื่อรายการบนหัวแถว (หน้า log รวม) */
  showEntityName?: boolean;
  /** แสดง "โมดูล · หน้า" (หน้า log รวมทั้งระบบ) */
  showWhere?: boolean;
  compact?: boolean;
  /** ไม่ต้องโชว์ชื่อรายการ (ใช้ในกล่องประวัติของรายการเดียว — รู้อยู่แล้วว่ารายการไหน) */
  hideRecord?: boolean;
  /** กดชื่อรายการ → เปิดประวัติของรายการนั้น (ไม่ส่ง = เป็นข้อความเฉย ๆ) */
  onOpenRecord?: (entry: ActivityEntry, view: AuditView) => void;
  /** ส่วนเสริมใต้แถว (หน้าที่ใช้ใส่เองได้ เช่น ประวัติไฟล์ = กล่อง "ลงระบบ ERP" + รูปย่อ) · คืน null = ไม่มี */
  renderDetail?: (entry: ActivityEntry, view: AuditView) => React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="กำลังโหลดประวัติ">
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
    return <div className="text-center py-8 text-sm text-slate-400">{emptyMessage}</div>;
  }

  return (
    <ol className="relative">
      {entries.map((entry, idx) => (
        <FeedRow key={entry.id} entry={entry} isLast={idx === entries.length - 1}
          showEntityName={showEntityName} showWhere={showWhere} compact={compact} hideRecord={hideRecord} onOpenRecord={onOpenRecord} renderDetail={renderDetail} />
      ))}
    </ol>
  );
}

function FeedRow({ entry, isLast, showEntityName, showWhere, compact, hideRecord, onOpenRecord, renderDetail }: {
  entry: ActivityEntry; isLast: boolean; showEntityName: boolean; showWhere: boolean; compact: boolean; hideRecord: boolean;
  onOpenRecord?: (entry: ActivityEntry, view: AuditView) => void;
  renderDetail?: (entry: ActivityEntry, view: AuditView) => React.ReactNode;
}) {
  const v = entry.view ?? describeAudit(entry);
  const g = ACTION_GROUP_BY_KEY[v.group];
  const tone = TONE[g.tone];
  const recordText = [v.recordCode, v.recordName].filter(Boolean).join(" · ");
  const canOpen = !!onOpenRecord && !!entry.entity_id;

  const record = recordText ? (
    canOpen ? (
      <button type="button" onClick={() => onOpenRecord?.(entry, v)}
        className="text-sm font-medium text-blue-700 hover:underline underline-offset-2 truncate max-w-full text-left"
        title="ดูประวัติทั้งหมดของรายการนี้">
        {recordText}
      </button>
    ) : <span className="text-sm font-medium text-slate-800 truncate">{recordText}</span>
  ) : null;

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200" aria-hidden />}

      <span className={`relative z-10 w-7 h-7 rounded-full ${tone.dot} text-white flex items-center justify-center text-sm shrink-0`}>
        <Icon name={g.icon} mode="line" size={15} strokeWidth={2.2} />
      </span>

      <div className="flex-1 min-w-0 pt-0.5">
        {/* หัวแถว: ทำอะไร · ที่ไหน · รายการไหน · เมื่อไหร่ */}
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
          {showWhere && <span className="text-sm font-semibold text-slate-800">{entry.actor_name}</span>}
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${tone.chip}`}>{v.verb}</span>
          {showWhere && <span className="text-xs text-slate-500">{v.moduleLabel} · {v.page}</span>}
          {(showEntityName || showWhere) && record}
          {!recordText && canOpen && showWhere && (
            <button type="button" onClick={() => onOpenRecord?.(entry, v)} className="text-xs text-blue-700 hover:underline">ดูประวัติรายการนี้</button>
          )}
          <span className="text-xs text-slate-400 ml-auto shrink-0" title={fmtFull(entry.created_at)}>
            {compact ? relativeTime(entry.created_at) : fmtFull(entry.created_at)}
          </span>
        </div>

        {/* ชื่อรายการ (ถ้าหัวแถวไม่ได้โชว์) */}
        {!showEntityName && !showWhere && !hideRecord && recordText && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{recordText}</p>
        )}

        {/* เปลี่ยนจากอะไรเป็นอะไร */}
        {v.changes.length > 0 && (
          <div className={`mt-1.5 grid grid-cols-[minmax(80px,auto)_1fr] gap-x-3 gap-y-0.5 text-xs ${compact ? "" : "bg-slate-50 rounded-lg px-2.5 py-2"}`}>
            {v.changes.map((c) => (
              <React.Fragment key={c.field}>
                <span className="font-medium text-slate-600 truncate" title={c.field}>{c.label}</span>
                {c.hidden ? (
                  <span className="text-slate-400 inline-flex items-center gap-1">
                    <Icon name="lock" size={12} /> ซ่อนค่า — คุณไม่มีสิทธิ์ดูช่องนี้
                  </span>
                ) : (
                  <span className="text-slate-500 min-w-0 break-words">
                    {c.hasOld && <><span className="line-through text-slate-400">{c.old}</span><span className="mx-1 text-slate-400">→</span></>}
                    {!c.hasOld && <span className="text-slate-400 mr-1">ตั้งเป็น</span>}
                    <span className="text-slate-800 font-medium">{c.new}</span>
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* รู้แค่ว่าแก้ช่องไหน (ประวัติเก่า ไม่ได้จดค่าเดิม) */}
        {v.fieldsOnly.length > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            แก้ช่อง: <span className="text-slate-700">{v.fieldsOnly.slice(0, 8).join(", ")}{v.fieldsOnly.length > 8 ? ` และอีก ${v.fieldsOnly.length - 8} ช่อง` : ""}</span>
            {v.changes.length === 0 && !(v.detailFields?.length) && <span className="text-slate-400"> · ตอนนั้นระบบยังไม่ได้จดค่าเดิม</span>}
          </p>
        )}

        {/* ช่องก้อนข้อมูลภายใน (ตั้งค่า/รูปที่ส่งเข้าสินค้า/ลิงก์ชุด) — ตั้งใจจดแค่ว่าแก้ ดูค่าจริงในหน้ารายการ */}
        {(v.detailFields?.length ?? 0) > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            แก้รายละเอียด: <span className="text-slate-700">{v.detailFields.slice(0, 8).join(", ")}</span>
            <span className="text-slate-400"> · ดูค่าล่าสุดในหน้ารายการ</span>
          </p>
        )}

        {/* รายละเอียดอื่นที่จดไว้ */}
        {v.extras.length > 0 && (
          <p className="text-xs text-slate-500 mt-0.5">
            {v.extras.map((x, i) => (
              <span key={x.label + i}>
                {i > 0 && <span className="text-slate-300"> · </span>}
                {x.label} {x.hidden ? <span className="text-slate-400">(ซ่อน)</span> : <span className="text-slate-700">{x.value}</span>}
              </span>
            ))}
          </p>
        )}

        {renderDetail?.(entry, v)}

        {!showWhere && <p className="text-xs text-slate-400 mt-0.5">โดย {entry.actor_name}</p>}
      </div>
    </li>
  );
}
