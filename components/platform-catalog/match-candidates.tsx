"use client";

/**
 * กล่อง "จับคู่กับสินค้าในระบบ" — คู่ที่ระบบเดา (กดเลือกได้) + ค้นหาเอง (ParentSkuPicker)
 * ใช้ร่วม: หน้าสินค้าบนแพลตฟอร์ม (กางในแถว + ป๊อปรายละเอียด) · โหมดจับคู่ทีละตัว
 * กล่องนี้ไม่บันทึกเอง — ส่งตัวที่เลือกกลับ (onPick) ให้หน้าบันทึกผ่าน /api/platform-catalog/match
 */

import { useState } from "react";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { HIGH_CONFIDENCE, type MatchSuggestion } from "@/lib/platform-match-suggest";

export type PickedParent = { id: string; code: string; name: string | null };

/** สีตามความมั่นใจ — ใช้ร่วมกับป้ายในตาราง */
export function scoreClass(score: number): { bar: string; text: string } {
  if (score >= HIGH_CONFIDENCE) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (score >= 60) return { bar: "bg-sky-500", text: "text-sky-700" };
  return { bar: "bg-slate-300", text: "text-slate-500" };
}

export function MatchCandidates({ suggestions, loading, currentId, canEdit, busy, onPick, onUnmatch, numbered }: {
  suggestions?: MatchSuggestion[];
  loading?: boolean;
  /** คู่ปัจจุบัน (ถ้าจับคู่แล้ว) */
  currentId?: string | null;
  canEdit: boolean;
  busy?: boolean;
  onPick: (p: PickedParent) => void;
  onUnmatch?: () => void;
  /** โชว์เลข 1-3 หน้าคู่ที่เดา (คีย์ลัดในโหมดจับคู่ทีละตัว) */
  numbered?: boolean;
}) {
  const [pick, setPick] = useState<ParentSkuPickerValue | null>(null);
  const list = suggestions ?? [];
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">
        {loading ? "กำลังเดาคู่ให้…" : list.length ? "ระบบเดาว่าน่าจะเป็น" : "ระบบเดาไม่ได้ — ค้นหาเองด้านล่าง"}
      </div>
      {list.map((s, i) => {
        const sc = scoreClass(s.score);
        const isCurrent = !!currentId && s.parent_sku_id === currentId;
        return (
          <div key={s.parent_sku_id} className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-lg px-2.5 py-2">
            {numbered && <span className="w-6 h-6 shrink-0 rounded-md bg-slate-100 text-xs text-slate-500 flex items-center justify-center">{i + 1}</span>}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-800 truncate" title={s.name ?? ""}><span className="font-mono font-semibold">{s.code}</span>{s.name ? <span className="text-slate-500"> · {s.name}</span> : null}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${sc.bar}`} style={{ width: `${s.score}%` }} /></div>
                <span className={`text-[11px] ${sc.text}`}>{s.score}% · {s.reason}</span>
              </div>
            </div>
            {isCurrent
              ? <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0">คู่ปัจจุบัน</span>
              : canEdit && (
                <button type="button" disabled={busy} onClick={() => onPick({ id: s.parent_sku_id, code: s.code, name: s.name })}
                  className={`h-8 px-3 text-sm rounded-lg shrink-0 disabled:opacity-50 ${i === 0 && s.score >= HIGH_CONFIDENCE ? "text-white bg-emerald-600 hover:bg-emerald-700" : "text-slate-700 border border-slate-200 bg-white hover:bg-slate-50"}`}>
                  {busy ? "…" : "เลือกตัวนี้"}
                </button>
              )}
          </div>
        );
      })}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[220px]">
            <ParentSkuPicker value={pick} disabled={busy} disableCreate placeholder="หรือค้นหาสินค้าในระบบ (รหัส/ชื่อ)..."
              onChange={(v) => { setPick(null); if (v) onPick({ id: v.id, code: v.code, name: v.name }); }} />
          </div>
          {currentId && onUnmatch && (
            <button type="button" disabled={busy} onClick={onUnmatch} className="h-8 px-3 text-xs text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50">ยกเลิกจับคู่</button>
          )}
        </div>
      ) : <p className="text-xs text-amber-600">ไม่มีสิทธิ์แก้ไข (ดูได้อย่างเดียว)</p>}
    </div>
  );
}
