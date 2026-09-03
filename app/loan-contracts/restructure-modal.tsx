"use client";
/**
 * ป๊อป "ปรับโครงสร้างหนี้" — 4 ขั้น (เปิดจากแผงในหน้าสัญญาเงินกู้)
 *   1 เรื่องอะไร      ธนาคารให้อะไร / วันมีผล / เลขหนังสือ / เหตุผล
 *   2 เงื่อนไขใหม่    ตารางเทียบ "เดิม | ใหม่" แก้เฉพาะช่องขวา ระบบคิดค่างวดให้
 *   3 ตารางผ่อนใหม่  งวดหลังวันมีผล — แก้รายงวด / วางจาก Excel ของธนาคาร / ให้ระบบคิดใหม่
 *   4 ยืนยัน          บอกชัดว่าจะเกิดอะไรขึ้นบ้าง แล้วค่อยกด
 *
 * ของกลางที่ใช้: ERPModal · ERPInput/ERPSelect/ERPFormField · MoneyInput · lib/paste-table · lib/loan-restructure
 * ไม่คิดตารางเอง — ใช้ buildRestructureSchedule (ตัวเดียวกับที่ทดสอบไว้)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { MoneyInput } from "@/components/money-input";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { parsePastedTable, dropHeaderRow, parseNumberCell, parseDateCell, isDateCell } from "@/lib/paste-table";
import {
  RESTRUCTURE_KINDS, buildRestructureSchedule, scheduleTotals, addMonthsISO, monthsPerPeriodOf,
  type RestructureKind, type ScheduleRow, type RepaymentMethod,
} from "@/lib/loan-restructure";

type Contract = Record<string, unknown>;

const METHOD_OPTS = [
  { value: "equal_installment", label: "ผ่อนเท่ากันทุกงวด" },
  { value: "equal_principal",   label: "ตัดเงินต้นเท่ากันทุกงวด" },
  { value: "interest_only",     label: "จ่ายดอกอย่างเดียว ปิดต้นงวดสุดท้าย" },
];
const RATE_TYPE_OPTS = [
  { value: "floating", label: "ลอยตัว (Floating)" },
  { value: "fixed",    label: "คงที่ (Fixed)" },
];

const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const thDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
const money = (n: number) => <span className="tabular-nums">{formatAmount(n)}</span>;

/** แถวที่แก้ได้ในขั้น 3 (เก็บเป็น string ให้พิมพ์สะดวก) */
type EditRow = { key: string; due_date: string; principal: string; interest: string; fee: string; holiday?: boolean };
const toEdit = (rows: ScheduleRow[]): EditRow[] =>
  rows.map((r, i) => ({ key: `r${i}-${r.due_date}`, due_date: r.due_date, principal: String(r.principal_due), interest: String(r.interest_due), fee: String(r.fee_due || ""), holiday: r.holiday }));
const fromEdit = (rows: EditRow[]): ScheduleRow[] =>
  rows.map((r) => ({ due_date: r.due_date, principal_due: r2(num(r.principal)), interest_due: r2(num(r.interest)), fee_due: r2(num(r.fee)), holiday: r.holiday }));

/** วางจาก Excel: [งวดที่] วันครบกำหนด เงินต้น ดอกเบี้ย [ค่าธรรมเนียม] */
function parsePaste(text: string): { rows: EditRow[]; bad: number } {
  const grid = dropHeaderRow(parsePastedTable(text), /งวด|วันที่|ครบกำหนด|เงินต้น|ดอกเบี้ย|date|principal|interest/i);
  const rows: EditRow[] = []; let bad = 0;
  grid.forEach((cells, i) => {
    const o = !isDateCell(cells[0]) && isDateCell(cells[1]) ? 1 : 0;
    const due = parseDateCell(cells[o]);
    if (!due) { bad++; return; }
    rows.push({ key: `p${i}`, due_date: due, principal: String(parseNumberCell(cells[o + 1])), interest: String(parseNumberCell(cells[o + 2])), fee: cells[o + 3] ? String(parseNumberCell(cells[o + 3])) : "" });
  });
  return { rows, bad };
}

const stepCls = (on: boolean, done: boolean) =>
  `px-2.5 py-1 rounded-full text-xs font-medium ${on ? "bg-orange-100 text-orange-800" : done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`;
const btn = "h-9 px-3 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const cmpCell = "px-3 py-2 border-b border-slate-100 text-sm";

export function RestructureModal({
  open, onClose, contract, onDone,
}: {
  open: boolean; onClose: () => void;
  contract: Contract;
  onDone: () => Promise<void> | void;
}) {
  const contractId = String(contract.id ?? "");
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // ---- ขั้น 1 ----
  const [kinds, setKinds] = useState<RestructureKind[]>([]);
  const [effective, setEffective] = useState(todayISO());
  const [bankRef, setBankRef] = useState("");
  const [reason, setReason] = useState("");

  // ---- ขั้น 2 ----
  const [opening, setOpening] = useState("");          // เงินต้นคงเหลือ ณ วันมีผล (ก่อนทบดอก)
  const [cap, setCap] = useState("");                  // ดอกค้างทบเข้าต้น
  const [rate, setRate] = useState("");
  const [rateType, setRateType] = useState("floating");
  const [rateRef, setRateRef] = useState("");
  const [method, setMethod] = useState<RepaymentMethod>("equal_installment");
  const [holiday, setHoliday] = useState("0");
  const [periods, setPeriods] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [firstDue, setFirstDue] = useState("");
  const [installment, setInstallment] = useState("");  // ค่างวดกำหนดเอง (ว่าง = ระบบคิด)
  const [fee, setFee] = useState("");
  const [feeLabel, setFeeLabel] = useState("");

  // ---- ขั้น 3 ----
  const [rows, setRows] = useState<EditRow[]>([]);
  const [rowsDirty, setRowsDirty] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const mpp = monthsPerPeriodOf(String(contract.payment_frequency ?? "monthly"));
  const oldRate = num(contract.interest_rate);
  const oldMonthly = num(contract.estimated_monthly_payment);
  const oldRemaining = Math.max(0, num(contract.total_installment_count) - num(contract.paid_installment_count));
  const oldEnd = String(contract.end_date ?? "");

  // ตั้งค่าเริ่มต้นจากสัญญาทุกครั้งที่เปิด
  useEffect(() => {
    if (!open) return;
    setStep(1); setErr(""); setSaving(false);
    setKinds([]); setEffective(todayISO()); setBankRef(""); setReason("");
    setOpening(String(r2(num(contract.outstanding_principal)) || ""));
    setCap(""); setRate(String(oldRate || "")); setRateType(String(contract.interest_rate_type ?? "floating") || "floating");
    setRateRef(String(contract.interest_rate_reference ?? ""));
    const m = String(contract.repayment_method ?? "equal_installment");
    setMethod((["equal_installment", "equal_principal", "interest_only"].includes(m) ? m : "equal_installment") as RepaymentMethod);
    setHoliday("0"); setPeriods(String(oldRemaining || ""));
    setDueDay(contract.payment_due_day ? String(contract.payment_due_day) : "");
    setFirstDue(""); setInstallment(""); setFee(""); setFeeLabel("");
    setRows([]); setRowsDirty(false); setPasteOpen(false); setPasteText("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // วันครบกำหนดงวดแรก = เดือนถัดจากวันมีผล (ยึดวันตัดงวด)
  useEffect(() => {
    if (!effective) return;
    setFirstDue(addMonthsISO(effective, mpp, dueDay ? num(dueDay) : null));
  }, [effective, dueDay, mpp]);

  const openingTotal = r2(num(opening) + num(cap));
  const computed = useMemo<ScheduleRow[]>(() => buildRestructureSchedule({
    openingPrincipal: openingTotal, annualRate: num(rate), monthsPerPeriod: mpp, method,
    holidayPeriods: num(holiday), periods: num(periods), firstDueDate: firstDue,
    dueDay: dueDay ? num(dueDay) : null, installmentOverride: installment ? num(installment) : null,
  }), [openingTotal, rate, mpp, method, holiday, periods, firstDue, dueDay, installment]);
  const computedTotals = useMemo(() => scheduleTotals(computed), [computed]);

  // เข้าขั้น 3 ครั้งแรก (หรือยังไม่ได้แก้เอง) → ใช้ตารางที่ระบบคิด
  useEffect(() => {
    if (step === 3 && !rowsDirty) setRows(toEdit(computed));
  }, [step, computed, rowsDirty]);

  const finalRows = useMemo(() => fromEdit(rows), [rows]);
  const finalTotals = useMemo(() => scheduleTotals(finalRows), [finalRows]);
  const principalGap = r2(finalTotals.principal - openingTotal);

  const toggleKind = (k: RestructureKind) =>
    setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const step1Ok = kinds.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(effective);
  const step2Ok = openingTotal > 0 && num(rate) >= 0 && (num(holiday) + num(periods)) > 0 && !!firstDue && computed.length > 0;
  const step3Ok = finalRows.length > 0 && finalRows.every((r) => r.due_date >= effective) && Math.abs(principalGap) <= 1;

  const next = () => { setErr(""); setStep((s) => Math.min(4, s + 1)); };
  const back = () => { setErr(""); setStep((s) => Math.max(1, s - 1)); };

  const updateRow = (key: string, patch: Partial<EditRow>) => {
    setRowsDirty(true);
    setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const removeRow = (key: string) => { setRowsDirty(true); setRows((p) => p.filter((r) => r.key !== key)); };
  const addRow = () => {
    setRowsDirty(true);
    setRows((p) => {
      const last = p[p.length - 1];
      const due = last ? addMonthsISO(last.due_date, mpp, dueDay ? num(dueDay) : null) : firstDue;
      return [...p, { key: `n${Date.now()}`, due_date: due, principal: "", interest: "", fee: "" }];
    });
  };
  const applyPaste = () => {
    const { rows: r, bad } = parsePaste(pasteText);
    if (!r.length) { setErr("อ่านตารางที่วางไม่ได้ — ต้องมีคอลัมน์ วันครบกำหนด · เงินต้น · ดอกเบี้ย"); return; }
    setErr(bad ? `วางแล้ว ${r.length} งวด (ข้าม ${bad} บรรทัดที่อ่านวันที่ไม่ได้)` : "");
    setRows(r); setRowsDirty(true); setPasteOpen(false); setPasteText("");
  };
  const resetRows = () => { setRows(toEdit(computed)); setRowsDirty(false); setErr(""); };

  const submit = async () => {
    setSaving(true); setErr("");
    try {
      const res = await apiFetch("/api/loan-restructure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_id: contractId, effective_date: effective, kinds, bank_ref: bankRef, reason,
          opening_principal: openingTotal, capitalized_interest: r2(num(cap)), fee_amount: r2(num(fee)), fee_label: feeLabel,
          terms: {
            interest_rate: num(rate), interest_rate_type: rateType, interest_rate_reference: rateRef,
            repayment_method: method, payment_due_day: dueDay ? num(dueDay) : null,
            holiday_periods: num(holiday), periods: num(periods),
            installment_amount: installment ? num(installment) : computedTotals.maxInstallment,
          },
          rows: finalRows.map(({ due_date, principal_due, interest_due, fee_due }) => ({ due_date, principal_due, interest_due, fee_due })),
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { setErr(String(j?.error ?? "ปรับโครงสร้างหนี้ไม่สำเร็จ")); return; }
      await onDone();
      onClose();
    } catch { setErr("ปรับโครงสร้างหนี้ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setSaving(false); }
  };

  const footer = (
    <div className="flex items-center justify-between w-full gap-2">
      <button type="button" className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`} onClick={step === 1 ? onClose : back} disabled={saving}>
        {step === 1 ? "ยกเลิก" : "← ย้อนกลับ"}
      </button>
      {step < 4 ? (
        <button type="button" className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}
          onClick={next} disabled={(step === 1 && !step1Ok) || (step === 2 && !step2Ok) || (step === 3 && !step3Ok)}>
          {step === 1 ? "ถัดไป: เงื่อนไขใหม่ →" : step === 2 ? "ดูตารางผ่อนใหม่ →" : "ตรวจก่อนบันทึก →"}
        </button>
      ) : (
        <button type="button" className={`${btn} border-orange-600 bg-orange-600 text-white hover:bg-orange-700`} onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก..." : "🔧 ยืนยันปรับโครงสร้างหนี้"}
        </button>
      )}
    </div>
  );

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="loan-restructure" hasUnsavedChanges={step > 1} loading={saving}
      title={`🔧 ปรับโครงสร้างหนี้ — ${String(contract.loan_code ?? "")} ${String(contract.loan_name ?? "")}`}
      description="เปลี่ยนเงื่อนไขสัญญาตั้งแต่วันมีผล · งวดที่จ่ายแล้วและเงื่อนไขเดิมเก็บไว้ในประวัติ"
      footer={footer}>
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {["1 เรื่องอะไร", "2 เงื่อนไขใหม่", "3 ตารางผ่อนใหม่", "4 ยืนยัน"].map((t, i) => (
            <span key={t} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-300">›</span>}
              <span className={stepCls(step === i + 1, step > i + 1)}>{t}</span>
            </span>
          ))}
        </div>

        {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

        {/* ---------- ขั้น 1 ---------- */}
        {step === 1 && (
          <div className="space-y-4">
            <ERPFormField label="ธนาคารให้อะไรบ้าง (เลือกได้หลายอย่าง)" required>
              <div className="flex flex-wrap gap-2">
                {RESTRUCTURE_KINDS.map((k) => {
                  const on = kinds.includes(k.key);
                  return (
                    <button key={k.key} type="button" title={k.hint} onClick={() => toggleKind(k.key)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? "bg-orange-50 border-orange-400 text-orange-800 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      {k.label}
                    </button>
                  );
                })}
              </div>
            </ERPFormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ERPFormField label="มีผลตั้งแต่วันที่" required hint="ลงย้อนหลังได้ ถ้าปรับไปแล้ว">
                <ERPInput type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
              </ERPFormField>
              <ERPFormField label="หนังสือธนาคารเลขที่ / อ้างอิง">
                <ERPInput value={bankRef} onChange={(e) => setBankRef(e.target.value)} placeholder="เช่น TC-RS-0091" />
              </ERPFormField>
            </div>
            <ERPFormField label="เหตุผล / บันทึกช่วยจำ">
              <ERPTextarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น กระแสเงินสดตึงจากออเดอร์ส่งออกเลื่อน ขอพักเงินต้น 6 เดือน" />
            </ERPFormField>
            <p className="text-xs text-slate-500">📎 แนบหนังสือธนาคารได้ที่ "เอกสารสัญญา" ในหน้าสัญญานี้ (แกลเลอรีเดิม)</p>
          </div>
        )}

        {/* ---------- ขั้น 2 ---------- */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1fr_1.3fr] bg-slate-50 text-[11px] font-semibold text-slate-500">
                <div className="px-3 py-2">รายการ</div>
                <div className="px-3 py-2 text-slate-400">เดิม</div>
                <div className="px-3 py-2 text-teal-800">ใหม่ ตั้งแต่ {thDate(effective)}</div>
              </div>
              <div className="grid grid-cols-[1.2fr_1fr_1.3fr]">
                <div className={cmpCell}>เงินต้นคงเหลือ ณ วันมีผล</div>
                <div className={`${cmpCell} text-slate-500`}>{money(num(contract.outstanding_principal))}</div>
                <div className={cmpCell}><MoneyInput value={opening} onChange={setOpening} className="w-full h-8 px-2 text-sm text-right border border-slate-200 rounded-md" /></div>

                <div className={cmpCell}>ดอกเบี้ยค้างที่ทบเข้าเงินต้น</div>
                <div className={`${cmpCell} text-slate-400`}>—</div>
                <div className={cmpCell}>
                  <MoneyInput value={cap} onChange={setCap} placeholder="0" className="w-full h-8 px-2 text-sm text-right border border-slate-200 rounded-md" />
                  {num(cap) > 0 && <div className="text-[11px] text-slate-500 mt-1">เงินต้นตั้งต้นใหม่ = {money(openingTotal)}</div>}
                </div>

                <div className={cmpCell}>ดอกเบี้ยต่อปี</div>
                <div className={`${cmpCell} text-slate-500`}>{oldRate ? `${oldRate}%` : "—"} {String(contract.interest_rate_type ?? "") === "fixed" ? "คงที่" : "ลอยตัว"} {String(contract.interest_rate_reference ?? "")}</div>
                <div className={`${cmpCell} flex gap-1.5 items-start`}>
                  <ERPInput type="number" step="0.01" min={0} max={100} value={rate} onChange={(e) => setRate(e.target.value)} className="w-24 text-right" />
                  <ERPSelect options={RATE_TYPE_OPTS} value={rateType} onChange={(e) => setRateType(e.target.value)} className="w-32" />
                  <ERPInput value={rateRef} onChange={(e) => setRateRef(e.target.value)} placeholder="MLR/MRR" className="w-24" />
                </div>

                <div className={cmpCell}>วิธีผ่อน</div>
                <div className={`${cmpCell} text-slate-500`}>{METHOD_OPTS.find((m) => m.value === String(contract.repayment_method))?.label ?? String(contract.repayment_method ?? "—")}</div>
                <div className={cmpCell}><ERPSelect options={METHOD_OPTS} value={method} onChange={(e) => setMethod(e.target.value as RepaymentMethod)} /></div>

                <div className={cmpCell}>พักชำระเงินต้น</div>
                <div className={`${cmpCell} text-slate-400`}>—</div>
                <div className={`${cmpCell} flex items-center gap-2`}>
                  <ERPInput type="number" min={0} max={120} value={holiday} onChange={(e) => setHoliday(e.target.value)} className="w-20 text-right" />
                  <span className="text-xs text-slate-500">งวด (จ่ายดอกอย่างเดียว)</span>
                </div>

                <div className={cmpCell}>งวดที่เหลือ (หลังพัก)</div>
                <div className={`${cmpCell} text-slate-500`}>{oldRemaining ? `${oldRemaining} งวด` : "—"}{oldEnd ? ` · สิ้นสุด ${thDate(oldEnd)}` : ""}</div>
                <div className={`${cmpCell} flex items-center gap-2`}>
                  <ERPInput type="number" min={0} max={600} value={periods} onChange={(e) => setPeriods(e.target.value)} className="w-20 text-right" />
                  <span className="text-xs text-slate-500">งวด{computedTotals.lastDue ? ` → สิ้นสุด ${thDate(computedTotals.lastDue)}` : ""}</span>
                </div>

                <div className={cmpCell}>วันตัดงวด / งวดแรก</div>
                <div className={`${cmpCell} text-slate-500`}>{contract.payment_due_day ? `ทุกวันที่ ${String(contract.payment_due_day)}` : "—"}</div>
                <div className={`${cmpCell} flex items-center gap-2 flex-wrap`}>
                  <span className="text-xs text-slate-500">ทุกวันที่</span>
                  <ERPInput type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="เดิม" className="w-16 text-right" />
                  <span className="text-xs text-slate-500">งวดแรก</span>
                  <ERPInput type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className="w-36" />
                </div>

                <div className={cmpCell}>ค่างวดต่อเดือน</div>
                <div className={`${cmpCell} text-slate-500`}>{oldMonthly ? money(oldMonthly) : "—"}</div>
                <div className={cmpCell}>
                  <div className="flex items-center gap-2">
                    <MoneyInput value={installment} onChange={setInstallment} placeholder={computedTotals.maxInstallment ? formatAmount(computedTotals.maxInstallment) : "ระบบคิดให้"} className="w-32 h-8 px-2 text-sm text-right border border-slate-200 rounded-md" />
                    <span className="text-[11px] text-slate-500">{installment ? "ใช้ค่าที่ธนาคารกำหนด" : "ว่าง = ระบบคิดให้"}</span>
                  </div>
                </div>

                <div className={cmpCell}>ค่าธรรมเนียมปรับโครงสร้าง (เก็บแยก)</div>
                <div className={`${cmpCell} text-slate-400`}>—</div>
                <div className={`${cmpCell} flex items-center gap-2`}>
                  <MoneyInput value={fee} onChange={setFee} placeholder="0" className="w-32 h-8 px-2 text-sm text-right border border-slate-200 rounded-md" />
                  <ERPInput value={feeLabel} onChange={(e) => setFeeLabel(e.target.value)} placeholder="ชื่อรายการ (ไม่ใส่ก็ได้)" className="flex-1" />
                </div>
              </div>
            </div>

            {computed.length > 0 ? (
              <div className="rounded-lg bg-teal-50 border border-teal-100 px-3 py-2 text-sm text-slate-700">
                ผลรวมทั้งช่วงที่เหลือ: ดอกเบี้ยรวม <b className="text-teal-800">{money(computedTotals.interest)}</b> · จ่ายทั้งหมด <b className="text-teal-800">{money(computedTotals.total)}</b> · {computed.length} งวด
                {num(holiday) > 0 && <> · ช่วงพักจ่าย {money(computed[0].interest_due)}/งวด</>}
                {" "}· หลังพัก {money(computedTotals.maxInstallment)}/งวด{oldMonthly ? <> (เดิม {money(oldMonthly)})</> : null}
              </div>
            ) : (
              <p className="text-xs text-amber-700">กรอกเงินต้น ดอกเบี้ย และจำนวนงวดให้ครบ แล้วระบบจะคิดตารางให้</p>
            )}
          </div>
        )}

        {/* ---------- ขั้น 3 ---------- */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">งวดใหม่หลังวันมีผล {thDate(effective)} · งวดที่จ่ายแล้วก่อนหน้านั้นคงเดิม</span>
              <span className="ml-auto flex gap-1.5">
                <button type="button" className={`${btn} h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50`} onClick={addRow}>➕ เพิ่มงวด</button>
                <button type="button" className={`${btn} h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50`} onClick={() => setPasteOpen((v) => !v)}>📋 วางจาก Excel ของธนาคาร</button>
                <button type="button" className={`${btn} h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50`} onClick={resetRows} disabled={!rowsDirty}>↺ ให้ระบบคิดใหม่</button>
              </span>
            </div>
            {pasteOpen && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                <p className="text-xs text-slate-600">ก๊อปตารางจาก Excel มาวาง — คอลัมน์: [งวดที่] วันครบกำหนด · เงินต้น · ดอกเบี้ย · [ค่าธรรมเนียม] (มีหัวตารางได้)</p>
                <textarea rows={5} className="w-full text-xs font-mono border border-slate-200 rounded-md p-2" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"31/07/2026\t0\t37,876\n31/08/2026\t0\t37,876"} />
                <div className="flex gap-2">
                  <button type="button" className={`${btn} h-8 text-xs border-blue-600 bg-blue-600 text-white`} onClick={applyPaste}>ใช้ตารางนี้</button>
                  <button type="button" className={`${btn} h-8 text-xs border-slate-200`} onClick={() => setPasteOpen(false)}>ปิด</button>
                </div>
              </div>
            )}
            <div className="max-h-[46vh] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-10">#</th>
                    <th className="px-2 py-1.5 text-left">ครบกำหนด</th>
                    <th className="px-2 py-1.5 text-right">เงินต้น</th>
                    <th className="px-2 py-1.5 text-right">ดอกเบี้ย</th>
                    <th className="px-2 py-1.5 text-right">ค่าธรรมเนียม</th>
                    <th className="px-2 py-1.5 text-right">รวม</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key} className={r.holiday ? "bg-amber-50/60" : ""}>
                      <td className="px-2 py-1 text-slate-400 tabular-nums">{i + 1}{r.holiday && <span className="ml-1 text-[10px] text-amber-700">พัก</span>}</td>
                      <td className="px-2 py-1"><input type="date" value={r.due_date} onChange={(e) => updateRow(r.key, { due_date: e.target.value })} className="h-7 px-1 text-xs border border-slate-200 rounded" /></td>
                      <td className="px-2 py-1"><MoneyInput value={r.principal} onChange={(v) => updateRow(r.key, { principal: v })} className="w-28 h-7 px-1 text-xs text-right border border-slate-200 rounded" /></td>
                      <td className="px-2 py-1"><MoneyInput value={r.interest} onChange={(v) => updateRow(r.key, { interest: v })} className="w-28 h-7 px-1 text-xs text-right border border-slate-200 rounded" /></td>
                      <td className="px-2 py-1"><MoneyInput value={r.fee} onChange={(v) => updateRow(r.key, { fee: v })} placeholder="0" className="w-24 h-7 px-1 text-xs text-right border border-slate-200 rounded" /></td>
                      <td className="px-2 py-1 text-right tabular-nums text-slate-700">{formatAmount(r2(num(r.principal) + num(r.interest) + num(r.fee)))}</td>
                      <td className="px-1 py-1 text-center"><button type="button" title="ลบงวดนี้" className="text-slate-300 hover:text-red-500" onClick={() => removeRow(r.key)}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`text-xs px-3 py-2 rounded-lg ${Math.abs(principalGap) > 1 ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
              รวม {finalRows.length} งวด · เงินต้น {money(finalTotals.principal)} · ดอกเบี้ย {money(finalTotals.interest)} · ทั้งหมด {money(finalTotals.total)}
              {Math.abs(principalGap) > 1
                ? <> — ⚠️ เงินต้นรวมต่างจากเงินต้นตั้งต้น {money(openingTotal)} อยู่ {money(principalGap)} (ต้องเท่ากันถึงจะบันทึกได้)</>
                : <> — ✓ เงินต้นครบ {money(openingTotal)}</>}
            </div>
          </div>
        )}

        {/* ---------- ขั้น 4 ---------- */}
        {step === 4 && (
          <div className="space-y-3 text-sm">
            <ul className="space-y-2">
              <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span><span>บันทึก "ปรับโครงสร้างหนี้" มีผล <b>{thDate(effective)}</b>{bankRef ? <> · หนังสือธนาคาร <b>{bankRef}</b></> : null} — {kinds.map((k) => RESTRUCTURE_KINDS.find((x) => x.key === k)?.label).join(" + ")}</span></li>
              <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span><span>เงื่อนไขสัญญาเปลี่ยนเป็น ดอกเบี้ย <b>{num(rate)}%</b> · {METHOD_OPTS.find((m) => m.value === method)?.label} · {finalRows.length} งวดใหม่ ถึง <b>{thDate(finalTotals.lastDue)}</b> — ค่าเดิม ({oldRate}% · {oldRemaining || "?"} งวด) เก็บไว้ในประวัติ</span></li>
              <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span><span>สร้างตารางผ่อนเวอร์ชันใหม่ใช้แทนเวอร์ชันเดิม — งวดที่ครบกำหนดก่อน {thDate(effective)} คัดลอกมาเหมือนเดิม ใบจ่ายเก่าไม่ถูกแตะ</span></li>
              {num(cap) > 0 && <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span><span>ดอกเบี้ยค้าง <b>{money(num(cap))}</b> ทบเข้าเงินต้น (ลงเป็นใบเบิก 1 ใบ เงินต้นคงเหลือของสัญญาจะเพิ่มขึ้นเท่านี้)</span></li>}
              {num(fee) > 0 && <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span><span>ค่าธรรมเนียม <b>{money(num(fee))}</b> ลงเป็นค่าธรรมเนียมของสัญญา (จ่ายแยก ไม่รวมในตารางผ่อน)</span></li>}
              <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span><span>กระดานเงินสดเปลี่ยนการ์ดงวดเป็นยอดใหม่อัตโนมัติ · จดประวัติว่าใครทำ เมื่อไหร่</span></li>
            </ul>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              ย้อนกลับได้จากแผง "ปรับโครงสร้างหนี้" ในหน้าสัญญา (เฉพาะครั้งล่าสุด) — ถ้ามีใบจ่ายหลังวันมีผลแล้ว ระบบจะให้พิมพ์ CONFIRM ก่อน
            </div>
          </div>
        )}
      </div>
    </ERPModal>
  );
}
