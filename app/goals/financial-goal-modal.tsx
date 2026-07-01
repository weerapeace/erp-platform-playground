"use client";

// ป๊อปอัป "เป้าหมายเก็บเงิน" + เครื่องคำนวณ (บ้าน / เก็บเงินก้อน)
// คำนวณสลับได้ 2 ทาง: เก็บเดือนละ→ใช้เวลา  /  ภายในกี่ปี→เก็บเดือนละ
// สร้างหมุดหมาย 25/50/75/100% + ค่างวดผ่อนบ้านโดยประมาณ
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { TODAY_ISO, type GoalDraft } from "./mock-data";

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const baht = (n: number) => Math.round(n).toLocaleString("th-TH");

function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function monthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${TH_MONTH[m - 1]} ${y}`;
}
function mortgage(loan: number, annualPct: number, years: number): number {
  if (loan <= 0 || years <= 0) return 0;
  const r = annualPct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loan / n;
  const p = Math.pow(1 + r, n);
  return (loan * r * p) / (p - 1);
}
const num = (v: string) => Number(v) || 0;

export function FinancialGoalModal({
  open, onClose, onCreate,
}: {
  open: boolean; onClose: () => void; onCreate: (draft: GoalDraft) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"house" | "lump" | "dividend">("house");
  const [price, setPrice] = useState("3000000");
  const [downPct, setDownPct] = useState("15");
  const [targetLump, setTargetLump] = useState("");
  const [current, setCurrent] = useState("0");
  const [direction, setDirection] = useState<"byMonthly" | "byTime">("byMonthly");
  const [monthly, setMonthly] = useState("15000");
  const [saveYears, setSaveYears] = useState("2");
  const [interestPct, setInterestPct] = useState("3");
  const [loanYears, setLoanYears] = useState("30");
  const [dividendMonthly, setDividendMonthly] = useState("");
  const [dividendRate, setDividendRate] = useState("5");
  const [dividendModel, setDividendModel] = useState<"perpetual" | "annuity">("perpetual");
  const [showError, setShowError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const c = useMemo(() => {
    // ค่างวดผ่อน (ใช้ทั้งโหมดบ้าน + ปันผล)
    const downAmt = Math.round(num(price) * num(downPct) / 100);
    const loan = kind === "lump" ? 0 : Math.max(0, num(price) - downAmt);
    const mMonthly = kind === "lump" ? 0 : Math.round(mortgage(loan, num(interestPct), num(loanYears)));

    let target = 0;      // ยอดที่ต้องเก็บ
    let divMonthly = 0;  // ปันผลต่อเดือน (โหมดปันผล)
    if (kind === "house") target = downAmt;
    else if (kind === "lump") target = num(targetLump);
    else {
      // โหมดปันผลผ่อนบ้าน: หาเงินก้อนที่ปันผลพอจ่ายค่างวด
      divMonthly = num(dividendMonthly) || mMonthly;
      const rate = num(dividendRate);
      const nMonths = Math.round(num(loanYears) * 12);
      let deposit = 0;
      if (rate > 0 && divMonthly > 0) {
        if (dividendModel === "perpetual") {
          deposit = divMonthly * 1200 / rate;                        // เงินต้นคงไว้
        } else {
          const i = rate / 100 / 12;                                 // ใช้เงินต้นด้วย (annuity PV)
          deposit = i > 0 ? divMonthly * (1 - Math.pow(1 + i, -nMonths)) / i : divMonthly * nMonths;
        }
      }
      target = Math.round(deposit);
    }

    const cur = num(current);
    const remaining = Math.max(0, target - cur);
    let months = 0, perMonth = 0;
    if (direction === "byMonthly") { perMonth = num(monthly); months = perMonth > 0 ? Math.ceil(remaining / perMonth) : 0; }
    else { months = Math.round(num(saveYears) * 12); perMonth = months > 0 ? Math.ceil(remaining / months) : 0; }
    const finishISO = months > 0 ? addMonthsISO(TODAY_ISO, months) : "";
    const milestones = [0.25, 0.5, 0.75, 1].map((f) => ({
      pct: f * 100, amount: Math.round(target * f),
      date: months > 0 ? addMonthsISO(TODAY_ISO, Math.round(months * f)) : "",
    }));
    return { target, cur, remaining, months, perMonth, finishISO, loan, mMonthly, divMonthly, milestones };
  }, [kind, price, downPct, targetLump, current, direction, monthly, saveYears, interestPct, loanYears, dividendMonthly, dividendRate, dividendModel]);

  const valid = title.trim() !== "" && c.target > 0 && c.months > 0 && c.perMonth > 0;

  function reset() {
    setTitle(""); setKind("house"); setPrice("3000000"); setDownPct("15"); setTargetLump("");
    setCurrent("0"); setDirection("byMonthly"); setMonthly("15000"); setSaveYears("2");
    setInterestPct("3"); setLoanYears("30");
    setDividendMonthly(""); setDividendRate("5"); setDividendModel("perpetual");
    setShowError(false);
  }
  function close() { reset(); onClose(); }

  async function submit() {
    if (!valid) { setShowError(true); return; }
    const draft: GoalDraft = {
      title: title.trim(),
      category: "finance",
      level: "personal",
      measure_type: "currency",
      measure_unit: "บาท",
      start_value: c.cur,
      current_value: c.cur,
      target_value: c.target,
      target_date: c.finishISO || undefined,
      reward: { per_step: 10, on_achieve: 100, units_per_coin: 10000 },
      plan: {
        kind,
        price: kind !== "lump" ? num(price) : undefined,
        down_pct: kind !== "lump" ? num(downPct) : undefined,
        monthly: c.perMonth,
        months: c.months,
        interest_pct: kind !== "lump" ? num(interestPct) : undefined,
        years: kind !== "lump" ? num(loanYears) : undefined,
        mortgage_monthly: kind !== "lump" ? c.mMonthly : undefined,
        finish_date: c.finishISO || undefined,
        dividend_monthly: kind === "dividend" ? c.divMonthly : undefined,
        dividend_rate: kind === "dividend" ? num(dividendRate) : undefined,
        dividend_model: kind === "dividend" ? dividendModel : undefined,
        required_deposit: kind === "dividend" ? c.target : undefined,
      },
      steps: c.milestones.map((ms) => ({ title: `เก็บได้ ${ms.pct}% (${baht(ms.amount)} บาท)`, target_date: ms.date || undefined })),
    };
    setSubmitting(true);
    const ok = await onCreate(draft);
    setSubmitting(false);
    if (ok) reset();
  }

  return (
    <ERPModal
      open={open} onClose={close} title="💰 เป้าหมายเก็บเงิน" description="ใส่ตัวเลข ระบบคำนวณแผน + สร้างหมุดหมายให้อัตโนมัติ" size="lg" storageKey="goal-financial"
      hasUnsavedChanges={title.trim() !== ""}
      footer={
        <>
          <button onClick={close} disabled={submitting} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={submit} disabled={submitting} className="h-9 px-4 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">{submitting ? "กำลังบันทึก..." : "สร้างเป้าหมาย"}</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อเป้าหมาย" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ซื้อบ้าน / เก็บเงินแต่งงาน"
            className={`w-full h-9 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${showError && !title.trim() ? "border-red-300" : "border-slate-200"}`} />
        </Field>

        {/* โหมด */}
        <div className="flex gap-2 flex-wrap">
          <ModeBtn active={kind === "house"} onClick={() => setKind("house")}>🏠 ซื้อบ้าน</ModeBtn>
          <ModeBtn active={kind === "lump"} onClick={() => setKind("lump")}>💰 เก็บเงินก้อน</ModeBtn>
          <ModeBtn active={kind === "dividend"} onClick={() => setKind("dividend")}>📈 ปันผลผ่อนบ้าน</ModeBtn>
        </div>

        {kind === "house" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="ราคาบ้าน (บาท)"><NumInput value={price} onChange={setPrice} /></Field>
            <Field label="เงินดาวน์ (%)"><NumInput value={downPct} onChange={setDownPct} /></Field>
            <div className="col-span-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-sm text-teal-800">
              💡 เงินดาวน์ที่ต้องเก็บ = ราคาบ้าน × {num(downPct)}% = <span className="font-semibold">{baht(c.target)} บาท</span>
            </div>
          </div>
        )}

        {kind === "lump" && (
          <Field label="ยอดที่ต้องการเก็บ (บาท)"><NumInput value={targetLump} onChange={setTargetLump} /></Field>
        )}

        {kind === "dividend" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="ราคาบ้าน (บาท)"><NumInput value={price} onChange={setPrice} /></Field>
              <Field label="เงินดาวน์ (%)"><NumInput value={downPct} onChange={setDownPct} /></Field>
              <Field label="ดอกเบี้ยกู้ (%/ปี)"><NumInput value={interestPct} onChange={setInterestPct} /></Field>
              <Field label="จำนวนปีผ่อน"><NumInput value={loanYears} onChange={setLoanYears} /></Field>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
              🏦 กู้ {baht(c.loan)} → ค่างวดผ่อนราว <span className="font-semibold">{baht(c.mMonthly)}</span>/เดือน
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ปันผลที่อยากได้/เดือน (บาท)"><NumInput value={dividendMonthly} onChange={setDividendMonthly} placeholder={String(c.mMonthly || "")} /></Field>
              <Field label="อัตราปันผล (%/ปี)"><NumInput value={dividendRate} onChange={setDividendRate} /></Field>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-600 mb-1.5">วิธีคิดเงินก้อน</div>
              <div className="flex gap-2">
                <ModeBtn active={dividendModel === "perpetual"} onClick={() => setDividendModel("perpetual")}>เงินต้นคงไว้</ModeBtn>
                <ModeBtn active={dividendModel === "annuity"} onClick={() => setDividendModel("annuity")}>ใช้เงินต้นด้วย</ModeBtn>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-800">
              📈 ต้องมีเงินก้อน <span className="font-semibold">{baht(c.target)} บาท</span> — ปันผล {num(dividendRate)}%/ปี ได้เดือนละ ~{baht(c.divMonthly)} พอผ่อน
              <div className="text-xs text-emerald-600 mt-0.5">{dividendModel === "perpetual" ? "เงินต้นคงไว้ ปันผลจ่ายค่างวดไปเรื่อย ๆ" : `ทยอยใช้เงินต้น จนหมดพอดีเมื่อผ่อนจบ (${num(loanYears)} ปี)`}</div>
            </div>
          </div>
        )}

        <Field label="เงินที่มีอยู่แล้ว (บาท)"><NumInput value={current} onChange={setCurrent} /></Field>

        {/* วิธีคำนวณ */}
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1.5">วิธีคำนวณ</div>
          <div className="flex gap-2 mb-3">
            <ModeBtn active={direction === "byMonthly"} onClick={() => setDirection("byMonthly")}>เก็บเดือนละเท่านี้</ModeBtn>
            <ModeBtn active={direction === "byTime"} onClick={() => setDirection("byTime")}>อยากได้ภายในกี่ปี</ModeBtn>
          </div>
          {direction === "byMonthly"
            ? <Field label="เก็บได้เดือนละ (บาท)"><NumInput value={monthly} onChange={setMonthly} /></Field>
            : <Field label="อยากได้ภายใน (ปี)"><NumInput value={saveYears} onChange={setSaveYears} /></Field>}
        </div>

        {/* ผลลัพธ์ */}
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          {c.target <= 0 ? (
            <div className="text-sm text-slate-500">กรอกตัวเลขให้ครบเพื่อคำนวณ</div>
          ) : c.remaining <= 0 ? (
            <div className="text-sm text-emerald-700 font-medium">มีเงินถึงเป้าแล้ว 🎉</div>
          ) : (
            <div className="text-sm text-teal-900 space-y-1">
              <div>ต้องเก็บอีก <span className="font-semibold">{baht(c.remaining)}</span> บาท</div>
              <div>{direction === "byMonthly" ? "ใช้เวลา" : "ต้องเก็บเดือนละ"} <span className="font-semibold">
                {direction === "byMonthly" ? `~${c.months} เดือน (${(c.months / 12).toFixed(1)} ปี)` : `${baht(c.perMonth)} บาท`}
              </span></div>
              <div>ถึงเป้าประมาณ <span className="font-semibold">{c.finishISO ? monthYear(c.finishISO) : "—"}</span></div>
              {kind === "house" && c.mMonthly > 0 && (
                <div className="pt-1 mt-1 border-t border-teal-200 text-teal-700">
                  🏦 ส่วนที่เหลือกู้ {baht(c.loan)} · ดอกเบี้ย {num(interestPct)}% · {num(loanYears)} ปี → ผ่อนราว <span className="font-semibold">{baht(c.mMonthly)}</span>/เดือน
                </div>
              )}
            </div>
          )}
        </div>

        {kind === "house" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="ดอกเบี้ยกู้ (% ต่อปี)"><NumInput value={interestPct} onChange={setInterestPct} /></Field>
            <Field label="จำนวนปีผ่อน"><NumInput value={loanYears} onChange={setLoanYears} /></Field>
          </div>
        )}

        {/* หมุดหมาย */}
        {c.target > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-600 mb-1.5">หมุดหมายที่ระบบจะสร้างให้</div>
            <div className="flex gap-2">
              {c.milestones.map((ms) => (
                <div key={ms.pct} className="flex-1 text-center bg-slate-50 border border-slate-200 rounded-lg py-2">
                  <div className="text-sm font-medium text-slate-700">{ms.pct}%</div>
                  <div className="text-xs text-slate-500">{baht(ms.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showError && !valid && <p className="text-xs text-red-500">กรุณากรอกชื่อ + ตัวเลขให้ครบ (เป้าหมายและแผนต้องมากกว่า 0)</p>}
      </div>
    </ERPModal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
    </div>
  );
}
function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />;
}
function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 h-9 text-sm font-medium rounded-lg border transition-colors ${active ? "bg-teal-50 border-teal-300 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {children}
    </button>
  );
}
