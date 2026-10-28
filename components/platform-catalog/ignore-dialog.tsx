"use client";

/**
 * ป๊อป "ไม่ต้องจับคู่" — เลือกเหตุผล (หรือพิมพ์เอง) แล้วยืนยัน
 * ใช้ร่วม: ปุ่มในแถว · ป๊อปรายละเอียด · โหมดจับคู่ทีละตัว · ติ๊กหลายตัว (แถบล่าง)
 * เกิน 100 รายการต้องพิมพ์ "ยืนยัน" (กฎ bulk) · ไม่บันทึกเอง — onConfirm(reason) ให้หน้าเรียก /api/platform-catalog/ignore
 */

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";

export const IGNORE_REASONS = ["งานบริการ/รับผลิต", "เลิกขายแล้ว", "สินค้าซ้ำบนร้าน", "ชุด/โปรโมชัน (ไม่มีสินค้าเดี่ยว)"];
const OTHER = "__other";
const LAST_KEY = "platform-catalog:ignore-reason";
const TYPED_OVER = 100;
const TYPED_WORD = "ยืนยัน";

export function IgnoreDialog({ open, count, sample, busy, onClose, onConfirm }: {
  open: boolean;
  /** จำนวนรายการที่จะตั้งว่าไม่ต้องจับคู่ */
  count: number;
  /** ชื่อสินค้าตัวอย่าง (โชว์ไม่เกิน 5) */
  sample?: string[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [pick, setPick] = useState(IGNORE_REASONS[0]);
  const [other, setOther] = useState("");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let last = "";
    try { last = localStorage.getItem(LAST_KEY) ?? ""; } catch { /* โหมดส่วนตัว */ }
    if (last && !IGNORE_REASONS.includes(last)) { setPick(OTHER); setOther(last); }
    else { setPick(last || IGNORE_REASONS[0]); setOther(""); }
    setTyped(""); setErr(null);
  }, [open]);

  const needTyped = count > TYPED_OVER;
  const submit = () => {
    const reason = (pick === OTHER ? other : pick).trim();
    if (!reason) { setErr("พิมพ์เหตุผลก่อน"); return; }
    if (needTyped && typed.trim() !== TYPED_WORD) { setErr(`พิมพ์คำว่า "${TYPED_WORD}" เพื่อยืนยัน ${count.toLocaleString()} รายการ`); return; }
    try { localStorage.setItem(LAST_KEY, reason); } catch { /* ไม่จำก็ได้ */ }
    onConfirm(reason);
  };

  return (
    <ERPModal open={open} onClose={() => { if (!busy) onClose(); }} size="sm" defaultExpanded={false} storageKey="platform-catalog-ignore"
      title={count > 1 ? `ไม่ต้องจับคู่ ${count.toLocaleString()} รายการ` : "ไม่ต้องจับคู่ตัวนี้"}
      description="ใช้กับของที่ไม่มีในระบบเราจริง ๆ — ไม่นับใน “ยังไม่จับคู่” และระบบจะไม่เดาคู่ให้อีก · เลิกข้ามได้ทุกเมื่อ"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button type="button" onClick={submit} disabled={busy} className="h-9 px-4 text-sm text-white bg-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "🚫 ยืนยันไม่ต้องจับคู่"}</button>
        </div>
      )}>
      <div className="space-y-3 text-sm">
        {sample && sample.length > 0 && (
          <ul className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5">
            {sample.slice(0, 5).map((s, i) => <li key={i} className="truncate">{s}</li>)}
            {count > 5 && <li className="text-slate-400">… และอีก {(count - 5).toLocaleString()} รายการ</li>}
          </ul>
        )}
        <div>
          <div className="text-xs text-slate-500 mb-1.5">เหตุผล</div>
          <div className="flex flex-wrap gap-1.5">
            {[...IGNORE_REASONS, OTHER].map((r) => (
              <button key={r} type="button" onClick={() => { setPick(r); setErr(null); }} aria-pressed={pick === r}
                className={`h-8 px-3 rounded-full border text-sm ${pick === r ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {r === OTHER ? "อื่นๆ (พิมพ์เอง)" : r}
              </button>
            ))}
          </div>
          {pick === OTHER && (
            <input autoFocus value={other} onChange={(e) => { setOther(e.target.value); setErr(null); }} maxLength={200}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="เช่น ของแถม ไม่ได้ขายแยก" className="mt-2 w-full h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          )}
        </div>
        {needTyped && (
          <div>
            <div className="text-xs text-amber-700 mb-1">รายการเยอะ — พิมพ์คำว่า “{TYPED_WORD}” เพื่อยืนยัน</div>
            <input value={typed} onChange={(e) => { setTyped(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              className="w-full h-9 border border-amber-300 rounded-lg px-3 text-sm" placeholder={TYPED_WORD} />
          </div>
        )}
        {err && <p className="text-xs text-rose-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
