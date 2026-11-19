"use client";

/**
 * ✋ ป๊อปเลือกเหตุผลติ๊กมือ (รอบ 6 · 2026-11-19) — กด "ติ๊กมือ" ที่สินค้า → เลือกเหตุผลแบบปุ่มใหญ่ (แทนช่องเลือกเดิม)
 *   จำเหตุผลล่าสุดในเครื่องนี้ไว้บนสุด (ข้อเสนอ 3) · "อื่น ๆ" = พิมพ์เอง · ใช้ ERPModal กลาง (ระหว่างเปิด เครื่องสแกนไม่ยิงใส่สถานี)
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { MANUAL_REASONS } from "@/lib/packing";

const LAST = "erp.packing.manual.last";
const OTHER = "อื่น ๆ";
const readLast = (): string | null => { try { return localStorage.getItem(LAST); } catch { return null; } };

export function ManualTickModal({ itemLabel, onPick, onClose }: { itemLabel: string; onPick: (reason: string) => void; onClose: () => void }) {
  const [last] = useState(readLast);
  const [other, setOther] = useState<string | null>(null);
  const pick = (reason: string) => {
    try { localStorage.setItem(LAST, reason); } catch { /* โหมดส่วนตัว */ }
    onPick(reason);
  };
  const lastValid = last && last !== OTHER ? last : null;
  const rest = MANUAL_REASONS.filter((r) => r !== lastValid);
  const btn = "block w-full rounded-lg border px-4 py-3 text-left text-base";
  return (
    <ERPModal open onClose={onClose} title="ติ๊กมือ (ไม่ยิงบาร์โค้ด)" description={itemLabel} size="sm"
      footer={<div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">ยกเลิก</button></div>}>
      {other === null ? (
        <div className="grid gap-2">
          {lastValid && (
            <>
              <p className="text-xs text-slate-500">ใช้ล่าสุด</p>
              <button type="button" autoFocus onClick={() => pick(lastValid)} className={`${btn} border-sky-400 bg-sky-50 font-medium text-sky-900`}>{lastValid}</button>
              <p className="mt-1 text-xs text-slate-500">เหตุผลอื่น</p>
            </>
          )}
          {rest.map((r) => (
            <button key={r} type="button" onClick={() => (r === OTHER ? setOther("") : pick(r))} className={`${btn} border-slate-200 hover:border-slate-400`}>{r === OTHER ? "อื่น ๆ (พิมพ์เอง)" : r}</button>
          ))}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); const t = other.trim(); pick(t ? `${OTHER}: ${t.slice(0, 80)}` : OTHER); }} className="grid gap-2">
          <p className="text-sm text-slate-600">ทำไมไม่ยิงบาร์โค้ด?</p>
          <input value={other} onChange={(e) => setOther(e.target.value)} autoFocus maxLength={80} placeholder="เช่น สติกเกอร์หลุด" className="rounded-lg border border-slate-300 px-3 py-2" />
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => setOther(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">กลับ</button>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">ติ๊ก</button>
          </div>
        </form>
      )}
    </ERPModal>
  );
}
