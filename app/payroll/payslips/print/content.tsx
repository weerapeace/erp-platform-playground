"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  buildPayslipPrintHref,
  encodePayslipNetPay,
  normalizePayslipPrintPaper,
  normalizePayslipPrintLanguage,
  payslipDisplayMoneyItems,
  roundPayslipNetPay,
  type PayslipMoneyItem,
  type PayslipPrintLanguage,
  type PayslipPrintPaper,
} from "@/lib/payroll-payslip-print";

type Line = Record<string, unknown>;
type PrintSlip = {
  id: string;
  payslip_no: string;
  employee_code: string;
  employee_name: string;
  nickname: string;
  payslip_language: "th" | "en";
  bank_name: string;
  bank_branch: string;
  bank_account_no: string;
  bank_account_name: string;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  status: string;
  issued_at: string | null;
  run_no: number | string | null;
  line: Line;
};
type PrintResponse = {
  period: { id: string; period_name: string; status: string; start_date?: string | null; end_date?: string | null };
  requested_language: PayslipPrintLanguage;
  slips: PrintSlip[];
};

const money = (value: unknown) => Number(value) || 0;
const baht = (value: unknown) => `฿${money(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function label(lang: "th" | "en", th: string, en: string) {
  return lang === "th" ? th : en;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "numeric", year: "numeric" });
}

function itemRows(items: PayslipMoneyItem[], lang: "th" | "en") {
  const rows = items.map((item) => ({ key: item.key, label: label(lang, item.th, item.en), amount: item.amount }));
  return rows.length ? rows : [{ key: "-", label: "-", amount: 0 }];
}

export function PayslipPrintContent({ embedded = false }: { embedded?: boolean } = {}) {
  const params = useSearchParams();
  const [data, setData] = useState<PrintResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => params.toString(), [params]);
  const periodId = params.get("period_id") ?? "";
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const currentLanguage = normalizePayslipPrintLanguage(params.get("lang"));
  const currentPaper = normalizePayslipPrintPaper(params.get("paper"));

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/payroll/payslips/print?${queryString}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json.data as PrintResponse);
        }
      })
      .catch(() => setError("โหลดข้อมูลพิมพ์สลิปไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [queryString]);

  function changeLanguage(language: PayslipPrintLanguage) {
    window.location.href = buildPayslipPrintHref({
      periodId,
      payslipIds: ids,
      language,
      paper: currentPaper,
      basePath: embedded ? "/print/payroll-payslips" : "/payroll/payslips/print",
      embedded,
    });
  }

  function changePaper(paper: PayslipPrintPaper) {
    window.location.href = buildPayslipPrintHref({
      periodId,
      payslipIds: ids,
      language: currentLanguage,
      paper,
      basePath: embedded ? "/print/payroll-payslips" : "/payroll/payslips/print",
      embedded,
    });
  }

  return (
    <div className={`payroll-slip-print ${currentPaper} min-h-screen bg-slate-100 text-slate-900 print:bg-white print:py-0 ${embedded ? "py-3" : "py-5"}`}>
      {!embedded && <div className="print-toolbar mx-auto mb-4 flex max-w-[980px] flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-slate-800">Print Slip</div>
          <div className="text-xs text-slate-500">{data?.period.period_name ?? "Payroll"} · {data?.slips.length ?? 0} ใบ</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={currentLanguage} onChange={(e) => changeLanguage(e.target.value as PayslipPrintLanguage)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm">
            <option value="employee">ตามพนักงาน</option>
            <option value="th">ไทยทั้งหมด</option>
            <option value="en">English all</option>
          </select>
          <select value={currentPaper} onChange={(e) => changePaper(e.target.value as PayslipPrintPaper)}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm">
            <option value="a6-landscape">A6 แนวนอน</option>
            <option value="a5-landscape">A5 แนวนอน</option>
          </select>
          <a href="/payroll/payslips" className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">กลับ</a>
          <button onClick={() => window.print()} disabled={!data?.slips.length}
            className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            Print
          </button>
        </div>
      </div>}

      {loading && <div className="mx-auto max-w-[980px] rounded-lg bg-white p-8 text-center text-sm text-slate-500">กำลังโหลด...</div>}
      {error && <div className="mx-auto max-w-[980px] rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!loading && !error && data?.slips.length === 0 && (
        <div className="mx-auto max-w-[980px] rounded-lg bg-white p-8 text-center text-sm text-slate-500">ไม่มีสลิปสำหรับพิมพ์</div>
      )}

      <div className="mx-auto max-w-[980px] space-y-6 print:max-w-none print:space-y-0">
        {data?.slips.map((slip) => <PayslipSheet key={slip.id} period={data.period} slip={slip} />)}
      </div>

      <style>{`
        .payroll-slip-print {
          --payslip-page-width: 148mm;
          --payslip-page-height: 105mm;
          --payslip-page-padding: 8px;
          --payslip-page-gap: 8px;
        }
        .payroll-slip-print.a5-landscape {
          --payslip-page-width: 210mm;
          --payslip-page-height: 148mm;
          --payslip-page-padding: 14px;
          --payslip-page-gap: 14px;
        }
        .payslip-page {
          box-sizing: border-box;
          width: var(--payslip-page-width);
          min-height: var(--payslip-page-height);
          padding: var(--payslip-page-padding) !important;
        }
        .payslip-main-grid {
          gap: var(--payslip-page-gap);
        }
        @page {
          size: ${currentPaper === "a5-landscape" ? "210mm 148mm" : "148mm 105mm"};
          margin: 0;
        }
        @media print {
          html, body { width: 100%; margin: 0 !important; background: white !important; }
          .print-toolbar { display: none !important; }
          .payroll-slip-print { min-height: 0 !important; padding: 0 !important; background: white !important; }
          .payroll-slip-print > .mx-auto { width: var(--payslip-page-width) !important; max-width: none !important; margin: 0 !important; }
          .payslip-page {
            break-after: auto;
            page-break-after: auto;
            box-shadow: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            margin: 0 !important;
            width: var(--payslip-page-width) !important;
            height: var(--payslip-page-height) !important;
            min-height: 0 !important;
            overflow: hidden;
          }
          .payslip-page + .payslip-page {
            break-before: page;
            page-break-before: always;
          }
          .payslip-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .a6-landscape .payslip-page { padding: 3.5mm !important; }
          .a6-landscape .payslip-page header { margin-bottom: 1.8mm !important; padding-bottom: 1.4mm !important; }
          .a6-landscape .payslip-page h1 { font-size: 15px !important; line-height: 1.05 !important; margin-top: 0 !important; }
          .a6-landscape .payslip-page header .min-w-\\[170px\\] { min-width: 37mm !important; padding: 1.4mm !important; }
          .a6-landscape .payslip-page .grid.min-h-\\[38px\\] { min-height: 9.5mm !important; grid-template-columns: 17mm 1fr !important; }
          .a6-landscape .payslip-page .grid.min-h-\\[38px\\] > div { padding: 1.4mm !important; }
          .a6-landscape .payslip-page .mt-2 { margin-top: 1.8mm !important; }
          .a6-landscape .payslip-page .mt-3 { margin-top: 2mm !important; }
          .a6-landscape .payslip-page .payslip-main-grid { grid-template-columns: 1fr 1fr 31mm !important; gap: 2mm !important; }
          .a6-landscape .payslip-page .payslip-main-grid > div { font-size: 9px !important; line-height: 1.15 !important; }
          .a6-landscape .payslip-page .payslip-main-grid .text-sm { font-size: 10px !important; }
          .a6-landscape .payslip-page .payslip-main-grid .grid { grid-template-columns: 1fr 22mm !important; }
          .a6-landscape .payslip-page .payslip-main-grid .px-2 { padding-left: 1.4mm !important; padding-right: 1.4mm !important; }
          .a6-landscape .payslip-page .payslip-main-grid .py-1\\.5 { padding-top: 1mm !important; padding-bottom: 1mm !important; }
          .a6-landscape .payslip-page .border-2 { border-width: 1.5px !important; padding: 1.8mm !important; }
          .a6-landscape .payslip-page .text-2xl { font-size: 18px !important; line-height: 1.05 !important; }
        }
      `}</style>
    </div>
  );
}

function PayslipSheet({ period, slip }: { period: PrintResponse["period"]; slip: PrintSlip }) {
  const lang = slip.payslip_language;
  const displayItems = payslipDisplayMoneyItems(slip.line);
  const earnings = itemRows(displayItems.earnings, lang);
  const deductions = itemRows(displayItems.deductions, lang);
  const extraEarningsTotal = displayItems.earnings.reduce((sum, item) => sum + item.amount, 0);
  const roundedNet = roundPayslipNetPay(slip.net_pay);
  const encodedNetPay = encodePayslipNetPay(roundedNet.rounded);
  const workDays = money(slip.line.work_days || slip.line.attendance_days);
  const workHours = money(slip.line.work_hours || slip.line.attendance_hours);
  const late = money(slip.line.late_deduction);
  const absent = money(slip.line.absence_hours || slip.line.absence_deduction);
  const leave = money(slip.line.leave_days || slip.line.unpaid_leave_days);
  const ot = money(slip.line.ot_hours || slip.line.overtime_hours);

  return (
    <section className="payslip-page rounded-md border border-slate-200 bg-white shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-3 border-b-2 border-slate-800 pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ISG PAYROLL</div>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{label(lang, "ใบสรุปเงินเดือน", "Payslip")}</h1>
          <div className="mt-0.5 text-xs text-slate-500">
            {period.period_name} · {fmtDate(period.start_date)} - {fmtDate(period.end_date)}
          </div>
        </div>
        <div className="min-w-[170px] border border-slate-200 p-2 text-right">
          <div className="text-sm font-bold text-slate-800">{slip.employee_code}</div>
          <div className="mt-1 text-[10px] text-slate-500">{slip.payslip_no}</div>
          <div className="text-xs text-slate-500">Run {slip.run_no ?? "-"}</div>
        </div>
      </header>

      <InfoGrid slip={slip} lang={lang} />

      <div className="mt-2 grid grid-cols-6 border border-slate-200 text-center text-xs">
        <Metric label={label(lang, "วันทำงาน", "Work Days")} value={`${workDays.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label(lang, "วัน", "day")}`} />
        <Metric label={label(lang, "ชั่วโมงทำงาน", "Work Hours")} value={`${workHours.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label(lang, "ชม.", "hrs")}`} />
        <Metric label={label(lang, "มาสาย", "Late/Early Leave")} value={late ? baht(late * -1) : "-"} danger={late > 0} />
        <Metric label={label(lang, "ขาดงาน", "Absent")} value={absent ? String(absent) : "-"} />
        <Metric label={label(lang, "ลา", "Leave")} value={leave ? String(leave) : "-"} />
        <Metric label="OT" value={ot ? String(ot) : "-"} />
      </div>

      <div className="payslip-main-grid mt-3 grid grid-cols-[1fr_1fr_150px]">
        <AmountPanel title={label(lang, "รายการรายได้", "Earnings")} tone="green" rows={earnings} totalLabel={label(lang, "รวมรายได้", "Total Earnings")} total={extraEarningsTotal} />
        <AmountPanel title={label(lang, "รายการหัก", "Deductions")} tone="red" rows={deductions} totalLabel={label(lang, "รวมหัก", "Total Deductions")} total={slip.total_deduction} />
        <NetPayBox lang={lang} encodedNetPay={encodedNetPay} />
      </div>
    </section>
  );
}

function InfoGrid({ slip, lang }: { slip: PrintSlip; lang: "th" | "en" }) {
  const name = slip.employee_name || "-";
  const nickname = slip.nickname || "-";
  const bank = slip.bank_name || "-";
  const account = slip.bank_account_no || "-";
  const payDate = fmtDate(slip.issued_at);
  return (
    <div className="grid grid-cols-6 border border-slate-200 text-xs">
      <InfoPair label={label(lang, "รหัสพนักงาน", "Employee ID")} value={slip.employee_code || "-"} />
      <InfoPair label={label(lang, "ชื่อ-นามสกุล", "Name")} value={name} />
      <InfoPair label={label(lang, "ชื่อเล่น", "Nickname")} value={nickname} />
      <InfoPair label={label(lang, "ธนาคาร", "Bank")} value={bank} />
      <InfoPair label={label(lang, "เลขที่บัญชี", "Account No.")} value={account} />
      <InfoPair label={label(lang, "วันที่จ่าย", "Payment Date")} value={payDate} />
    </div>
  );
}

function InfoPair({ label: labelText, value, span = 2 }: { label: string; value: string; span?: number }) {
  return (
    <div className={`grid min-h-[38px] grid-cols-[76px_1fr] border-b border-r border-slate-100 ${span === 2 ? "col-span-2" : ""}`}>
      <div className="bg-slate-50 p-2 text-[10px] font-semibold leading-tight text-slate-500">{labelText}</div>
      <div className="p-2 font-semibold leading-tight text-slate-800">{value}</div>
    </div>
  );
}

function Metric({ label: labelText, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="border-r border-slate-100">
      <div className="bg-slate-50 px-1.5 py-1.5 text-[10px] font-semibold leading-tight text-slate-500">{labelText}</div>
      <div className={`px-1.5 py-2 font-bold leading-tight ${danger ? "text-red-600" : "text-slate-700"}`}>{value}</div>
    </div>
  );
}

function AmountPanel({ title, tone, rows, totalLabel, total }: {
  title: string;
  tone: "green" | "red";
  rows: { key: string; label: string; amount: number }[];
  totalLabel: string;
  total: number;
}) {
  const titleClass = tone === "green" ? "bg-emerald-700" : "bg-red-600";
  const totalClass = tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600";
  return (
    <div className="border border-slate-200 text-xs">
      <div className={`${titleClass} px-2 py-1.5 text-sm font-bold text-white`}>{title}</div>
      <div className="grid grid-cols-[1fr_92px] border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-[10px] font-semibold text-slate-500">
        <span>Item</span><span className="text-right">Amount</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_92px] border-b border-slate-100 px-2 py-1.5">
          <span>{row.label}</span><span className="text-right tabular-nums">{row.amount ? baht(row.amount) : "-"}</span>
        </div>
      ))}
      <div className={`grid grid-cols-[1fr_92px] px-2 py-1.5 font-bold ${totalClass}`}>
        <span>{totalLabel}</span><span className="text-right tabular-nums">{baht(total)}</span>
      </div>
    </div>
  );
}

function NetPayBox({ lang, encodedNetPay }: {
  lang: "th" | "en";
  encodedNetPay: string;
}) {
  return (
    <div className="flex flex-col justify-center">
      <div className="border-2 border-blue-500 p-3 text-center text-blue-700">
        <div className="text-xs font-semibold">{label(lang, "ยอดจ่ายสุทธิ", "Net Pay")}</div>
        <div className="mt-2 break-all text-2xl font-extrabold leading-tight">{encodedNetPay || "-"}</div>
      </div>
    </div>
  );
}
