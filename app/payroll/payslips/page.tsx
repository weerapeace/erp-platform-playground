"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { usePayrollPeriod } from "@/components/payroll/payroll-period-context";
import { apiFetch } from "@/lib/api";
import { buildPayslipPrintHref, type PayslipPrintLanguage, type PayslipPrintPaper } from "@/lib/payroll-payslip-print";
import { buildPayrollRegisterPrintHref, type PayrollRegisterPaper } from "@/lib/payroll-register-print";

type Totals = { count: number; gross_pay: number; total_deduction: number; net_pay: number };
type Slip = {
  id: string;
  payslip_no: string;
  employee_code: string;
  employee_name: string;
  slip_type: string;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  status: string;
  issued_at: string | null;
};

const baht = (v: unknown) => v == null ? "-" : `฿${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
const SLIP_TYPE_TH: Record<string, string> = { month_end: "สิ้นเดือน", mid_month: "กลางเดือน", special: "พิเศษ", bonus: "โบนัส" };
const STATUS_TH: Record<string, { th: string; cls: string }> = {
  draft: { th: "ร่าง", cls: "bg-slate-100 text-slate-600" },
  issued: { th: "ออกแล้ว", cls: "bg-blue-100 text-blue-700" },
  review: { th: "รอตรวจ", cls: "bg-amber-100 text-amber-700" },
  approved: { th: "อนุมัติ", cls: "bg-blue-100 text-blue-700" },
  paid: { th: "จ่ายแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { th: "ยกเลิก", cls: "bg-red-100 text-red-700" },
};

function badge(status: string) {
  const meta = STATUS_TH[status] ?? { th: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.th}</span>;
}

export default function PayrollPayslipsPage() {
  const { periods, periodId, selectedPeriod: curPeriod, setPeriodId } = usePayrollPeriod();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [periodStatus, setPeriodStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [printLanguage, setPrintLanguage] = useState<PayslipPrintLanguage>("employee");
  const [printPaper, setPrintPaper] = useState<PayslipPrintPaper>("a6-landscape");
  const [printPreview, setPrintPreview] = useState<{ ids: string[]; href: string; fullHref: string; title: string } | null>(null);
  const [registerPaper, setRegisterPaper] = useState<PayrollRegisterPaper>("a4-landscape");
  const [registerPreview, setRegisterPreview] = useState<{ href: string; fullHref: string; title: string } | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const registerFrameRef = useRef<HTMLIFrameElement | null>(null);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/payslip-summary?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (j.error) {
        setErr(j.error);
        setTotals(null);
        setSlips([]);
        setSelectedIds(new Set());
      } else {
        setTotals(j.totals);
        setSlips(j.data as Slip[]);
        setPeriodStatus(j.period_status ?? "");
        setSelectedIds(new Set());
      }
    } catch {
      setErr("โหลดข้อมูลสลิปไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (periodId) void load(periodId); }, [periodId, load]);

  const shown = q.trim()
    ? slips.filter((s) => `${s.payslip_no} ${s.employee_code} ${s.employee_name}`.toLowerCase().includes(q.trim().toLowerCase()))
    : slips;
  const printIds = selectedIds.size
    ? slips.filter((s) => selectedIds.has(s.id)).map((s) => s.id)
    : shown.map((s) => s.id);
  const allShownSelected = shown.length > 0 && shown.every((s) => selectedIds.has(s.id));

  function toggleAllShown(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      shown.forEach((s) => { if (checked) next.add(s.id); else next.delete(s.id); });
      return next;
    });
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function buildPrintPreview(ids: string[], title: string, paper: PayslipPrintPaper) {
    const printInput = {
      periodId,
      payslipIds: ids,
      language: printLanguage,
      paper,
      basePath: "/print/payroll-payslips",
    };
    return {
      ids,
      href: buildPayslipPrintHref({ ...printInput, embedded: true }),
      fullHref: buildPayslipPrintHref(printInput),
      title,
    };
  }

  function openPrintPreview(ids: string[], title: string) {
    if (!periodId || !ids.length) return;
    setPrintPreview(buildPrintPreview(ids, title, printPaper));
  }

  function changePrintPaper(paper: PayslipPrintPaper) {
    setPrintPaper(paper);
    setPrintPreview((prev) => prev && periodId ? buildPrintPreview(prev.ids, prev.title, paper) : prev);
  }

  function printPreviewFrame() {
    const frame = printFrameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  function buildRegisterPreview(paper: PayrollRegisterPaper) {
    const title = `ทะเบียนเงินเดือน ${periods.find((p) => p.id === periodId)?.period_name ?? ""}`.trim();
    const input = { periodId, paper, basePath: "/print/payroll-register" };
    return {
      href: buildPayrollRegisterPrintHref({ ...input, embedded: true }),
      fullHref: buildPayrollRegisterPrintHref(input),
      title,
    };
  }

  function openRegisterPreview() {
    if (!periodId) return;
    setRegisterPreview(buildRegisterPreview(registerPaper));
  }

  function changeRegisterPaper(paper: PayrollRegisterPaper) {
    setRegisterPaper(paper);
    setRegisterPreview((prev) => prev && periodId ? buildRegisterPreview(paper) : prev);
  }

  function printRegisterFrame() {
    const frame = registerFrameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  function exportCsv() {
    const head = ["เลขที่สลิป", "รหัส", "พนักงาน", "ประเภท", "รายได้รวม", "หักรวม", "สุทธิ", "สถานะ"];
    const rows = shown.map((s) => [s.payslip_no, s.employee_code, s.employee_name, SLIP_TYPE_TH[s.slip_type] ?? s.slip_type, s.gross_pay, s.total_deduction, s.net_pay, s.status]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payslips-${periods.find((p) => p.id === periodId)?.period_name ?? "slip"}.csv`;
    a.click();
  }

  async function generate() {
    if (!periodId) return;
    const period = periods.find((x) => x.id === periodId);
    if (!confirm(`ออกสลิปงวด "${period?.period_name ?? ""}" จากผลคำนวณล่าสุด?\n\nสลิปที่มีอยู่จะถูกอัปเดต ไม่สร้างซ้ำ`)) return;
    setBusy(true);
    setErr(null);
    setGenMsg(null);
    try {
      const j = await apiFetch("/api/payroll/payslips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        setGenMsg(`ออกสลิปสำเร็จ - ใหม่ ${j.data.created} ใบ, อัปเดต ${j.data.updated} ใบ${j.data.failed?.length ? `, พลาด ${j.data.failed.length} ใบ` : ""} (รอบที่ ${j.data.run_no})`);
        await load(periodId);
      }
    } catch {
      setErr("ออกสลิปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = curPeriod && curPeriod.status !== "cancelled";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800">สลิปเงินเดือน</h1>
      <p className="text-sm text-slate-500 mb-4">
        เลือกงวดเพื่อดูสลิป รวมยอด พิมพ์รายคน หรือเลือกหลายใบแล้วพิมพ์พร้อมกัน
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-slate-500 mb-1">งวด</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-sm min-w-[240px]">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-500 mb-1">ค้นหา</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขสลิป / รหัส / ชื่อ"
            className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm" />
        </div>
        <button onClick={generate} disabled={busy || !canGenerate}
          className="h-10 px-4 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-40"
          title="สร้างสลิปจากผลคำนวณล่าสุดของงวด">
          {busy ? "กำลังออก..." : "ออกสลิปจากผลคำนวณ"}
        </button>
        <div>
          <label className="block text-xs text-slate-500 mb-1">ภาษาสลิป</label>
          <select value={printLanguage} onChange={(e) => setPrintLanguage(e.target.value as PayslipPrintLanguage)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-sm min-w-[135px]">
            <option value="employee">ตามพนักงาน</option>
            <option value="th">ไทยทั้งหมด</option>
            <option value="en">English all</option>
          </select>
        </div>
        <button type="button" onClick={() => openPrintPreview(printIds, `Print Slip (${printIds.length})`)} disabled={!printIds.length}
          className={`h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${printIds.length ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-100 text-slate-400"}`}>
          Print Slip ({printIds.length})
        </button>
        <button type="button" onClick={openRegisterPreview} disabled={!periodId}
          className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          ทะเบียนเงินเดือน
        </button>
        <button onClick={exportCsv} disabled={!slips.length}
          className="h-10 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          Export CSV
        </button>
        {curPeriod && <span className="h-10 flex items-center">{badge(periodStatus || curPeriod.status)}</span>}
      </div>

      {slips.length > 0 && (
        <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {selectedIds.size
            ? `เลือกสลิปไว้ ${selectedIds.size.toLocaleString("th-TH")} ใบ กด Print Slip เพื่อพิมพ์เฉพาะที่เลือก`
            : `ยังไม่ได้เลือกสลิป กด Print Slip จะพิมพ์รายการที่กำลังเห็นอยู่ ${shown.length.toLocaleString("th-TH")} ใบ`}
        </div>
      )}

      {genMsg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm mb-3">{genMsg}</div>}
      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{err}</div>}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card label="จำนวนสลิป" value={totals.count.toLocaleString("th-TH")} cls="bg-slate-50 text-slate-700 border-slate-200" />
          <Card label="รายได้รวม" value={baht(totals.gross_pay)} cls="bg-blue-50 text-blue-700 border-blue-200" />
          <Card label="หักรวม" value={baht(totals.total_deduction)} cls="bg-amber-50 text-amber-700 border-amber-200" />
          <Card label="จ่ายสุทธิ" value={baht(totals.net_pay)} cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input type="checkbox" checked={allShownSelected} onChange={(e) => toggleAllShown(e.target.checked)}
                    aria-label="เลือกสลิปที่แสดงทั้งหมด" />
                </th>
                <th className="text-left px-3 py-2">เลขที่สลิป</th>
                <th className="text-left px-3 py-2">พนักงาน</th>
                <th className="text-left px-3 py-2">ประเภท</th>
                <th className="text-right px-3 py-2">รายได้รวม</th>
                <th className="text-right px-3 py-2">หักรวม</th>
                <th className="text-right px-3 py-2">สุทธิ</th>
                <th className="text-center px-3 py-2">สถานะ</th>
                <th className="text-center px-3 py-2">พิมพ์</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={(e) => toggleOne(s.id, e.target.checked)}
                      aria-label={`เลือกสลิป ${s.payslip_no}`} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{s.payslip_no}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-slate-400">{s.employee_code}</span> {s.employee_name}</td>
                  <td className="px-3 py-2 text-slate-500">{SLIP_TYPE_TH[s.slip_type] ?? s.slip_type}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(s.gross_pay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{baht(s.total_deduction)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(s.net_pay)}</td>
                  <td className="px-3 py-2 text-center">{badge(s.status)}</td>
                  <td className="px-3 py-2 text-center">
                    <button type="button" onClick={() => openPrintPreview([s.id], s.payslip_no)}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
                      Print
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400 text-sm">
                  {slips.length === 0 ? "งวดนี้ยังไม่มีสลิป" : "ไม่พบสลิปที่ค้นหา"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <ERPModal
        open={!!printPreview}
        onClose={() => setPrintPreview(null)}
        size="xl"
        title="พิมพ์สลิปเงินเดือน"
        description={printPreview ? `${printPreview.title} - ตรวจตัวอย่างก่อนพิมพ์หรือบันทึก PDF` : ""}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">ตัวอย่างนี้ใช้หน้าพิมพ์เดิมของระบบ จึงยังเก็บ audit log การพิมพ์ผ่าน API กลาง</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                กระดาษ
                <select
                  value={printPaper}
                  onChange={(e) => changePrintPaper(e.target.value as PayslipPrintPaper)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="a6-landscape">A6 แนวนอน</option>
                  <option value="a5-landscape">A5 แนวนอน</option>
                </select>
              </label>
              {printPreview && <a href={printPreview.fullHref} target="_blank" rel="noreferrer" className="h-9 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">เปิดเต็มหน้า</a>}
              <button type="button" onClick={printPreviewFrame} disabled={!printPreview} className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                Print
              </button>
            </div>
          </div>
        }
      >
        {printPreview && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <iframe
              ref={printFrameRef}
              src={printPreview.href}
              title="Payslip print preview"
              className="h-[72vh] w-full bg-white"
            />
          </div>
        )}
      </ERPModal>
      <ERPModal
        open={!!registerPreview}
        onClose={() => setRegisterPreview(null)}
        size="xl"
        title="ทะเบียนเงินเดือน"
        description={registerPreview ? `${registerPreview.title} - ตรวจตัวอย่างก่อนพิมพ์หรือบันทึก PDF` : ""}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">รายงานนี้ดึงข้อมูลผ่าน API กลาง มีการตรวจสิทธิ์และบันทึก audit log เหมือนรายงาน Payroll อื่น</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                กระดาษ
                <select
                  value={registerPaper}
                  onChange={(e) => changeRegisterPaper(e.target.value as PayrollRegisterPaper)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="a4-landscape">A4 แนวนอน</option>
                  <option value="a3-landscape">A3 แนวนอน</option>
                </select>
              </label>
              {registerPreview && <a href={registerPreview.fullHref} target="_blank" rel="noreferrer" className="h-9 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">เปิดเต็มหน้า</a>}
              <button type="button" onClick={printRegisterFrame} disabled={!registerPreview} className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                Print
              </button>
            </div>
          </div>
        }
      >
        {registerPreview && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <iframe
              ref={registerFrameRef}
              src={registerPreview.href}
              title="Payroll register print preview"
              className="h-[72vh] w-full bg-white"
            />
          </div>
        )}
      </ERPModal>
    </div>
  );
}

function Card({ label, value, cls }: { label: string; value: ReactNode; cls: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="text-lg font-bold tabular-nums truncate">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}
