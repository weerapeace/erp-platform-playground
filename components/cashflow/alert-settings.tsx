"use client";

/**
 * แท็บตั้งค่าของหน้ากระแสเงินสด — "เงินกันขั้นต่ำ + แจ้งเตือนเงินจะขาด"
 * ค่าใช้ร่วมทั้งระบบ (ไม่ใช่ต่อเครื่อง) → PATCH /api/cashflow/settings (cashflow.manage · audit)
 * ปุ่มทดสอบ = GET /api/cron/cashflow-alert (คนกดเอง = ดูผลอย่างเดียว ไม่ส่งจริง)
 */
import { useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { InfoHint } from "@/components/info-hint";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { THB, formatDayMonthTH } from "@/lib/cashflow";
import { ALERT_DAY_OPTIONS, type CashflowSettings } from "@/lib/cashflow-settings";

type TestResult = {
  skipped?: string; first?: { date: string; balance: number } | null; low?: { date: string; balance: number };
  shortfall?: number; odHeadroom?: number; error?: string | null;
};

export function CashflowAlertSettings({ value, canManage, onSaved }: { value: CashflowSettings; canManage: boolean; onSaved: (s: CashflowSettings) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<CashflowSettings>(value);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const dirty = draft.safetyBuffer !== value.safetyBuffer || draft.alertEnabled !== value.alertEnabled || draft.alertDays !== value.alertDays;

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/cashflow/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const j = await res.json();
      if (j?.error) { toast.error(j.error); return; }
      onSaved(j.data as CashflowSettings);
      setDraft(j.data as CashflowSettings);
      toast.success("บันทึกแล้ว — กราฟและการแจ้งเตือนใช้ค่าใหม่");
    } catch { toast.error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  };
  const runTest = async () => {
    setTesting(true); setTest(null);
    try { setTest((await (await apiFetch("/api/cron/cashflow-alert?dry=1")).json()) as TestResult); }
    catch { setTest({ error: "ทดสอบไม่สำเร็จ" }); }
    finally { setTesting(false); }
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="font-semibold text-slate-800">เงินกันขั้นต่ำ + แจ้งเตือนเงินจะขาด</h3>
        <InfoHint>เงินที่ต้องเหลือในบัญชีอย่างน้อย (กันไว้จ่ายของฉุกเฉิน) · กราฟมีเส้นนี้ · ทุกเช้า 8 โมงระบบเช็กล่วงหน้า แล้วส่งกระดิ่งถึงแอดมินเมื่อเงินจะต่ำกว่านี้ (ไม่ส่ง LINE — ข้อมูลเงินห้ามเข้ากลุ่มพนักงาน) · ใช้ร่วมทุกคน ไม่ใช่ต่อเครื่อง</InfoHint>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">เงินกันขั้นต่ำ (บาท)</label>
          <MoneyInput value={draft.safetyBuffer} disabled={!canManage} onChange={(v) => setDraft({ ...draft, safetyBuffer: Math.max(0, Number(v || 0)) })}
            className="w-full h-9 px-2.5 text-sm text-right border border-slate-200 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">มองล่วงหน้า</label>
          <select value={draft.alertDays} disabled={!canManage} onChange={(e) => setDraft({ ...draft, alertDays: Number(e.target.value) })}
            className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg bg-white">
            {ALERT_DAY_OPTIONS.map((d) => <option key={d} value={d}>{d} วัน</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 mt-5">
          <input type="checkbox" checked={draft.alertEnabled} disabled={!canManage} onChange={(e) => setDraft({ ...draft, alertEnabled: e.target.checked })} />
          เตือนแอดมินทุกเช้า 8 โมง (กระดิ่ง)
        </label>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {canManage && (
          <button type="button" onClick={save} disabled={!dirty || saving} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        )}
        {canManage && (
          <button type="button" onClick={runTest} disabled={testing} className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {testing ? "กำลังเช็ก…" : "ทดสอบตอนนี้ (ไม่ส่งจริง)"}
          </button>
        )}
        {!canManage && <span className="text-xs text-slate-400">ดูได้อย่างเดียว — แก้ต้องมีสิทธิ์จัดการกระแสเงินสด</span>}
        {dirty && <span className="text-xs text-amber-700">ยังไม่ได้บันทึก</span>}
      </div>
      {test && (
        <div className={`mt-3 text-sm rounded-lg px-3 py-2 border ${test.error ? "bg-red-50 border-red-200 text-red-700" : test.skipped ? "bg-slate-50 border-slate-200 text-slate-600" : test.first ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
          {test.error ? test.error
            : test.skipped ? `ยังไม่เตือน: ${test.skipped}`
            : test.first ? `ถ้าเป็นเช้าวันนี้จะเตือน: วันที่ ${formatDayMonthTH(test.first.date)} เงินเหลือ ${THB(test.first.balance)} · ต่ำสุด ${THB(test.low?.balance ?? 0)} · ต้องหาเงินเพิ่ม ${THB(test.shortfall ?? 0)}${test.odHeadroom ? ` · OD ยังเบิกได้ ${THB(test.odHeadroom)}` : ""}`
            : "ช่วงที่มองล่วงหน้า เงินไม่ต่ำกว่าเงินกันขั้นต่ำ — เช้านี้จะไม่ส่งอะไร"}
        </div>
      )}
    </section>
  );
}
