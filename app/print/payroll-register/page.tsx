"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  buildPayrollRegisterPrintHref,
  normalizePayrollRegisterPaper,
  type PayrollRegisterPaper,
} from "@/lib/payroll-register-print";

type RegisterRow = {
  id: string;
  employee_code: string;
  employee_name: string;
  nickname: string;
  identity_no: string;
  base_salary: number;
  mid_month_paid: number;
  month_end_pay: number;
  transfer_net_pay: number;
  overtime_amount: number;
  cash_pay: number;
  social_security: number;
  balance: number;
};

type RegisterResponse = {
  company_name: string;
  period: { id: string; period_name: string; status: string; start_date?: string | null; end_date?: string | null };
  run: { id: string; run_no: number | string | null; calculated_at?: string | null } | null;
  rows: RegisterRow[];
  totals: Omit<RegisterRow, "id" | "employee_code" | "employee_name" | "nickname" | "identity_no"> & { count: number };
};

const num = (value: unknown) => Number(value) || 0;
const money = (value: unknown) => num(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dashMoney = (value: unknown) => Math.abs(num(value)) > 0.004 ? money(value) : "";

export default function PayrollRegisterPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">กำลังโหลดทะเบียนเงินเดือน...</div>}>
      <PayrollRegisterPrintContent />
    </Suspense>
  );
}

function PayrollRegisterPrintContent({ embedded = false }: { embedded?: boolean } = {}) {
  const params = useSearchParams();
  const [data, setData] = useState<RegisterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => params.toString(), [params]);
  const periodId = params.get("period_id") ?? "";
  const currentPaper = normalizePayrollRegisterPaper(params.get("paper"));
  const isEmbedded = embedded || params.get("embedded") === "1";

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/payroll/register?period_id=${encodeURIComponent(periodId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json.data as RegisterResponse);
        }
      })
      .catch(() => setError("โหลดทะเบียนเงินเดือนไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [periodId, queryString]);

  function changePaper(paper: PayrollRegisterPaper) {
    window.location.href = buildPayrollRegisterPrintHref({
      periodId,
      paper,
      embedded: isEmbedded,
    });
  }

  return (
    <div className={`payroll-register-print ${currentPaper} min-h-screen bg-slate-100 py-5 text-slate-950 print:bg-white print:py-0 ${isEmbedded ? "py-3" : ""}`}>
      {!isEmbedded && (
        <div className="print-toolbar mx-auto mb-4 flex max-w-7xl flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-slate-800">ทะเบียนเงินเดือน</div>
            <div className="text-xs text-slate-500">{data?.period.period_name ?? "Payroll"} · {data?.rows.length ?? 0} รายการ</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={currentPaper} onChange={(e) => changePaper(e.target.value as PayrollRegisterPaper)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm">
              <option value="a4-landscape">A4 แนวนอน</option>
              <option value="a3-landscape">A3 แนวนอน</option>
            </select>
            <a href="/payroll/payslips" className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">กลับ</a>
            <button onClick={() => window.print()} disabled={!data?.rows.length}
              className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
              Print
            </button>
          </div>
        </div>
      )}

      {loading && <div className="mx-auto max-w-7xl rounded-lg bg-white p-8 text-center text-sm text-slate-500">กำลังโหลด...</div>}
      {error && <div className="mx-auto max-w-7xl rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!loading && !error && data?.rows.length === 0 && (
        <div className="mx-auto max-w-7xl rounded-lg bg-white p-8 text-center text-sm text-slate-500">ยังไม่มีผลคำนวณเงินเดือนสำหรับงวดนี้</div>
      )}

      {data && data.rows.length > 0 && <RegisterSheet data={data} />}

      <style>{`
        .payroll-register-print {
          --register-preview-width: 297mm;
          --register-font-size: 10px;
          --register-header-font-size: 10px;
          --register-cell-padding: 3px 4px;
        }
        .payroll-register-print.a3-landscape {
          --register-preview-width: 420mm;
          --register-font-size: 11px;
          --register-header-font-size: 11px;
          --register-cell-padding: 4px 5px;
        }
        .register-sheet {
          box-sizing: border-box;
          width: min(calc(100vw - 32px), var(--register-preview-width));
        }
        .register-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          font-size: var(--register-font-size);
          line-height: 1.15;
        }
        .register-table th,
        .register-table td {
          border: 1px solid #9ca3af;
          padding: var(--register-cell-padding);
          vertical-align: middle;
        }
        .register-table th {
          font-size: var(--register-header-font-size);
          font-weight: 700;
          text-align: center;
          background: #f8fafc;
        }
        .register-table .amount {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .register-table .center {
          text-align: center;
        }
        .register-table .name-cell {
          font-weight: 600;
        }
        .register-table .muted {
          color: #64748b;
          font-size: 9px;
        }
        .register-table .social-security {
          background: #fff200;
        }
        .register-table .total-row td {
          font-weight: 800;
          background: #f8fafc;
        }
        .register-table .total-row .social-security {
          background: #fff200;
        }
        @page {
          size: ${currentPaper === "a3-landscape" ? "420mm 297mm" : "297mm 210mm"};
          margin: 8mm;
        }
        @media print {
          html, body {
            margin: 0 !important;
            background: white !important;
          }
          .print-toolbar {
            display: none !important;
          }
          .payroll-register-print {
            min-height: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .register-sheet {
            width: auto !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .register-table {
            page-break-inside: auto;
          }
          .register-table thead {
            display: table-header-group;
          }
          .register-table tfoot {
            display: table-footer-group;
          }
          .register-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function RegisterSheet({ data }: { data: RegisterResponse }) {
  return (
    <section className="register-sheet mx-auto rounded-md border border-slate-200 bg-white p-4 shadow-sm print:p-0">
      <div className="mb-2 text-center">
        <div className="text-sm font-bold">{data.company_name}</div>
        <div className="mt-1 text-base font-bold">ทะเบียนเงินเดือน {data.period.period_name}</div>
        <div className="mt-1 text-[11px] text-slate-500">Run {data.run?.run_no ?? "-"} · {data.rows.length.toLocaleString("th-TH")} รายการ</div>
      </div>

      <table className="register-table">
        <colgroup>
          <col style={{ width: "34px" }} />
          <col style={{ width: "150px" }} />
          <col style={{ width: "82px" }} />
          <col style={{ width: "180px" }} />
          <col style={{ width: "88px" }} />
          <col style={{ width: "88px" }} />
          <col style={{ width: "88px" }} />
          <col style={{ width: "78px" }} />
          <col style={{ width: "78px" }} />
          <col style={{ width: "82px" }} />
          <col style={{ width: "92px" }} />
        </colgroup>
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>ชื่อ-นามสกุล</th>
            <th>ชื่อเล่น</th>
            <th>เลขบัตรประชาชน</th>
            <th>ฐานเงินเดือน</th>
            <th>เงินเดือน 16</th>
            <th>เงินเดือน 31</th>
            <th>OT 31</th>
            <th>เงินสด</th>
            <th className="social-security">ปกส. 5%</th>
            <th>ยอดคงเหลือ</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={row.id || row.employee_code}>
              <td className="center">{index + 1}</td>
              <td className="name-cell">
                {row.employee_name || "-"}
                <div className="muted">{row.employee_code || "-"}</div>
              </td>
              <td className="center">{row.nickname || "-"}</td>
              <td className="center">{row.identity_no || "-"}</td>
              <td className="amount">{money(row.base_salary)}</td>
              <td className="amount">{dashMoney(row.mid_month_paid)}</td>
              <td className="amount">{money(row.month_end_pay)}</td>
              <td className="amount">{dashMoney(row.overtime_amount)}</td>
              <td className="amount">{dashMoney(row.cash_pay)}</td>
              <td className="amount social-security">{money(row.social_security)}</td>
              <td className="amount">{money(row.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td className="center" colSpan={4}>รวม {data.totals.count.toLocaleString("th-TH")} รายการ</td>
            <td className="amount">{money(data.totals.base_salary)}</td>
            <td className="amount">{dashMoney(data.totals.mid_month_paid)}</td>
            <td className="amount">{money(data.totals.month_end_pay)}</td>
            <td className="amount">{dashMoney(data.totals.overtime_amount)}</td>
            <td className="amount">{dashMoney(data.totals.cash_pay)}</td>
            <td className="amount social-security">{money(data.totals.social_security)}</td>
            <td className="amount">{money(data.totals.balance)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
