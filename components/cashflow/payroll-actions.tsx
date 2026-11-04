"use client";

/**
 * "เงินเดือนจ่ายแล้ว" จากแท็บต้องจ่าย หน้ากระแสเงินสด — เลือกได้หลายรอบ
 * ใช้ API เงินเดือนเดิมทั้งหมด (ไม่มีกติกาใหม่):
 *   รอบที่ยังเป็นร่าง → POST /api/payroll/payment-batches/[id]/approve ก่อน
 *   แล้ว             → POST /api/payroll/payment-batches/[id]/mark-paid
 *     (lib/payroll-payments-db markPaymentBatchPaid: รอบสิ้นเดือนตั้งสลิปเงินเดือนทุกคนในรอบเป็น "จ่ายแล้ว" ด้วย · ปิดงวดถ้าจ่ายครบ · audit ในตัว)
 * สิทธิ์ app.payroll + employees.edit (guardPayroll) · ย้อนกลับไม่ได้ → ต้องพิมพ์ CONFIRM เสมอ
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { THB, type CashflowEvent } from "@/lib/cashflow";

const btn = "h-9 px-4 text-sm rounded-lg";

/** รอบเงินเดือนจริง (มีชุดจ่ายในระบบ) — ประมาณการกดจ่ายไม่ได้ */
export const payrollPayable = (list: CashflowEvent[]) => list.filter((e) => e.source === "payroll" && !!e.docId && e.certainty !== "estimate");

export function PayrollPaidModal({ events, onClose, onDone }: { events: CashflowEvent[] | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [off, setOff] = useState<Set<string>>(new Set());   // รอบที่เอาติ๊กออก
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const list = useMemo(() => [...(events ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [events]);
  if (!events) return null;
  const chosen = list.filter((e) => !off.has(e.id));
  const drafts = chosen.filter((e) => e.raw?.status === "draft").length;
  const people = chosen.reduce((s, e) => s + (Number(e.raw?.people) || 0), 0);
  const total = chosen.reduce((s, e) => s + e.amount, 0);
  const close = () => { setOff(new Set()); setTyped(""); setErr(""); onClose(); };
  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const post = async (url: string) => {
    const res = await apiFetch(url, { method: "POST" });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) throw new Error(j?.error || "เชื่อมต่อไม่สำเร็จ");
  };

  const submit = async () => {
    if (!chosen.length) { setErr("ยังไม่ได้เลือกรอบ"); return; }
    if (typed.trim() !== "CONFIRM") { setErr("พิมพ์ CONFIRM เพื่อยืนยัน"); return; }
    setErr("");
    let ok = 0; const failed: string[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const e = chosen[i];
      setBusy(`กำลังบันทึก ${i + 1}/${chosen.length}…`);
      try {
        if (e.raw?.status === "draft") await post(`/api/payroll/payment-batches/${e.docId}/approve`);
        await post(`/api/payroll/payment-batches/${e.docId}/mark-paid`);
        ok += 1;
      } catch (x) { failed.push(`${formatDate(e.date)} ${e.party}: ${x instanceof Error ? x.message : "ไม่สำเร็จ"}`); }
    }
    setBusy(null);
    if (failed.length) toast.warning(`บันทึกจ่ายแล้ว ${ok} รอบ · ไม่สำเร็จ ${failed.length} รอบ — ${failed[0]}`);
    else toast.success(`บันทึกเงินเดือนจ่ายแล้ว ${ok} รอบ · ${THB(total)}`);
    setOff(new Set()); setTyped("");
    onDone();
  };

  return (
    <ERPModal open onClose={close} title="บันทึกว่าจ่ายเงินเดือนแล้ว" size="md" loading={!!busy} closeOnBackdrop={false} hasUnsavedChanges={!!typed && !busy}
      footer={<><button type="button" onClick={close} disabled={!!busy} className={`${btn} border border-slate-200 text-slate-600`}>ยกเลิก</button>
        <button type="button" onClick={submit} disabled={!!busy || !chosen.length} className={`${btn} bg-emerald-600 text-white disabled:opacity-50`}>{busy ?? `จ่ายแล้ว ${chosen.length} รอบ`}</button></>}>
      <div className="space-y-3 text-sm">
        {!list.length ? (
          <p className="text-slate-500">รายการที่เลือกไม่มีรอบเงินเดือนจริง (ประมาณการกดจ่ายไม่ได้ — ต้องทำรอบจ่ายก่อนที่ <Link href="/payroll/payments" className="text-blue-600 underline">หน้าจ่ายเงินเดือน</Link>)</p>
        ) : (<>
          <p className="text-slate-600">เลือก {chosen.length}/{list.length} รอบ · {people} คน · รวม <b className="tabular-nums">{THB(total)}</b></p>
          <div className="max-h-[38vh] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {list.map((e) => (
              <label key={e.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={!off.has(e.id)} onChange={() => toggle(e.id)} />
                <span className="w-24 shrink-0 text-xs text-slate-600">{formatDate(e.date)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{e.party}</span>
                  <span className="text-[11px] text-slate-400">{Number(e.raw?.people) || 0} คน · {e.ref}</span>
                </span>
                {e.raw?.status === "draft"
                  ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ร่าง → จะอนุมัติให้ก่อน</span>
                  : <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">อนุมัติแล้ว</span>}
                <span className="w-24 text-right tabular-nums text-rose-600">{THB(e.amount)}</span>
              </label>
            ))}
          </div>
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 space-y-1">
            <div>• รอบ<b>สิ้นเดือน</b>: สลิปเงินเดือนของทุกคนในรอบจะถูกตั้งเป็น "จ่ายแล้ว" ด้วย (ทางเดียวกับหน้าจ่ายเงินเดือน) · งวดที่จ่ายครบจะปิดเป็นจ่ายแล้ว</div>
            {drafts > 0 && <div>• มี {drafts} รอบที่ยังเป็นร่าง — ระบบจะกดอนุมัติให้ก่อนแล้วค่อยบันทึกจ่าย</div>}
            <div>• บันทึกแล้วยกเลิกจากที่นี่ไม่ได้ — ใช้เมื่อโอนเงินเดือนไปจริงแล้วเท่านั้น</div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">พิมพ์ <b>CONFIRM</b> เพื่อยืนยัน</label>
            <input value={typed} onChange={(x) => { setTyped(x.target.value); setErr(""); }} className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg" />
          </div>
        </>)}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
