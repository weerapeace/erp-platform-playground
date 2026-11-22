"use client";

/**
 * ป๊อปตั้งวันนัดส่งใบสั่งขาย (เจ้าของเลือกแบบ B + ข้อ 1,2,3,4,6 · 2026-11-22)
 *   ใช้ที่: หัวใบในหน้าสถานะ · ติ๊กรายการแล้วตั้งวันเฉพาะรายการ · ช่อง "ยังไม่ระบุ" ในตาราง · เลือกหลายใบแล้วตั้งทีเดียว
 *   ปุ่มลัด +7/+14/+30 วันจากวันที่สั่ง · ลบวันได้ · ป้าย "ลูกค้าเห็นในไลน์" · ติ๊ก "อัปเดตวันส่งในใบสั่งผลิตด้วย"
 *   บันทึกแล้วย้อนกลับได้จากแจ้งผลมุมจอ (คืนวันเดิมทั้งใบสั่งขายและใบสั่งผลิต) · API /api/so-orders/due · กติกา lib/so-due
 * ของกลาง: ERPModal · DateInput · useToast · apiFetch · Icon
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { DUE_SHORTCUTS, addDays } from "@/lib/so-due";

export type SoDueItem = { order_id: string; due_date?: string | null; lines?: Record<string, string | null> };
type DueResult = { order_id: string; order_no: string; before: { due_date: string | null; lines: Record<string, string | null> }; mo: { mo_id: string; from: string | null; to: string }[] };

async function postDue(body: Record<string, unknown>): Promise<DueResult[]> {
  const r = await apiFetch("/api/so-orders/due", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "บันทึกวันนัดส่งไม่สำเร็จ");
  return j.results as DueResult[];
}

/** บันทึกวันนัดส่ง + แจ้งผลพร้อมปุ่มย้อนกลับ → คืน true ถ้าสำเร็จ */
export function useSaveSoDue(onChanged: () => void | Promise<void>) {
  const toast = useToast();
  return async (items: SoDueItem[], syncMo: boolean, label: string): Promise<boolean> => {
    try {
      const res = await postDue({ items, sync_mo: syncMo });
      await onChanged();
      const moN = res.reduce((s, r) => s + r.mo.length, 0);
      toast.undo(`${label}${moN ? ` · อัปเดตใบสั่งผลิต ${moN} ใบ` : ""}`, async () => {
        try {
          await postDue({
            items: res.map((r) => ({ order_id: r.order_id, ...(items.find((i) => i.order_id === r.order_id)?.due_date !== undefined ? { due_date: r.before.due_date } : {}), lines: r.before.lines })),
            mo_restore: Object.fromEntries(res.flatMap((r) => r.mo.map((m) => [m.mo_id, m.from]))),
          });
          await onChanged();
          toast.success("ย้อนกลับวันนัดส่งแล้ว");
        } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกวันนัดส่งไม่สำเร็จ"); return false; }
  };
}

export function SoDueEditor({ open, title, subtitle, value, baseDate, moHint, onClose, onSave }: {
  open: boolean;
  title: string;
  /** บรรทัดเล็กใต้หัว เช่น "3 รายการ · รายการอื่นใช้วันของหัวใบ" */
  subtitle?: string;
  value: string | null;
  /** วันที่สั่ง — ปุ่มลัด +7/+14/+30 นับจากวันนี้ (ไม่มี = นับจากวันนี้) */
  baseDate?: string | null;
  /** ข้อความเรื่องใบสั่งผลิต เช่น "มีใบสั่งผลิต 3 ใบ" · null = ไม่มีใบผลิต (ไม่ถาม) */
  moHint: string | null;
  onClose: () => void;
  onSave: (due: string | null, syncMo: boolean) => Promise<boolean>;
}) {
  const [due, setDue] = useState(value ?? "");
  const [syncMo, setSyncMo] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDue(value ?? ""); setSyncMo(true); } }, [open, value]);
  const base = (baseDate || new Date(Date.now() + 7 * 3600e3).toISOString()).slice(0, 10);
  const dirty = (due || null) !== (value || null);

  const save = async (v: string | null) => {
    setBusy(true);
    const ok = await onSave(v, !!moHint && syncMo && !!v);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <ERPModal open={open} onClose={() => !busy && onClose()} size="sm" title={title} hasUnsavedChanges={dirty}
      footer={<>
        {value && <button type="button" disabled={busy} onClick={() => void save(null)} className="mr-auto h-9 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-40">ลบวัน</button>}
        <button type="button" disabled={busy} onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" disabled={busy || !due || !dirty} onClick={() => void save(due)} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </>}>
      <div className="space-y-3">
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">วันนัดส่งลูกค้า</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700" title="ลูกค้าที่ผูกไลน์บริษัทเห็นวันนี้ในเมนู ตารางส่งงาน">
              <Icon name="chat" /> ลูกค้าเห็นในไลน์</span>
          </div>
          <DateInput value={due} onChange={setDue} quick={false} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DUE_SHORTCUTS.map((n) => (
              <button key={n} type="button" onClick={() => setDue(addDays(base, n))}
                className={`h-8 rounded-lg border px-3 text-xs ${due === addDays(base, n) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>+{n} วัน</button>
            ))}
            <span className="self-center text-[11px] text-slate-400">นับจาก{baseDate ? "วันที่สั่ง" : "วันนี้"}</span>
          </div>
        </div>
        {moHint && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={syncMo} onChange={(e) => setSyncMo(e.target.checked)} />
            <span>อัปเดตวันส่งในใบสั่งผลิตด้วย <span className="text-slate-500">({moHint})</span>
              <span className="block text-[11px] text-slate-400">ใบสั่งผลิตที่ตั้งวันไว้แล้วจะเปลี่ยนเป็นวันนี้ · ใบที่เสร็จ/ยกเลิกไม่แตะ · ลบวันไม่ล้างวันใบผลิต</span></span>
          </label>
        )}
      </div>
    </ERPModal>
  );
}
