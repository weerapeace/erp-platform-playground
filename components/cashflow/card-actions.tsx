"use client";

/**
 * ป๊อปจัดการบัตรเครดิต / หนี้อื่น จากแท็บ "ต้องจ่าย" หน้ากระแสเงินสด
 *   CardPayModal       — จ่ายแล้ว (เต็มยอด / ขั้นต่ำ / ระบุเอง + วันที่ + สลิป) → POST /api/debt-cards/[id]/pay
 *   CardStatementModal — ใบแจ้งยอดใหม่ (ใบเดิมเก็บในประวัติ)           → POST /api/debt-cards/[id]/statement
 * กติกาตัวเลขเป็นของกลาง lib/debt-cards (ตัวเดียวกับ API) · สลิป = ไฟล์แนบกลาง entity "debt_cards"
 * "แก้ข้อมูลบัตร" ไม่อยู่ที่นี่ — เปิด MasterRecordDrawer โมดูล debt-cards ตรง ๆ
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { MoneyInput } from "@/components/money-input";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { uploadRecordFile } from "@/components/record-files";
import { SlipPicker } from "@/components/cashflow/slip-picker";
import { RECORD_FILES_MAX } from "@/lib/record-files";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { THB, type CashflowEvent } from "@/lib/cashflow";
import { applyCardPayment, newStatementPatch } from "@/lib/debt-cards";

const btn = "h-9 px-4 text-sm rounded-lg";
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** อ่านค่าดิบของบัตรจากรายการเงิน (lib/cashflow-server ใส่ไว้ใน raw) */
export function cardRaw(e: CashflowEvent) {
  const r = e.raw ?? {};
  return { minimumDue: num(r.minimumDue), statementBalance: num(r.statementBalance), paidAmount: num(r.paidAmount) };
}

type PayChoice = "full" | "min" | "custom";

export function CardPayModal({ event, today, onClose, onDone }: { event: CashflowEvent | null; today: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [choice, setChoice] = useState<PayChoice>("full");
  const [custom, setCustom] = useState("");
  const [date, setDate] = useState(today);
  const [slip, setSlip] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  if (!event?.docId) return null;
  const raw = cardRaw(event);
  const remaining = event.amount;
  const minPay = raw.minimumDue > 0 ? Math.min(raw.minimumDue, remaining) : 0;
  const amount = choice === "full" ? remaining : choice === "min" ? minPay : num(custom);
  const close = () => { setChoice("full"); setCustom(""); setSlip(null); setErr(""); onClose(); };

  const submit = async () => {
    const check = applyCardPayment({ statement_balance: raw.statementBalance, paid_amount: raw.paidAmount }, amount, date);
    if (!check.ok) { setErr(check.error); return; }
    if (slip && slip.size > RECORD_FILES_MAX) { setErr(`สลิปใหญ่เกิน ${Math.round(RECORD_FILES_MAX / 1024 / 1024)}MB`); return; }
    setErr("");
    // 1) แนบสลิปก่อน — พลาดตรงนี้ยังไม่บันทึกจ่าย
    if (slip) {
      setBusy("กำลังแนบสลิป…");
      try { await uploadRecordFile({ entityType: "debt_cards", entityId: String(event.docId), file: slip, actor: user?.email ?? undefined }); }
      catch (e) { setBusy(null); setErr(`แนบสลิปไม่สำเร็จ — ยังไม่ได้บันทึกจ่าย: ${e instanceof Error ? e.message : ""}`); return; }
    }
    // 2) บันทึกจ่าย
    setBusy("กำลังบันทึก…");
    try {
      const res = await apiFetch(`/api/debt-cards/${event.docId}/pay`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paid_date: date }) });
      const j = await res.json();
      if (j?.error) { setErr(slip ? `${j.error} (สลิปแนบที่บัตรแล้ว)` : j.error); return; }
      const st = (j.data as { status: string }).status;
      toast.success(`บันทึกจ่าย ${event.ref} ${THB(amount)} แล้ว${st === "paid" ? " · จ่ายครบ" : " · ยังค้างบางส่วน"}${slip ? " · แนบสลิปแล้ว" : ""}`);
      setChoice("full"); setCustom(""); setSlip(null);
      onDone();
    } catch { setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBusy(null); }
  };

  const chip = (key: PayChoice, label: string, value: number | null) => (
    <button type="button" onClick={() => { setChoice(key); setErr(""); }}
      className={`px-3 py-2 rounded-lg border text-left ${choice === key ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      <div className="text-xs">{label}</div>
      {value != null && <div className="text-sm font-semibold tabular-nums">{THB(value)}</div>}
    </button>
  );

  return (
    <ERPModal open onClose={close} title={`จ่ายแล้ว · ${event.ref}`} size="sm" loading={!!busy} hasUnsavedChanges={(!!slip || choice === "custom") && !busy}
      footer={<><button type="button" onClick={close} disabled={!!busy} className={`${btn} border border-slate-200 text-slate-600`}>ยกเลิก</button>
        <button type="button" onClick={submit} disabled={!!busy} className={`${btn} bg-emerald-600 text-white disabled:opacity-50`}>{busy ?? `บันทึกจ่าย ${THB(amount)}`}</button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">{event.party} · ค้างตามใบแจ้งยอด <b className="tabular-nums">{THB(remaining)}</b> · ครบกำหนด {formatDate(event.date)}</p>
        <div className="grid grid-cols-3 gap-2">
          {chip("full", "เต็มยอด", remaining)}
          {minPay > 0 && minPay < remaining ? chip("min", "ขั้นต่ำ", minPay) : <div />}
          {chip("custom", "ระบุเอง", null)}
        </div>
        {choice === "custom" && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">ยอดที่จ่าย (บาท)</label>
            <MoneyInput value={custom} onChange={(v) => { setCustom(v); setErr(""); }} autoFocus placeholder="เช่น 20000"
              className="w-full h-9 px-2.5 text-sm text-right border border-slate-200 rounded-lg" />
          </div>
        )}
        <div><label className="block text-xs text-slate-500 mb-1">วันที่จ่าย</label><DateInput value={date} onChange={(v) => { setDate(v); setErr(""); }} /></div>
        <SlipPicker file={slip} onChange={(f) => { setSlip(f); setErr(""); }} busyLabel={busy} />
        <p className="text-xs text-slate-400">จ่ายไม่ครบ = สถานะ "จ่ายบางส่วน" ยอดที่เหลือยังอยู่ในต้องจ่าย · สลิปดูได้ที่หน้าบัตร · มีประวัติว่าใครกด · ยังไม่หักยอดเงินในบัญชี (รอสมุดบัญชีธนาคาร)</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}

export function CardStatementModal({ event, today, onClose, onDone }: { event: CashflowEvent | null; today: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [stmtDate, setStmtDate] = useState(today);
  const [balance, setBalance] = useState("");
  const [minDue, setMinDue] = useState("");
  const [due, setDue] = useState("");
  const [paidInFull, setPaidInFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!event?.docId) return null;
  const raw = cardRaw(event);
  const dirty = !!(balance || minDue || due);
  const close = () => { setBalance(""); setMinDue(""); setDue(""); setPaidInFull(false); setErr(""); onClose(); };

  const submit = async () => {
    const input = { statement_date: stmtDate, statement_balance: num(balance), minimum_due: num(minDue), due_date: due };
    if (balance === "") { setErr("ใส่ยอดตามใบแจ้งยอด"); return; }
    const check = newStatementPatch(input);
    if (!check.ok) { setErr(check.error); return; }
    setBusy(true); setErr("");
    try {
      const res = await apiFetch(`/api/debt-cards/${event.docId}/statement`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, previous_paid_in_full: paidInFull }) });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      toast.success(`ลงใบแจ้งยอดใหม่ ${event.ref} แล้ว · ${THB(input.statement_balance)} ครบกำหนด ${formatDate(due)}`);
      setBalance(""); setMinDue(""); setDue(""); setPaidInFull(false);
      onDone();
    } catch { setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  };

  const money = (label: string, value: string, set: (v: string) => void, ph: string) => (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <MoneyInput value={value} onChange={(v) => { set(v); setErr(""); }} placeholder={ph} className="w-full h-9 px-2.5 text-sm text-right border border-slate-200 rounded-lg" />
    </div>
  );

  return (
    <ERPModal open onClose={close} title={`ใบแจ้งยอดใหม่ · ${event.ref}`} size="sm" loading={busy} hasUnsavedChanges={dirty && !busy}
      footer={<><button type="button" onClick={close} className={`${btn} border border-slate-200 text-slate-600`}>ยกเลิก</button>
        <button type="button" onClick={submit} disabled={busy} className={`${btn} bg-blue-600 text-white disabled:opacity-50`}>{busy ? "กำลังบันทึก…" : "บันทึกใบแจ้งยอด"}</button></>}>
      <div className="space-y-3 text-sm">
        <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          ใบเดิม: ยอด {THB(raw.statementBalance)} · จ่ายไปแล้ว {THB(raw.paidAmount)} · ครบกำหนด {formatDate(event.date)} — เก็บไว้ในประวัติของบัตร
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-slate-500 mb-1">วันที่ใบแจ้งยอด</label><DateInput value={stmtDate} onChange={(v) => { setStmtDate(v); setErr(""); }} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">ครบกำหนดชำระ</label><DateInput value={due} onChange={(v) => { setDue(v); setErr(""); }} /></div>
          {money("ยอดตามใบแจ้งยอด (บาท)", balance, setBalance, "เช่น 54912.38")}
          {money("ยอดขั้นต่ำ (บาท)", minDue, setMinDue, "ไม่มี = เว้นว่าง")}
        </div>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={paidInFull} onChange={(e) => setPaidInFull(e.target.checked)} />
          ใบเดิมจ่ายครบแล้ว (บันทึกไว้ในประวัติ)
        </label>
        <p className="text-xs text-slate-400">ยอดจ่ายแล้วเริ่มนับใหม่จาก 0 ตามใบใหม่ · ยอดค้างของใบเดิมมักรวมอยู่ในใบใหม่แล้ว · มีประวัติว่าใครลง</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
